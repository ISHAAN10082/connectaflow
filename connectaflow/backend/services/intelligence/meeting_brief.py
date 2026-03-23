"""
Meeting Brief Generator.
Triggered when a lead is marked as "Meeting Booked".
Assembles context from enrichment, ICP score, signals, and notes.
Returns a structured JSON brief.
"""
import json
import os
import uuid
from datetime import datetime
from typing import Optional
from loguru import logger
from sqlmodel import Session, select

from models import Lead, CompanyProfile, ICPScore, Signal, MeetingBrief, Activity, Reply


async def generate_meeting_brief(
    lead_id: uuid.UUID,
    workspace_id: uuid.UUID,
    session: Session,
) -> dict:
    """
    Generate a 1-page meeting preparation brief for a lead.
    Stores it in meeting_briefs table and returns the content_json.
    """
    from config import settings
    import litellm

    # ── Assemble context ─────────────────────────────────────────────────────
    lead = session.get(Lead, lead_id)
    if not lead:
        return {"error": "Lead not found"}

    # Company profile
    profile_data = {}
    icp_fit_info = {}
    signal_info = []

    if lead.domain:
        profile = session.exec(
            select(CompanyProfile)
            .where(CompanyProfile.domain == lead.domain)
            .where(CompanyProfile.workspace_id == workspace_id)
        ).first()
        if profile:
            ed = profile.enriched_data or {}
            profile_data = {
                k: (v.get("value") if isinstance(v, dict) else v)
                for k, v in ed.items()
                if v is not None
            }

        # ICP score
        icp_score = session.exec(
            select(ICPScore)
            .where(ICPScore.domain == lead.domain)
            .where(ICPScore.workspace_id == workspace_id)
            .order_by(ICPScore.scored_at.desc())  # type: ignore
        ).first()
        if icp_score:
            icp_fit_info = {
                "final_score": round(icp_score.final_score or 0, 1),
                "fit_category": icp_score.fit_category,
                "tier": icp_score.tier or "N/A",
                "criterion_breakdown": {
                    k: round(v.get("adjusted_score", 0), 1) if isinstance(v, dict) else v
                    for k, v in (icp_score.criterion_scores or {}).items()
                },
            }

        # Signals
        signals = session.exec(
            select(Signal)
            .where(Signal.domain == lead.domain)
            .where(Signal.workspace_id == workspace_id)
        ).all()
        for sig in signals:
            signal_info.append({
                "type": sig.signal_type,
                "strength": round(sig.strength, 2),
                "evidence": sig.evidence or "",
            })

    # Notes from custom_data
    notes = ""
    if lead.custom_data:
        notes = lead.custom_data.get("notes", "") or ""

    interaction_lines: list[str] = []
    replies = session.exec(
        select(Reply)
        .where(Reply.workspace_id == workspace_id)
        .where(Reply.lead_id == lead.id)
        .order_by(Reply.received_at.desc())  # type: ignore
    ).all()
    for reply in replies[:5]:
        interaction_lines.append(
            f"Reply via {reply.channel} on {reply.received_at.date().isoformat()}: {reply.reply_text[:240]}"
        )

    activities = session.exec(
        select(Activity)
        .where(Activity.workspace_id == workspace_id)
        .where(Activity.lead_id == lead.id)
        .order_by(Activity.occurred_at.desc())  # type: ignore
    ).all()
    for activity in activities[:5]:
        if activity.notes:
            interaction_lines.append(
                f"Activity via {activity.channel} on {activity.occurred_at.date().isoformat()}: {activity.notes[:180]}"
            )

    if notes:
        interaction_lines.append(f"Operator notes: {notes}")
    conversation_history = "\n".join(interaction_lines[:8]).strip()

    # ── Build LLM prompt ─────────────────────────────────────────────────────
    context_str = json.dumps({
        "lead": {
            "name": f"{lead.first_name or ''} {lead.last_name or ''}".strip(),
            "email": lead.email,
            "domain": lead.domain,
        },
        "company_profile": profile_data,
        "icp_score": icp_fit_info,
        "signals": signal_info,
        "conversation_history": conversation_history,
    }, default=str)

    prompt = (
        "You are a sales preparation assistant. Generate a 1-page meeting prep brief.\n\n"
        f"DATA:\n{context_str}\n\n"
        "Return ONLY valid JSON with this exact structure:\n"
        "{\n"
        '  "company_overview": "2-3 sentence summary of the company",\n'
        '  "icp_fit_score": <number 0-100>,\n'
        '  "icp_fit_reason": "brief explanation of why they scored this way",\n'
        '  "icp_tier": "T1/T2/T3 or N/A",\n'
        '  "active_signals": ["signal description 1", "signal description 2"],\n'
        '  "conversation_history": "summary of prior interactions and notes",\n'
        '  "key_talking_points": ["point 1", "point 2", "point 3", "point 4", "point 5"],\n'
        '  "likely_objections": ["objection 1", "objection 2"],\n'
        '  "suggested_questions": ["question 1", "question 2", "question 3"]\n'
        "}\n"
        "No markdown, no explanation. Return only the JSON."
    )

    # ── LLM call ─────────────────────────────────────────────────────────────
    content_json = _fallback_brief(lead, icp_fit_info, signal_info, conversation_history)

    if settings.has_any_llm_provider():
        model, api_key_env = _get_provider()
        try:
            response = await litellm.acompletion(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                api_key=os.getenv(api_key_env),
                temperature=0.3,
                max_tokens=1500,
            )
            raw = response.choices[0].message.content.strip()
            if raw.startswith("```"):
                lines = raw.split("\n")
                raw = "\n".join(lines[1:])
                if raw.endswith("```"):
                    raw = raw.rsplit("```", 1)[0]
            content_json = json.loads(raw)
        except Exception as e:
            logger.warning(f"Meeting brief generation failed, using fallback: {e}")

    # ── Store in DB ───────────────────────────────────────────────────────────
    # Check for existing brief for this lead
    existing = session.exec(
        select(MeetingBrief)
        .where(MeetingBrief.lead_id == lead_id)
        .where(MeetingBrief.workspace_id == workspace_id)
    ).first()

    if existing:
        existing.content_json = content_json
        existing.generated_at = datetime.utcnow()
        session.add(existing)
    else:
        brief = MeetingBrief(
            workspace_id=workspace_id,
            lead_id=lead_id,
            content_json=content_json,
        )
        session.add(brief)

    session.commit()
    return content_json


def _fallback_brief(lead: Lead, icp_fit_info: dict, signals: list, notes: str) -> dict:
    """Fallback brief when LLM is not available."""
    signal_descs = [f"{s['type'].replace('_', ' ').title()}: {s['evidence']}" for s in signals]
    return {
        "company_overview": f"Company at {lead.domain or 'unknown domain'}.",
        "icp_fit_score": icp_fit_info.get("final_score", 0),
        "icp_fit_reason": f"Category: {icp_fit_info.get('fit_category', 'unscored')}",
        "icp_tier": icp_fit_info.get("tier", "N/A"),
        "active_signals": signal_descs[:5],
        "conversation_history": notes or "No prior notes recorded.",
        "key_talking_points": ["Review ICP fit details", "Discuss active signals", "Understand pain points"],
        "likely_objections": ["No historical objections recorded"],
        "suggested_questions": ["What are your current challenges?", "What does success look like?"],
    }


def _get_provider() -> tuple[str, str]:
    from config import settings
    if settings.GROQ_API_KEY:
        return "groq/llama-3.3-70b-versatile", "GROQ_API_KEY"
    if settings.GEMINI_API_KEY:
        return "gemini/gemini-2.0-flash", "GEMINI_API_KEY"
    return "", ""
