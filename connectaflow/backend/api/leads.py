from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select
from typing import List
from ..database import get_session
from ..models import Lead
import uuid

router = APIRouter(prefix="/api/leads", tags=["leads"])

@router.post("/", response_model=Lead)
async def create_lead(lead: Lead, session: Session = Depends(get_session)):
    session.add(lead)
    session.commit()
    session.refresh(lead)
    return lead

@router.get("/", response_model=List[Lead])
async def read_leads(
    offset: int = 0,
    limit: int = Query(default=50, le=100),
    session: Session = Depends(get_session)
):
    leads = session.exec(select(Lead).offset(offset).limit(limit)).all()
    return leads

@router.get("/{lead_id}", response_model=Lead)
async def read_lead(lead_id: uuid.UUID, session: Session = Depends(get_session)):
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead

@router.patch("/{lead_id}", response_model=Lead)
async def update_lead(lead_id: uuid.UUID, lead_update: Lead, session: Session = Depends(get_session)):
    db_lead = session.get(Lead, lead_id)
    if not db_lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    lead_data = lead_update.model_dump(exclude_unset=True)
    for key, value in lead_data.items():
        setattr(db_lead, key, value)
        
    session.add(db_lead)
    session.commit()
    session.refresh(db_lead)
    return db_lead

@router.delete("/{lead_id}")
async def delete_lead(lead_id: uuid.UUID, session: Session = Depends(get_session)):
    lead = session.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    session.delete(lead)
    session.commit()
    return {"ok": True}

@router.delete("/fields/{field_name}")
async def delete_custom_field(field_name: str, session: Session = Depends(get_session)):
    """
    Remove a custom field from ALL leads.
    """
    leads = session.exec(select(Lead)).all()
    count = 0
    
    for lead in leads:
        if lead.custom_data and field_name in lead.custom_data:
            # Create a copy to ensure SQLAlchemy detects change
            new_data = dict(lead.custom_data)
            del new_data[field_name]
            lead.custom_data = new_data
            session.add(lead)
            count += 1
            
    if count > 0:
        session.commit()
        
    return {"message": f"Removed field '{field_name}' from {count} leads"}
