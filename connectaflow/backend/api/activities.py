"""
Activities API: log and retrieve outreach activities per lead / account.
Every outreach action (email send, LinkedIn touch, call) is recorded here
so the Replies and Outcomes modules can trace full engagement history.
"""
import uuid
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from api.deps import get_workspace_id
from database import get_session
from models import Activity, Lead, Workspace
from services.records import ensure_account_for_domain, sync_lead_account

router = APIRouter(prefix="/activities", tags=["activities"])


# ── Request schema ─────────────────────────────────────────────────────────────

class ActivityCreate(BaseModel):
    lead_id: Optional[str] = None
    account_id: Optional[str] = None
    account_domain: Optional[str] = None
    play_id: Optional[str] = None
    email_variant_id: Optional[str] = None
    channel: str  # email | linkedin | call
    notes: Optional[str] = None
    occurred_at: Optional[datetime] = None


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/", response_model=dict)
async def log_activity(
    payload: ActivityCreate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Log a new outreach activity."""
    if not payload.lead_id and not payload.account_domain:
        raise HTTPException(400, "Either lead_id or account_domain is required")

    if payload.channel not in ("email", "linkedin", "call"):
        raise HTTPException(400, "channel must be one of: email, linkedin, call")

    lead = session.get(Lead, uuid.UUID(payload.lead_id)) if payload.lead_id else None
    if lead and lead.workspace_id != workspace_id:
        raise HTTPException(404, "Lead not found")

    account_domain = payload.account_domain or (lead.domain if lead else None)
    account = ensure_account_for_domain(
        session,
        workspace_id,
        account_domain,
        name=(lead.custom_data or {}).get("company_name") if lead and isinstance(lead.custom_data, dict) else None,
    )
    if lead and lead.company_id is None:
        sync_lead_account(session, workspace_id, lead)

    activity = Activity(
        workspace_id=workspace_id,
        lead_id=lead.id if lead else None,
        account_id=uuid.UUID(payload.account_id) if payload.account_id else (account.id if account else None),
        account_domain=account.domain if account else account_domain,
        play_id=uuid.UUID(payload.play_id) if payload.play_id else None,
        email_variant_id=uuid.UUID(payload.email_variant_id) if payload.email_variant_id else None,
        channel=payload.channel,
        notes=payload.notes,
        occurred_at=payload.occurred_at or datetime.utcnow(),
    )
    session.add(activity)

    # Increment contacts_without_reply on the linked lead (for cooldown tracking)
    if lead:
        lead.contacts_without_reply = (lead.contacts_without_reply or 0) + 1
        lead.updated_at = datetime.utcnow()
        session.add(lead)

        workspace = session.get(Workspace, workspace_id)
        settings = (workspace.settings or {}) if workspace else {}
        threshold = int(settings.get("cooldown_contact_threshold") or 3)
        cooldown_months = int(settings.get("cooldown_months") or 6)

        if lead.contacts_without_reply >= threshold and lead.status not in ("Cool Down", "Replied", "Meeting Booked"):
            impacted_leads = [lead]
            if lead.domain:
                impacted_leads = session.exec(
                    select(Lead)
                    .where(Lead.workspace_id == workspace_id)
                    .where(Lead.domain == lead.domain)
                ).all()

            cooldown_until = datetime.utcnow() + timedelta(days=max(cooldown_months, 1) * 30)
            for impacted in impacted_leads:
                if impacted.status in ("Replied", "Meeting Booked"):
                    continue
                impacted.status = "Cool Down"
                impacted.cooldown_until = cooldown_until
                impacted.updated_at = datetime.utcnow()
                session.add(impacted)

    session.commit()
    session.refresh(activity)
    return _activity_dict(activity)


@router.get("/", response_model=dict)
def list_activities(
    lead_id: Optional[str] = Query(default=None),
    domain: Optional[str] = Query(default=None),
    channel: Optional[str] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """List activities, optionally filtered by lead or account domain."""
    query = select(Activity).where(Activity.workspace_id == workspace_id)

    if lead_id:
        query = query.where(Activity.lead_id == uuid.UUID(lead_id))
    if domain:
        query = query.where(Activity.account_domain == domain)
    if channel:
        query = query.where(Activity.channel == channel)

    query = query.order_by(Activity.occurred_at.desc())  # type: ignore

    total_q = query  # reuse filter for count
    activities = session.exec(query.offset(skip).limit(limit)).all()

    return {
        "activities": [_activity_dict(a) for a in activities],
        "skip": skip,
        "limit": limit,
    }


@router.get("/{activity_id}", response_model=dict)
def get_activity(
    activity_id: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Get a single activity by ID."""
    activity = session.get(Activity, uuid.UUID(activity_id))
    if not activity or activity.workspace_id != workspace_id:
        raise HTTPException(404, "Activity not found")
    return _activity_dict(activity)


@router.delete("/{activity_id}", response_model=dict)
def delete_activity(
    activity_id: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Delete an activity log entry."""
    activity = session.get(Activity, uuid.UUID(activity_id))
    if not activity or activity.workspace_id != workspace_id:
        raise HTTPException(404, "Activity not found")
    session.delete(activity)
    session.commit()
    return {"message": "Activity deleted"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _activity_dict(a: Activity) -> dict:
    return {
        "id": str(a.id),
        "workspace_id": str(a.workspace_id),
        "lead_id": str(a.lead_id) if a.lead_id else None,
        "account_id": str(a.account_id) if a.account_id else None,
        "account_domain": a.account_domain,
        "play_id": str(a.play_id) if a.play_id else None,
        "email_variant_id": str(a.email_variant_id) if a.email_variant_id else None,
        "channel": a.channel,
        "notes": a.notes,
        "occurred_at": a.occurred_at.isoformat(),
    }
