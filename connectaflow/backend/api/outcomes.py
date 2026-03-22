"""
Outcomes & Analytics API.
Aggregates performance data across email (Smartlead), LinkedIn (CSV), and Cold Calls (CSV).
"""
import uuid
import io
import csv as csv_module
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from database import get_session
from api.deps import get_workspace_id
from models import (
    Lead, Reply, SmartleadStats, ManualActivityLog,
    ICPScore, MessagingPlay, Persona, Workspace,
)

router = APIRouter(prefix="/outcomes", tags=["outcomes"])


# ── Summary ───────────────────────────────────────────────────────────────────

@router.get("/summary", response_model=dict)
def get_summary(
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Top-level outcome metrics."""
    leads = session.exec(
        select(Lead).where(Lead.workspace_id == workspace_id)
    ).all()

    total_leads = len(leads)
    meetings_booked = sum(1 for l in leads if l.status == "Meeting Booked")
    contacted = sum(1 for l in leads if l.status in ("Contacted", "Replied", "Meeting Booked"))

    replies = session.exec(
        select(Reply).where(Reply.workspace_id == workspace_id)
    ).all()
    total_replies = len(replies)
    reply_rate = round((total_replies / contacted * 100), 1) if contacted > 0 else 0.0
    conversion_rate = round((meetings_booked / total_leads * 100), 1) if total_leads > 0 else 0.0

    # Return fractions (0-1) for rate fields; frontend multiplies by 100 for display
    return {
        "total_leads": total_leads,
        "contacted": contacted,
        "replied": total_replies,
        "reply_rate": round(total_replies / contacted, 3) if contacted > 0 else 0.0,
        "meetings_booked": meetings_booked,
        "conversion_rate": round(meetings_booked / total_leads, 3) if total_leads > 0 else 0.0,
    }


# ── By Channel ────────────────────────────────────────────────────────────────

@router.get("/by-channel", response_model=dict)
def by_channel(
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    # Email: from Smartlead
    sl_stats = session.exec(
        select(SmartleadStats)
        .where(SmartleadStats.workspace_id == workspace_id)
        .order_by(SmartleadStats.synced_at.desc())  # type: ignore
    ).all()

    email_totals = {"emails_sent": 0, "replies": 0, "reply_rate": 0.0, "meetings_booked": 0, "campaigns": []}
    for s in sl_stats:
        email_totals["emails_sent"] += s.emails_sent
        email_totals["replies"] += s.replies
        email_totals["meetings_booked"] += s.meetings_booked
        email_totals["campaigns"].append({
            "campaign_id": s.campaign_id,
            "campaign_name": s.campaign_name,
            "sent": s.emails_sent,
            "replies": s.replies,
            "reply_rate": f"{s.reply_rate:.1f}%",
            "meetings": s.meetings_booked,
            "synced_at": s.synced_at.isoformat(),
        })
    if email_totals["emails_sent"] > 0:
        email_totals["reply_rate"] = round(
            email_totals["replies"] / email_totals["emails_sent"] * 100, 1
        )

    last_sync = sl_stats[0].synced_at.isoformat() if sl_stats else None

    # LinkedIn: from manual activity logs
    linkedin_logs = session.exec(
        select(ManualActivityLog)
        .where(ManualActivityLog.workspace_id == workspace_id)
        .where(ManualActivityLog.channel == "linkedin")
    ).all()

    linkedin_totals = _aggregate_manual_logs(linkedin_logs)

    # Cold Calls: from manual activity logs
    call_logs = session.exec(
        select(ManualActivityLog)
        .where(ManualActivityLog.workspace_id == workspace_id)
        .where(ManualActivityLog.channel == "call")
    ).all()

    call_totals = _aggregate_manual_logs(call_logs)

    # Count from lead statuses — Meeting Booked regardless of channel
    meetings_total = session.exec(
        select(Lead)
        .where(Lead.workspace_id == workspace_id)
        .where(Lead.status == "Meeting Booked")
    ).all()

    return {
        "email": {**email_totals, "last_synced": last_sync},
        "linkedin": linkedin_totals,
        "calls": call_totals,
        "total_meetings_booked": len(meetings_total),
    }


# ── By Tier ───────────────────────────────────────────────────────────────────

@router.get("/by-tier", response_model=dict)
def by_tier(
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    scores = session.exec(
        select(ICPScore).where(ICPScore.workspace_id == workspace_id)
    ).all()
    domain_to_tier = {s.domain: s.tier for s in scores if s.tier}

    leads = session.exec(
        select(Lead).where(Lead.workspace_id == workspace_id)
    ).all()
    replies = session.exec(
        select(Reply).where(Reply.workspace_id == workspace_id)
    ).all()

    # Map lead_id → lead for reply lookups
    lead_map = {str(l.id): l for l in leads}

    tier_data = {"T1": _empty_tier(), "T2": _empty_tier(), "T3": _empty_tier(), "Unknown": _empty_tier()}

    for lead in leads:
        tier = domain_to_tier.get(lead.domain or "", "Unknown") or "Unknown"
        tier_data[tier]["total"] += 1
        if lead.status in ("Contacted", "Replied", "Meeting Booked"):
            tier_data[tier]["contacted"] += 1
        if lead.status == "Meeting Booked":
            tier_data[tier]["meetings_booked"] += 1

    for reply in replies:
        lead = lead_map.get(str(reply.lead_id)) if reply.lead_id else None
        if lead:
            tier = domain_to_tier.get(lead.domain or "", "Unknown") or "Unknown"
            tier_data[tier]["replies"] += 1

    # Compute rates as fractions (0-1); frontend multiplies by 100 for display
    for tier, data in tier_data.items():
        contacted = data["contacted"]
        data["reply_rate"] = round(data["replies"] / contacted, 3) if contacted > 0 else 0.0
        data["conversion_rate"] = round(data["meetings_booked"] / data["total"], 3) if data["total"] > 0 else 0.0

    return {"tiers": [{"tier": t, **data} for t, data in tier_data.items()]}


# ── By Play ───────────────────────────────────────────────────────────────────

@router.get("/by-play", response_model=dict)
def by_play(
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    plays = session.exec(
        select(MessagingPlay).where(MessagingPlay.workspace_id == workspace_id)
    ).all()
    replies = session.exec(
        select(Reply).where(Reply.workspace_id == workspace_id)
    ).all()

    play_reply_count = {}
    for r in replies:
        if r.play_id:
            pid = str(r.play_id)
            play_reply_count[pid] = play_reply_count.get(pid, 0) + 1

    result = []
    for play in plays:
        pid = str(play.id)
        result.append({
            "play_id": pid,
            "play_name": play.name,
            "replies": play_reply_count.get(pid, 0),
        })

    return {"by_play": result}


# ── By Persona ────────────────────────────────────────────────────────────────

@router.get("/by-persona", response_model=dict)
def by_persona(
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    plays = session.exec(
        select(MessagingPlay).where(MessagingPlay.workspace_id == workspace_id)
    ).all()
    replies = session.exec(
        select(Reply).where(Reply.workspace_id == workspace_id)
    ).all()

    play_to_persona = {str(p.id): str(p.persona_id) for p in plays}

    persona_reply_count = {}
    for r in replies:
        if r.play_id:
            pid = str(r.play_id)
            persona_id = play_to_persona.get(pid)
            if persona_id:
                persona_reply_count[persona_id] = persona_reply_count.get(persona_id, 0) + 1

    personas = session.exec(
        select(Persona).where(Persona.workspace_id == workspace_id)
    ).all()

    result = []
    for p in personas:
        pid = str(p.id)
        result.append({
            "persona_id": pid,
            "persona_name": p.name,
            "department": p.department,
            "replies": persona_reply_count.get(pid, 0),
        })

    return {"by_persona": result}


# ── Smartlead Sync ────────────────────────────────────────────────────────────

@router.post("/smartlead/sync", response_model=dict)
async def sync_smartlead(
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Pull data from Smartlead and store in smartlead_stats + replies."""
    from services.integrations.smartlead import get_smartlead_service
    from services.intelligence.reply_classifier import classify_reply

    workspace = session.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    service = get_smartlead_service(workspace.settings or {})
    if not service:
        raise HTTPException(
            status_code=400,
            detail="Smartlead API key not configured. Add it in workspace settings."
        )

    campaigns = await service.list_campaigns()
    synced_campaigns = 0
    synced_replies = 0

    for campaign in campaigns:
        campaign_id = str(campaign.get("id", ""))
        campaign_name = campaign.get("name", campaign_id)

        # Get stats
        stats = await service.get_campaign_stats(campaign_id)
        if stats:
            # Upsert SmartleadStats
            existing = session.exec(
                select(SmartleadStats)
                .where(SmartleadStats.campaign_id == campaign_id)
                .where(SmartleadStats.workspace_id == workspace_id)
            ).first()

            def _safe_float(v, default=0.0):
                try:
                    return float(v)
                except Exception:
                    return default

            def _safe_int(v, default=0):
                try:
                    return int(v)
                except Exception:
                    return default

            sl_stat = existing or SmartleadStats(
                workspace_id=workspace_id,
                campaign_id=campaign_id,
                campaign_name=campaign_name,
            )
            sl_stat.emails_sent = _safe_int(stats.get("total_email_sent") or stats.get("sent_count", 0))
            sl_stat.opens = _safe_int(stats.get("total_email_opened") or stats.get("open_count", 0))
            sl_stat.replies = _safe_int(stats.get("total_replied") or stats.get("reply_count", 0))
            sl_stat.open_rate = _safe_float(stats.get("open_rate", 0))
            sl_stat.reply_rate = _safe_float(stats.get("reply_rate", 0))
            sl_stat.meetings_booked = _safe_int(stats.get("meeting_count", 0))
            sl_stat.synced_at = datetime.utcnow()
            session.add(sl_stat)
            synced_campaigns += 1

        # Get replies
        replies_data = await service.get_all_replies(campaign_id)
        for r_data in replies_data:
            reply_text = r_data.get("reply_text", "").strip()
            if not reply_text:
                continue

            # Find lead by email
            lead_email = r_data.get("email", "")
            lead_id = None
            if lead_email:
                lead = session.exec(
                    select(Lead)
                    .where(Lead.email == lead_email)
                    .where(Lead.workspace_id == workspace_id)
                ).first()
                if lead:
                    lead_id = lead.id

            # Check duplicate (same text from same source)
            from models import Reply as ReplyModel
            dup = session.exec(
                select(ReplyModel)
                .where(ReplyModel.workspace_id == workspace_id)
                .where(ReplyModel.reply_text == reply_text[:500])
                .where(ReplyModel.source == "smartlead")
            ).first()
            if dup:
                continue

            from models import Reply as ReplyModel
            reply = ReplyModel(
                workspace_id=workspace_id,
                lead_id=lead_id,
                channel="email",
                reply_text=reply_text,
                source="smartlead",
            )
            session.add(reply)
            session.flush()

            # Classify
            try:
                cls = await classify_reply(reply_text)
                reply.classification = cls["classification"]
                reply.sentiment = cls["sentiment"]
                session.add(reply)
            except Exception:
                pass

            synced_replies += 1

    session.commit()
    return {
        "synced_campaigns": synced_campaigns,
        "synced_replies": synced_replies,
        "status": "ok",
    }


@router.get("/smartlead/stats", response_model=dict)
def get_smartlead_stats(
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    stats = session.exec(
        select(SmartleadStats)
        .where(SmartleadStats.workspace_id == workspace_id)
        .order_by(SmartleadStats.synced_at.desc())  # type: ignore
    ).all()
    return {
        "stats": [
            {
                "id": str(s.id),
                "campaign_id": s.campaign_id,
                "campaign_name": s.campaign_name,
                "emails_sent": s.emails_sent,
                "opens": s.opens,
                "open_rate": s.open_rate,
                "replies": s.replies,
                "reply_rate": s.reply_rate,
                "meetings_booked": s.meetings_booked,
                "synced_at": s.synced_at.isoformat(),
            }
            for s in stats
        ],
        "total": len(stats),
    }


# ── CSV Upload ────────────────────────────────────────────────────────────────

@router.post("/upload/linkedin", response_model=dict)
async def upload_linkedin_csv(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    return await _process_manual_csv(file, "linkedin", session, workspace_id)


@router.post("/upload/calls", response_model=dict)
async def upload_calls_csv(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    return await _process_manual_csv(file, "call", session, workspace_id)


async def _process_manual_csv(
    file: UploadFile,
    channel: str,
    session: Session,
    workspace_id: uuid.UUID,
) -> dict:
    content = await file.read()
    text = content.decode("utf-8", errors="replace")
    reader = csv_module.DictReader(io.StringIO(text))

    created = 0
    errors = []

    for i, row in enumerate(reader):
        lead_email = row.get("lead_email", "").strip()
        status = row.get("status", "sent").strip() or "sent"
        notes = row.get("notes", "").strip()

        activity_date = datetime.utcnow()
        if row.get("date"):
            try:
                activity_date = datetime.fromisoformat(row["date"].replace("Z", "+00:00"))
            except Exception:
                pass

        call_duration = None
        if channel == "call" and row.get("call_duration"):
            try:
                call_duration = int(row["call_duration"])
            except Exception:
                pass

        log = ManualActivityLog(
            workspace_id=workspace_id,
            lead_email=lead_email or None,
            lead_name=row.get("lead_name", "").strip() or None,
            company=row.get("company", "").strip() or None,
            channel=channel,
            activity_date=activity_date,
            status=status,
            notes=notes or None,
            call_duration=call_duration,
        )
        session.add(log)
        created += 1

    session.commit()
    return {"created": created, "errors": errors[:10]}


# ── CSV Templates ─────────────────────────────────────────────────────────────

@router.get("/templates/linkedin")
def download_linkedin_template():
    headers = ["lead_email", "lead_name", "company", "date", "status", "notes"]
    sample = ["john@acme.com", "John Smith", "Acme Corp", "2026-03-15", "replied", "Interested in demo"]
    return _csv_response("linkedin_template.csv", headers, [sample])


@router.get("/templates/calls")
def download_calls_template():
    headers = ["lead_email", "lead_name", "company", "date", "status", "notes", "call_duration"]
    sample = ["john@acme.com", "John Smith", "Acme Corp", "2026-03-15", "replied", "Left voicemail", "120"]
    return _csv_response("calls_template.csv", headers, [sample])


def _csv_response(filename: str, headers: list[str], rows: list[list]) -> StreamingResponse:
    output = io.StringIO()
    writer = csv_module.writer(output)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _aggregate_manual_logs(logs: list[ManualActivityLog]) -> dict:
    total = len(logs)
    replied = sum(1 for l in logs if l.status in ("replied", "meeting_booked"))
    meetings = sum(1 for l in logs if l.status == "meeting_booked")
    return {
        "attempted": total,
        "replies": replied,
        "reply_rate": round(replied / total, 3) if total > 0 else 0.0,
        "meetings": meetings,
    }


def _empty_tier() -> dict:
    return {"total": 0, "contacted": 0, "replies": 0, "meetings_booked": 0, "reply_rate": 0.0, "conversion_rate": 0.0}
