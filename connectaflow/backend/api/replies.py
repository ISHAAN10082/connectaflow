"""
Replies API — central inbox for all reply types.
Supports manual entry, CSV upload, and AI classification.
"""
import uuid
import io
import csv as csv_module
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlmodel import Session, select

from database import get_session
from api.deps import get_workspace_id
from models import Reply, ReplyCreate, Lead
from services.intelligence.reply_classifier import classify_reply, extract_top_objections

router = APIRouter(prefix="/replies", tags=["replies"])


# ── Create reply + auto-classify ─────────────────────────────────────────────

@router.post("/", response_model=dict)
async def create_reply(
    payload: ReplyCreate,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    lead_id = uuid.UUID(payload.lead_id) if payload.lead_id else None
    activity_id = uuid.UUID(payload.activity_id) if payload.activity_id else None
    play_id = uuid.UUID(payload.play_id) if payload.play_id else None

    reply = Reply(
        workspace_id=workspace_id,
        lead_id=lead_id,
        activity_id=activity_id,
        play_id=play_id,
        channel=payload.channel,
        reply_text=payload.reply_text,
        source=payload.source,
        received_at=payload.received_at or datetime.utcnow(),
    )
    session.add(reply)
    session.commit()
    session.refresh(reply)

    # Classify async in background
    background_tasks.add_task(_classify_and_update, reply.id, payload.reply_text, session)

    return _reply_dict(reply, session)


async def _classify_and_update(reply_id: uuid.UUID, text: str, session: Session):
    """Background task: classify reply and update record."""
    try:
        result = await classify_reply(text)
        with Session(session.get_bind()) as s:
            reply = s.get(Reply, reply_id)
            if reply:
                reply.classification = result["classification"]
                reply.sentiment = result["sentiment"]
                s.add(reply)
                s.commit()
    except Exception:
        pass


# ── List replies ──────────────────────────────────────────────────────────────

@router.get("/", response_model=dict)
def list_replies(
    lead_id: Optional[str] = None,
    channel: Optional[str] = None,
    classification: Optional[str] = None,
    play_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    q = select(Reply).where(Reply.workspace_id == workspace_id)

    if lead_id:
        q = q.where(Reply.lead_id == uuid.UUID(lead_id))
    if channel:
        q = q.where(Reply.channel == channel)
    if classification:
        q = q.where(Reply.classification == classification.lower())
    if play_id:
        q = q.where(Reply.play_id == uuid.UUID(play_id))

    total = len(session.exec(q).all())
    replies = session.exec(q.order_by(Reply.received_at.desc()).offset(skip).limit(limit)).all()  # type: ignore

    return {
        "replies": [_reply_dict(r, session) for r in replies],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


# ── Get single reply ──────────────────────────────────────────────────────────

@router.get("/{reply_id}", response_model=dict)
def get_reply(
    reply_id: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    reply = session.exec(
        select(Reply)
        .where(Reply.id == uuid.UUID(reply_id))
        .where(Reply.workspace_id == workspace_id)
    ).first()
    if not reply:
        raise HTTPException(status_code=404, detail="Reply not found")
    return _reply_dict(reply, session)


# ── Insights endpoint ─────────────────────────────────────────────────────────

@router.get("/insights/summary", response_model=dict)
async def get_reply_insights(
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Returns top objections + sentiment split across all replies."""
    all_replies = session.exec(
        select(Reply).where(Reply.workspace_id == workspace_id)
    ).all()

    sentiment_split = {"interested": 0, "objection": 0, "neutral": 0, "ooo": 0, "unclassified": 0}
    for r in all_replies:
        cls = (r.classification or "unclassified").lower()
        if cls in sentiment_split:
            sentiment_split[cls] += 1
        else:
            sentiment_split["unclassified"] += 1

    objection_texts = [
        r.reply_text for r in all_replies
        if r.classification == "objection" and r.reply_text
    ]
    top_objections = await extract_top_objections(objection_texts)

    return {
        "sentiment_split": sentiment_split,
        "top_objections": top_objections,
        "total_replies": len(all_replies),
    }


# ── CSV Upload ────────────────────────────────────────────────────────────────

@router.post("/upload-csv", response_model=dict)
async def upload_replies_csv(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    channel: str = "email",
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """
    Upload CSV of replies for any channel.
    Expected columns: lead_email, reply_text, [received_at]
    """
    content = await file.read()
    text = content.decode("utf-8", errors="replace")
    reader = csv_module.DictReader(io.StringIO(text))

    created = 0
    errors = []
    reply_ids = []

    for i, row in enumerate(reader):
        reply_text = row.get("reply_text", "").strip()
        lead_email = row.get("lead_email", "").strip()

        if not reply_text:
            errors.append(f"Row {i+2}: missing reply_text")
            continue

        # Find lead by email
        lead_id = None
        if lead_email:
            lead = session.exec(
                select(Lead)
                .where(Lead.email == lead_email)
                .where(Lead.workspace_id == workspace_id)
            ).first()
            if lead:
                lead_id = lead.id

        received_at = datetime.utcnow()
        if row.get("received_at"):
            try:
                received_at = datetime.fromisoformat(row["received_at"].replace("Z", "+00:00"))
            except Exception:
                pass

        reply = Reply(
            workspace_id=workspace_id,
            lead_id=lead_id,
            channel=channel,
            reply_text=reply_text,
            source="manual_csv",
            received_at=received_at,
        )
        session.add(reply)
        session.flush()
        reply_ids.append(reply.id)
        created += 1

    session.commit()

    # Classify in background
    for rid in reply_ids:
        r = session.get(Reply, rid)
        if r:
            background_tasks.add_task(_classify_and_update, r.id, r.reply_text, session)

    return {
        "created": created,
        "errors": errors[:10],
    }


# ── Delete reply ──────────────────────────────────────────────────────────────

@router.delete("/{reply_id}", response_model=dict)
def delete_reply(
    reply_id: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    reply = session.exec(
        select(Reply)
        .where(Reply.id == uuid.UUID(reply_id))
        .where(Reply.workspace_id == workspace_id)
    ).first()
    if not reply:
        raise HTTPException(status_code=404, detail="Reply not found")
    session.delete(reply)
    session.commit()
    return {"deleted": True}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _reply_dict(reply: Reply, session: Session) -> dict:
    lead_info = None
    if reply.lead_id:
        lead = session.get(Lead, reply.lead_id)
        if lead:
            lead_info = {
                "id": str(lead.id),
                "name": f"{lead.first_name or ''} {lead.last_name or ''}".strip(),
                "email": lead.email,
                "domain": lead.domain,
                "status": lead.status,
            }
    return {
        "id": str(reply.id),
        "workspace_id": str(reply.workspace_id),
        "lead_id": str(reply.lead_id) if reply.lead_id else None,
        "lead": lead_info,
        "activity_id": str(reply.activity_id) if reply.activity_id else None,
        "play_id": str(reply.play_id) if reply.play_id else None,
        "channel": reply.channel,
        "reply_text": reply.reply_text,
        "classification": reply.classification,
        "sentiment": reply.sentiment,
        "source": reply.source,
        "received_at": reply.received_at.isoformat() if reply.received_at else None,
    }
