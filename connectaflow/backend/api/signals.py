"""
Signals API: warm signal queue ranked by ICP × Signal × Recency.
"""
import math
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


@router.get("/queue")
async def get_signal_queue(
    icp_id: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """
    Warm signal queue: ranked by composite_score = icp_score × signal_strength × recency_decay.
    This is the "who to call today" list.
    """
    signals = session.exec(select(Signal).where(Signal.workspace_id == workspace_id)).all()

    # Group signals by domain
    domain_signals: dict[str, list[Signal]] = {}
    for s in signals:
        domain_signals.setdefault(s.domain, []).append(s)

    queue = []
    for domain, sigs in domain_signals.items():
        # Get company profile
        profile = session.get(CompanyProfile, domain)
        if not profile or profile.workspace_id != workspace_id:
            continue

        # Get ICP score if available
        icp_score_val = 50.0  # default if no ICP score
        if icp_id:
            import uuid
            icp_score_obj = session.exec(
                select(ICPScore)
                .where(ICPScore.domain == domain)
                .where(ICPScore.icp_id == uuid.UUID(icp_id))
                .where(ICPScore.workspace_id == workspace_id)
            ).first()
            if icp_score_obj and icp_score_obj.final_score:
                icp_score_val = icp_score_obj.final_score

        # Compute composite score for each signal
        best_signal_score = 0
        signal_details = []
        for sig in sigs:
            decay = _recency_decay(sig.detected_at)
            composite = (icp_score_val / 100) * sig.strength * decay
            best_signal_score = max(best_signal_score, composite)
            signal_details.append({
                "type": sig.signal_type,
                "strength": sig.strength,
                "recency_decay": round(decay, 2),
                "evidence": sig.evidence,
                "source_url": sig.source_url,
                "detected_at": str(sig.detected_at),
                "age_days": round((datetime.utcnow() - sig.detected_at).total_seconds() / 86400, 1),
            })

        queue.append({
            "domain": domain,
            "company_name": profile.name or domain,
            "composite_score": round(best_signal_score * 100, 1),
            "icp_score": round(icp_score_val, 1),
            "quality_score": round(profile.quality_score * 100, 1),
            "signals": signal_details,
            "signal_count": len(sigs),
        })

    # Sort by composite score descending
    queue.sort(key=lambda x: x["composite_score"], reverse=True)
    return {"queue": queue[:limit], "total": len(queue)}


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
