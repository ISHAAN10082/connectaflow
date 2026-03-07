"""
Leads API: CRUD with proper input schemas.
Fixed: route ordering, input validation, pagination.
"""
import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from database import get_session
from models import Lead, LeadCreate, LeadUpdate, CustomField, CompanyProfile

router = APIRouter(prefix="/leads", tags=["leads"])


# ── Custom fields routes FIRST (fix route ordering) ──────────

@router.delete("/fields/{field_name}")
async def delete_custom_field(field_name: str, session: Session = Depends(get_session)):
    """Delete a custom field definition."""
    field = session.exec(select(CustomField).where(CustomField.name == field_name)).first()
    if not field:
        raise HTTPException(404, "Field not found")
    session.delete(field)
    session.commit()
    return {"message": "Field deleted"}


@router.get("/fields")
async def get_custom_fields(session: Session = Depends(get_session)):
    """List all custom field definitions."""
    fields = session.exec(select(CustomField)).all()
    return fields


@router.post("/fields")
async def create_custom_field(field: CustomField, session: Session = Depends(get_session)):
    """Create a new custom field definition."""
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
    session: Session = Depends(get_session),
):
    """List leads with pagination."""
    query = select(Lead)
    if status:
        query = query.where(Lead.status == status)
    query = query.offset(skip).limit(limit)
    leads = session.exec(query).all()

    # Get total count
    total_query = select(Lead)
    if status:
        total_query = total_query.where(Lead.status == status)
    total = len(session.exec(total_query).all())

    # Enrich with company profile data if available
    results = []
    for lead in leads:
        lead_dict = lead.model_dump()
        if lead.domain:
            profile = session.get(CompanyProfile, lead.domain)
            if profile:
                lead_dict["company_profile"] = {
                    "name": profile.name,
                    "quality_score": profile.quality_score,
                    "quality_tier": profile.quality_tier,
                    "enriched_data": profile.enriched_data,
                    "sources_used": profile.sources_used,
                }
        results.append(lead_dict)

    return {"leads": results, "total": total, "skip": skip, "limit": limit}


@router.post("/")
async def create_lead(lead: LeadCreate, session: Session = Depends(get_session)):
    """Create a new lead using validated input schema."""
    new_lead = Lead(
        email=lead.email,
        first_name=lead.first_name,
        last_name=lead.last_name,
        domain=lead.domain,
        status=lead.status,
        custom_data=lead.custom_data,
    )
    session.add(new_lead)
    session.commit()
    session.refresh(new_lead)
    return new_lead


@router.get("/{lead_id}")
async def get_lead(lead_id: str, session: Session = Depends(get_session)):
    """Get a single lead."""
    lead = session.get(Lead, uuid.UUID(lead_id))
    if not lead:
        raise HTTPException(404, "Lead not found")

    result = lead.model_dump()
    if lead.domain:
        profile = session.get(CompanyProfile, lead.domain)
        if profile:
            result["company_profile"] = {
                "name": profile.name,
                "quality_score": profile.quality_score,
                "quality_tier": profile.quality_tier,
                "enriched_data": profile.enriched_data,
                "sources_used": profile.sources_used,
                "enriched_at": str(profile.enriched_at) if profile.enriched_at else None,
            }
    return result


@router.patch("/{lead_id}")
async def update_lead(lead_id: str, update: LeadUpdate, session: Session = Depends(get_session)):
    """Update a lead using validated input schema."""
    lead = session.get(Lead, uuid.UUID(lead_id))
    if not lead:
        raise HTTPException(404, "Lead not found")

    update_data = update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(lead, key, value)

    lead.updated_at = datetime.utcnow()
    session.add(lead)
    session.commit()
    session.refresh(lead)
    return lead


@router.delete("/{lead_id}")
async def delete_lead(lead_id: str, session: Session = Depends(get_session)):
    """Delete a lead."""
    lead = session.get(Lead, uuid.UUID(lead_id))
    if not lead:
        raise HTTPException(404, "Lead not found")
    session.delete(lead)
    session.commit()
    return {"message": "Lead deleted"}
