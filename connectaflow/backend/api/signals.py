"""
Signals API: warm signal queue ranked by ICP × Signal × Recency.
"""
import math
import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from api.deps import get_workspace_id
from database import get_session
from models import Signal, CompanyProfile, ICPScore

router = APIRouter(prefix="/signals", tags=["signals"])


def _recency_decay(detected_at: datetime, half_life_days: float = 14.0) -> float:
    """Exponential decay: signal loses half its value every half_life_days."""
    age_days = (datetime.utcnow() - detected_at).total_seconds() / 86400
    return math.exp(-0.693 * age_days / half_life_days)


def _priority_band(composite_score: float, quality_score: float) -> str:
    if composite_score >= 70 and quality_score >= 45:
        return "act_now"
    if composite_score >= 50 and quality_score >= 30:
        return "work_soon"
    return "review_first"


def _recommended_action(priority_band: str) -> str:
    if priority_band == "act_now":
        return "Route into execution now"
    if priority_band == "work_soon":
        return "Prepare contacts and queue next"
    return "Review evidence before acting"


def _signal_display_type(signal_type: str) -> str:
    return signal_type.replace("_", " ").title()


@router.get("/queue")
async def get_signal_queue(
    icp_id: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    q: Optional[str] = Query(None),
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """
    Warm signal queue: ranked by composite_score = icp_score × signal_strength × recency_decay.
    This is the "who to call today" list.
    """
    signals = session.exec(
        select(Signal)
        .where(Signal.workspace_id == workspace_id)
        .order_by(Signal.detected_at.desc())
    ).all()

    # Group signals by domain
    domain_signals: dict[str, list[Signal]] = {}
    for s in signals:
        domain_signals.setdefault(s.domain, []).append(s)

    queue = []
    for domain, sigs in domain_signals.items():
        profile = session.exec(
            select(CompanyProfile)
            .where(CompanyProfile.domain == domain)
            .where(CompanyProfile.workspace_id == workspace_id)
        ).first()
        if not profile:
            continue

        icp_score_val = 50.0
        if icp_id:
            icp_score_obj = session.exec(
                select(ICPScore)
                .where(ICPScore.domain == domain)
                .where(ICPScore.icp_id == uuid.UUID(icp_id))
                .where(ICPScore.workspace_id == workspace_id)
            ).first()
            if icp_score_obj and icp_score_obj.final_score:
                icp_score_val = icp_score_obj.final_score

        deduped_signals: dict[str, tuple[float, Signal, float]] = {}
        for sig in sigs:
            decay = _recency_decay(sig.detected_at)
            effective_strength = sig.strength * decay
            current = deduped_signals.get(sig.signal_type)
            if current is None or effective_strength > current[0]:
                deduped_signals[sig.signal_type] = (effective_strength, sig, decay)

        active_signal_types = set(deduped_signals.keys())
        if any(signal_type.startswith("hiring_") for signal_type in active_signal_types):
            deduped_signals.pop("not_hiring", None)

        ranked_signals = sorted(deduped_signals.values(), key=lambda item: item[0], reverse=True)
        signal_weights = [1.0, 0.65, 0.4]
        blended_signal = sum(
            effective * signal_weights[idx]
            for idx, (effective, _sig, _decay) in enumerate(ranked_signals[: len(signal_weights)])
        )
        signal_score = min(blended_signal, 1.0) * 100.0
        quality_score = max(0.0, min(1.0, profile.quality_score or 0.0)) * 100.0

        composite_score = (
            (icp_score_val * 0.45)
            + (signal_score * 0.35)
            + (quality_score * 0.20)
        )
        if quality_score < 35:
            composite_score *= 0.85
        if len(ranked_signals) >= 3:
            composite_score = min(100.0, composite_score + 3.0)

        signal_details = []
        for effective_strength, sig, decay in ranked_signals:
            signal_details.append({
                "type": sig.signal_type,
                "label": _signal_display_type(sig.signal_type),
                "strength": sig.strength,
                "effective_strength": round(effective_strength * 100, 1),
                "recency_decay": round(decay, 2),
                "evidence": sig.evidence,
                "source_url": sig.source_url,
                "detected_at": str(sig.detected_at),
                "age_days": round((datetime.utcnow() - sig.detected_at).total_seconds() / 86400, 1),
            })

        top_signal_labels = ", ".join(detail["label"] for detail in signal_details[:2]) or "No ranked signals"
        priority_band = _priority_band(composite_score, quality_score)
        queue.append({
            "domain": domain,
            "company_name": profile.name or domain,
            "composite_score": round(composite_score, 1),
            "icp_score": round(icp_score_val, 1),
            "quality_score": round(quality_score, 1),
            "signal_score": round(signal_score, 1),
            "signals": signal_details,
            "signal_count": len(signal_details),
            "priority_band": priority_band,
            "recommended_action": _recommended_action(priority_band),
            "ranking_reason": f"{top_signal_labels} with {round(quality_score)}% evidence quality",
        })

    if q:
        query_text = q.strip().lower()
        queue = [
            item for item in queue
            if query_text in item["domain"].lower()
            or query_text in item["company_name"].lower()
            or any(
                query_text in signal["type"].lower()
                or query_text in (signal.get("label") or "").lower()
                or query_text in (signal.get("evidence") or "").lower()
                for signal in item["signals"]
            )
        ]

    queue.sort(key=lambda x: x["composite_score"], reverse=True)
    total = len(queue)
    paged_queue = queue[skip: skip + limit]

    summary = {
        "act_now": sum(1 for item in queue if item["priority_band"] == "act_now"),
        "work_soon": sum(1 for item in queue if item["priority_band"] == "work_soon"),
        "review_first": sum(1 for item in queue if item["priority_band"] == "review_first"),
    }
    return {"queue": paged_queue, "total": total, "summary": summary}


@router.get("/")
async def list_all_signals(
    domain: Optional[str] = None,
    signal_type: Optional[str] = None,
    limit: int = Query(100, ge=1, le=500),
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """List signals with optional filters."""
    query = select(Signal).where(Signal.workspace_id == workspace_id)
    if domain:
        query = query.where(Signal.domain == domain)
    if signal_type:
        query = query.where(Signal.signal_type == signal_type)
    query = query.limit(limit)

    signals = session.exec(query).all()
    return {"signals": signals, "total": len(signals)}
