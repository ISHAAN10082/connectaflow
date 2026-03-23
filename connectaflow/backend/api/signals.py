"""
Signals API: warm signal queue ranked by ICP × Signal × Recency.
"""
import io
import csv
import math
import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from api.deps import get_workspace_id
from database import get_session
from models import Signal, CompanyProfile, ICPScore, ExternalSignal
from services.records import ensure_account_for_domain

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


# ── External Signals ──────────────────────────────────────────────────────────

@router.get("/external", response_model=dict)
def list_external_signals(
    status: Optional[str] = None,
    icp_id: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """
    List external signals discovered by the background discovery job.
    Filtered by status (new | dismissed | added) and optionally matched ICP.
    """
    q = select(ExternalSignal).where(ExternalSignal.workspace_id == workspace_id)
    if status:
        q = q.where(ExternalSignal.status == status.lower())
    if icp_id:
        q = q.where(ExternalSignal.matched_icp_id == uuid.UUID(icp_id))

    total = len(session.exec(q).all())
    signals = session.exec(
        q.order_by(ExternalSignal.discovered_at.desc())  # type: ignore
        .offset(skip)
        .limit(limit)
    ).all()
    return {
        "signals": [_ext_signal_dict(s) for s in signals],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.patch("/external/{signal_id}", response_model=dict)
def update_external_signal(
    signal_id: str,
    status: str,  # new | dismissed | added
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Update the status of an external signal (dismiss or mark as added)."""
    signal = session.exec(
        select(ExternalSignal)
        .where(ExternalSignal.id == uuid.UUID(signal_id))
        .where(ExternalSignal.workspace_id == workspace_id)
    ).first()
    if not signal:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="External signal not found")
    allowed = {"new", "dismissed", "added"}
    if status.lower() not in allowed:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"status must be one of {allowed}")
    signal.status = status.lower()

    if signal.status == "added":
        profile = session.exec(
            select(CompanyProfile)
            .where(CompanyProfile.workspace_id == workspace_id)
            .where(CompanyProfile.domain == signal.domain)
        ).first()

        if not profile:
            quality_score = max(0.45, min(signal.confidence or 0.65, 0.95))
            quality_tier = "high" if quality_score >= 0.75 else "medium" if quality_score >= 0.55 else "low"
            profile = CompanyProfile(
                workspace_id=workspace_id,
                domain=signal.domain,
                name=signal.company_name or signal.domain,
                enriched_data={
                    "company_name": {
                        "value": signal.company_name or signal.domain,
                        "confidence": max(signal.confidence or 0.7, 0.55),
                        "source": "external_discovery",
                        "source_url": signal.source_url,
                        "evidence": signal.evidence or "Imported from external discovery feed.",
                    },
                    "company_description": {
                        "value": signal.evidence or f"Imported from external discovery via {signal.signal_type}.",
                        "confidence": max((signal.confidence or 0.65) * 0.8, 0.4),
                        "source": "external_discovery",
                        "source_url": signal.source_url,
                        "evidence": signal.evidence or "",
                    },
                },
                quality_score=quality_score,
                quality_tier=quality_tier,
                sources_used=["external_discovery"],
                enriched_at=datetime.utcnow(),
                fetch_metadata={
                    "source": "external_discovery",
                    "signal_type": signal.signal_type,
                    "imported_from_external_signal_id": str(signal.id),
                },
            )
        else:
            profile.name = profile.name or signal.company_name or signal.domain
            current_sources = list(profile.sources_used or [])
            if "external_discovery" not in current_sources:
                current_sources.append("external_discovery")
            profile.sources_used = current_sources
            profile.fetch_metadata = {
                **(profile.fetch_metadata or {}),
                "last_external_signal_import": str(signal.id),
                "last_external_signal_type": signal.signal_type,
            }
            if signal.company_name and "company_name" not in (profile.enriched_data or {}):
                profile.enriched_data = {
                    **(profile.enriched_data or {}),
                    "company_name": {
                        "value": signal.company_name,
                        "confidence": max(signal.confidence or 0.7, 0.55),
                        "source": "external_discovery",
                        "source_url": signal.source_url,
                        "evidence": signal.evidence or "",
                    },
                }
        session.add(profile)

        internal_signal = session.exec(
            select(Signal)
            .where(Signal.workspace_id == workspace_id)
            .where(Signal.domain == signal.domain)
            .where(Signal.signal_type == signal.signal_type)
            .where(Signal.evidence == signal.evidence)
        ).first()
        if not internal_signal:
            internal_signal = Signal(
                workspace_id=workspace_id,
                domain=signal.domain,
                signal_type=signal.signal_type,
                strength=max(signal.strength, signal.relevance, 0.35),
                source_url=signal.source_url,
                evidence=signal.evidence,
                detected_at=signal.discovered_at,
            )
            session.add(internal_signal)

        ensure_account_for_domain(
            session,
            workspace_id,
            signal.domain,
            name=signal.company_name,
            touch_signal=True,
        )

    session.add(signal)
    session.commit()
    session.refresh(signal)
    return _ext_signal_dict(signal)


@router.get("/external/download")
def download_external_signals(
    status: Optional[str] = None,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Download external signals as CSV."""
    q = select(ExternalSignal).where(ExternalSignal.workspace_id == workspace_id)
    if status:
        q = q.where(ExternalSignal.status == status.lower())
    signals = session.exec(q.order_by(ExternalSignal.discovered_at.desc())).all()  # type: ignore

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "domain", "company_name", "signal_type", "strength",
        "relevance", "confidence", "evidence", "source_url",
        "matched_icp_id", "status", "discovered_at",
    ])
    for s in signals:
        writer.writerow([
            s.domain, s.company_name or "", s.signal_type,
            round(s.strength, 3), round(s.relevance, 3), round(s.confidence, 3),
            s.evidence or "", s.source_url or "",
            str(s.matched_icp_id) if s.matched_icp_id else "",
            s.status, s.discovered_at.isoformat(),
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=external_signals.csv"},
    )


def _ext_signal_dict(s: ExternalSignal) -> dict:
    return {
        "id": str(s.id),
        "domain": s.domain,
        "company_name": s.company_name,
        "signal_type": s.signal_type,
        "strength": round(s.strength, 3),
        "relevance": round(s.relevance, 3),
        "confidence": round(s.confidence, 3),
        "evidence": s.evidence,
        "source_url": s.source_url,
        "matched_icp_id": str(s.matched_icp_id) if s.matched_icp_id else None,
        "status": s.status,
        "discovered_at": s.discovered_at.isoformat(),
    }
