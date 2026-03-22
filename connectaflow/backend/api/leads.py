"""
Leads API: CRUD with proper input schemas.
Fixed: route ordering, input validation, pagination.
"""
import uuid
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select
from sqlalchemy import func, or_

from api.deps import get_workspace_id
from database import get_session
from models import Lead, LeadCreate, LeadUpdate, CustomField, CompanyProfile, ICPScore

router = APIRouter(prefix="/leads", tags=["leads"])


# ── Custom fields routes FIRST (fix route ordering) ──────────

@router.delete("/fields/{field_name}")
async def delete_custom_field(
    field_name: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Delete a custom field definition."""
    field = session.exec(
        select(CustomField)
        .where(CustomField.name == field_name)
        .where(CustomField.workspace_id == workspace_id)
    ).first()
    if not field:
        raise HTTPException(404, "Field not found")
    session.delete(field)
    session.commit()
    return {"message": "Field deleted"}


@router.get("/fields")
async def get_custom_fields(
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """List all custom field definitions."""
    fields = session.exec(select(CustomField).where(CustomField.workspace_id == workspace_id)).all()
    return fields


@router.post("/fields")
async def create_custom_field(
    field: CustomField,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Create a new custom field definition."""
    field.workspace_id = workspace_id
    session.add(field)
    session.commit()
    session.refresh(field)
    return field


# ── Lead CRUD ─────────────────────────────────────────────────

@router.get("/")
async def get_leads(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    status: Optional[str] = None,
    q: Optional[str] = None,
    enriched_only: bool = False,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """List leads with pagination."""
    query = select(Lead).where(Lead.workspace_id == workspace_id)
    if status:
        query = query.where(Lead.status == status)
    if enriched_only:
        query = query.where(Lead.domain.is_not(None))
    if q:
        pattern = f"%{q.strip().lower()}%"
        query = query.where(or_(
            func.lower(func.coalesce(Lead.email, "")).like(pattern),
            func.lower(func.coalesce(Lead.first_name, "")).like(pattern),
            func.lower(func.coalesce(Lead.last_name, "")).like(pattern),
            func.lower(func.coalesce(Lead.domain, "")).like(pattern),
            func.lower(func.coalesce(Lead.status, "")).like(pattern),
        ))
    query = query.order_by(Lead.updated_at.desc(), Lead.created_at.desc())
    query = query.offset(skip).limit(limit)
    leads = session.exec(query).all()

    total_query = select(func.count()).select_from(Lead).where(Lead.workspace_id == workspace_id)
    if status:
        total_query = total_query.where(Lead.status == status)
    if enriched_only:
        total_query = total_query.where(Lead.domain.is_not(None))
    if q:
        pattern = f"%{q.strip().lower()}%"
        total_query = total_query.where(or_(
            func.lower(func.coalesce(Lead.email, "")).like(pattern),
            func.lower(func.coalesce(Lead.first_name, "")).like(pattern),
            func.lower(func.coalesce(Lead.last_name, "")).like(pattern),
            func.lower(func.coalesce(Lead.domain, "")).like(pattern),
            func.lower(func.coalesce(Lead.status, "")).like(pattern),
        ))
    total = session.exec(total_query).one()

    # Enrich with company profile data if available
    results = []
    for lead in leads:
        lead_dict = lead.model_dump()
        if lead.domain:
            profile = session.exec(
                select(CompanyProfile)
                .where(CompanyProfile.domain == lead.domain)
                .where(CompanyProfile.workspace_id == workspace_id)
            ).first()
            if profile:
                lead_dict["company_profile"] = {
                    "name": profile.name,
                    "quality_score": profile.quality_score,
                    "quality_tier": profile.quality_tier,
                    "enriched_data": profile.enriched_data,
                    "sources_used": profile.sources_used,
                    "enriched_at": str(profile.enriched_at) if profile.enriched_at else None,
                    "fetch_metadata": profile.fetch_metadata,
                }
        results.append(lead_dict)

    return {"leads": results, "total": total, "skip": skip, "limit": limit}


@router.post("/")
async def create_lead(
    lead: LeadCreate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Create a new lead using validated input schema."""
    new_lead = Lead(
        email=lead.email,
        first_name=lead.first_name,
        last_name=lead.last_name,
        domain=lead.domain,
        status=lead.status,
        custom_data=lead.custom_data,
        workspace_id=workspace_id,
    )
    session.add(new_lead)
    session.commit()
    session.refresh(new_lead)
    return new_lead


@router.get("/{lead_id}")
async def get_lead(
    lead_id: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Get a single lead."""
    lead = session.get(Lead, uuid.UUID(lead_id))
    if not lead or lead.workspace_id != workspace_id:
        raise HTTPException(404, "Lead not found")

    result = lead.model_dump()
    if lead.domain:
        profile = session.exec(
            select(CompanyProfile)
            .where(CompanyProfile.domain == lead.domain)
            .where(CompanyProfile.workspace_id == workspace_id)
        ).first()
        if profile:
            result["company_profile"] = {
                "name": profile.name,
                "quality_score": profile.quality_score,
                "quality_tier": profile.quality_tier,
                "enriched_data": profile.enriched_data,
                "sources_used": profile.sources_used,
                "enriched_at": str(profile.enriched_at) if profile.enriched_at else None,
            }
        # Include ICP tier if scored
        icp_score = session.exec(
            select(ICPScore)
            .where(ICPScore.domain == lead.domain)
            .where(ICPScore.workspace_id == workspace_id)
        ).first()
        if icp_score:
            result["icp_tier"] = icp_score.tier
            result["icp_final_score"] = icp_score.final_score
    return result


@router.patch("/{lead_id}")
async def update_lead(
    lead_id: str,
    update: LeadUpdate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Update a lead using validated input schema."""
    lead = session.get(Lead, uuid.UUID(lead_id))
    if not lead or lead.workspace_id != workspace_id:
        raise HTTPException(404, "Lead not found")

    update_data = update.model_dump(exclude_unset=True)

    # Auto-set cooldown_until when status transitions to Cool Down
    new_status = update_data.get("status")
    if new_status == "Cool Down" and lead.status != "Cool Down":
        if "cooldown_until" not in update_data:
            update_data["cooldown_until"] = datetime.utcnow() + timedelta(days=180)
    # Clear cooldown when transitioning away from Cool Down
    elif new_status and new_status != "Cool Down" and lead.status == "Cool Down":
        update_data.setdefault("cooldown_until", None)
        update_data.setdefault("contacts_without_reply", 0)

    for key, value in update_data.items():
        setattr(lead, key, value)

    lead.updated_at = datetime.utcnow()
    session.add(lead)
    session.commit()
    session.refresh(lead)
    return lead


@router.delete("/{lead_id}")
async def delete_lead(
    lead_id: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Delete a lead."""
    lead = session.get(Lead, uuid.UUID(lead_id))
    if not lead or lead.workspace_id != workspace_id:
        raise HTTPException(404, "Lead not found")
    session.delete(lead)
    session.commit()
    return {"message": "Lead deleted"}


# ── Cool-Down Management ──────────────────────────────────────────────────────

@router.post("/{lead_id}/cooldown")
async def start_cooldown(
    lead_id: str,
    months: int = 6,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """
    Place a lead in cool-down for the specified number of months (default 6).
    Sets status → 'Cool Down' and records cooldown_until timestamp.
    """
    lead = session.get(Lead, uuid.UUID(lead_id))
    if not lead or lead.workspace_id != workspace_id:
        raise HTTPException(404, "Lead not found")

    lead.status = "Cool Down"
    lead.cooldown_until = datetime.utcnow() + timedelta(days=months * 30)
    lead.updated_at = datetime.utcnow()
    session.add(lead)
    session.commit()
    session.refresh(lead)
    return {
        "id": str(lead.id),
        "status": lead.status,
        "cooldown_until": lead.cooldown_until.isoformat() if lead.cooldown_until else None,
    }


@router.delete("/{lead_id}/cooldown")
async def end_cooldown(
    lead_id: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """
    Remove a lead from cool-down.
    Clears cooldown_until, resets contacts_without_reply, sets status → 'Not Contacted'.
    """
    lead = session.get(Lead, uuid.UUID(lead_id))
    if not lead or lead.workspace_id != workspace_id:
        raise HTTPException(404, "Lead not found")

    lead.status = "Not Contacted"
    lead.cooldown_until = None
    lead.contacts_without_reply = 0
    lead.updated_at = datetime.utcnow()
    session.add(lead)
    session.commit()
    session.refresh(lead)
    return {
        "id": str(lead.id),
        "status": lead.status,
        "cooldown_until": None,
    }


# ── Meeting Brief ─────────────────────────────────────────────────────────────

@router.post("/{lead_id}/meeting-brief")
async def generate_meeting_brief_endpoint(
    lead_id: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """
    Generate (or regenerate) a 1-page meeting prep brief for this lead.
    Triggered when a lead is marked Meeting Booked.
    Returns structured JSON brief.
    """
    from services.intelligence.meeting_brief import generate_meeting_brief
    lead = session.get(Lead, uuid.UUID(lead_id))
    if not lead or lead.workspace_id != workspace_id:
        raise HTTPException(404, "Lead not found")
    brief = await generate_meeting_brief(lead.id, workspace_id, session)
    return brief


@router.get("/{lead_id}/meeting-brief")
async def get_meeting_brief_endpoint(
    lead_id: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """
    Get the latest meeting prep brief for a lead.
    Returns 404 if no brief has been generated yet.
    """
    from models import MeetingBrief
    from sqlmodel import select as sql_select
    lead = session.get(Lead, uuid.UUID(lead_id))
    if not lead or lead.workspace_id != workspace_id:
        raise HTTPException(404, "Lead not found")
    brief = session.exec(
        sql_select(MeetingBrief)
        .where(MeetingBrief.lead_id == lead.id)
        .where(MeetingBrief.workspace_id == workspace_id)
        .order_by(MeetingBrief.generated_at.desc())  # type: ignore
    ).first()
    if not brief:
        raise HTTPException(404, "No meeting brief found for this lead")
    return {
        "id": str(brief.id),
        "lead_id": str(brief.lead_id),
        "content_json": brief.content_json,
        "generated_at": brief.generated_at.isoformat(),
    }
