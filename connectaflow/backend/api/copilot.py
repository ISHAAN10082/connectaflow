"""
AI Copilot API — system-wide intelligence layer.
Answers natural language questions about the GTM system state.
"""
import uuid
import json
import os
from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from pydantic import BaseModel

from database import get_session
from api.deps import get_workspace_id
from models import (
    GTMContext, ICPScore, Signal, Lead, Reply, SmartleadStats, Workspace
)

router = APIRouter(prefix="/copilot", tags=["copilot"])


class CopilotQuery(BaseModel):
    query: str
    mission_id: str = ""


@router.post("/query", response_model=dict)
async def query_copilot(
    payload: CopilotQuery,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """
    Answer a natural language question about the GTM system state.
    Assembles context from missions, scores, signals, leads, replies, and outcomes.
    """
    from config import settings
    import litellm

    context = _assemble_context(workspace_id, payload.mission_id, session)

    if not settings.has_any_llm_provider():
        return {
            "answer": "No LLM provider configured. Please set GROQ_API_KEY or GEMINI_API_KEY.",
            "context_summary": context,
        }

    workspace = session.get(Workspace, workspace_id)
    workspace_name = workspace.name if workspace else "your workspace"

    prompt = (
        f"You are a GTM performance advisor for '{workspace_name}'.\n"
        "Answer the user's question using only the data provided below.\n"
        "Be specific, actionable, and concise (max 3 short paragraphs or 5 bullet points).\n"
        "If the data doesn't contain enough information, say so clearly.\n\n"
        f"GTM CONTEXT DATA:\n{json.dumps(context, default=str)}\n\n"
        f"USER QUESTION: {payload.query}"
    )

    model, api_key_env = _get_provider()
    try:
        response = await litellm.acompletion(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            api_key=os.getenv(api_key_env),
            temperature=0.4,
            max_tokens=600,
        )
        answer = response.choices[0].message.content.strip()
    except Exception as e:
        answer = f"Unable to generate answer: {str(e)}"

    return {
        "answer": answer,
        "context_summary": {
            "missions": context.get("missions_count", 0),
            "leads": context.get("leads_count", 0),
            "replies": context.get("replies_count", 0),
        },
    }


def _assemble_context(workspace_id: uuid.UUID, mission_id: str, session: Session) -> dict:
    """Assemble lightweight context for LLM."""
    # Missions
    missions = session.exec(
        select(GTMContext).where(GTMContext.workspace_id == workspace_id)
    ).all()
    missions_data = [{"name": m.name, "status": m.status} for m in missions[:5]]

    # ICP scores distribution
    scores = session.exec(
        select(ICPScore).where(ICPScore.workspace_id == workspace_id)
    ).all()
    tier_dist = {"T1": 0, "T2": 0, "T3": 0}
    for s in scores:
        if s.tier in tier_dist:
            tier_dist[s.tier] += 1
    fit_dist = {}
    for s in scores:
        fit_dist[s.fit_category] = fit_dist.get(s.fit_category, 0) + 1

    # Lead status distribution
    leads = session.exec(
        select(Lead).where(Lead.workspace_id == workspace_id)
    ).all()
    status_dist = {}
    for l in leads:
        status_dist[l.status] = status_dist.get(l.status, 0) + 1

    # Top signals
    signals = session.exec(
        select(Signal)
        .where(Signal.workspace_id == workspace_id)
        .order_by(Signal.strength.desc())  # type: ignore
        .limit(5)
    ).all()
    top_signals = [{"domain": s.domain, "type": s.signal_type, "strength": s.strength} for s in signals]

    # Replies in last 30 days
    replies = session.exec(
        select(Reply).where(Reply.workspace_id == workspace_id)
    ).all()
    reply_cls = {}
    for r in replies:
        cls = r.classification or "unclassified"
        reply_cls[cls] = reply_cls.get(cls, 0) + 1

    # Last Smartlead sync
    sl_stats = session.exec(
        select(SmartleadStats)
        .where(SmartleadStats.workspace_id == workspace_id)
        .order_by(SmartleadStats.synced_at.desc())  # type: ignore
        .limit(3)
    ).all()
    email_stats = [
        {
            "campaign": s.campaign_name,
            "sent": s.emails_sent,
            "replies": s.replies,
            "reply_rate": f"{s.reply_rate:.1f}%",
            "meetings": s.meetings_booked,
        }
        for s in sl_stats
    ]

    return {
        "missions_count": len(missions),
        "missions": missions_data,
        "leads_count": len(leads),
        "lead_status_distribution": status_dist,
        "icp_tier_distribution": tier_dist,
        "icp_fit_distribution": fit_dist,
        "top_signals": top_signals,
        "replies_count": len(replies),
        "reply_classification": reply_cls,
        "email_campaign_stats": email_stats,
    }


def _get_provider() -> tuple[str, str]:
    from config import settings
    if settings.GROQ_API_KEY:
        return "groq/llama-3.3-70b-versatile", "GROQ_API_KEY"
    if settings.GEMINI_API_KEY:
        return "gemini/gemini-2.0-flash", "GEMINI_API_KEY"
    return "", ""
