from __future__ import annotations

import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from api.deps import get_workspace_id
from database import get_session
from models import Campaign, AZTest

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


class CampaignCreate(BaseModel):
    name: str
    hypothesis: str = ""
    icp_id: Optional[str] = None
    segment_id: Optional[str] = None
    messaging_id: Optional[str] = None
    sequence_id: Optional[str] = None
    az_test_variable: Optional[str] = None


@router.get("/")
def list_campaigns(
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    items = session.exec(select(Campaign).where(Campaign.workspace_id == workspace_id)).all()
    return {"campaigns": items}


@router.post("/")
def create_campaign(
    payload: CampaignCreate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    camp = Campaign(
        workspace_id=workspace_id,
        name=payload.name,
        hypothesis=payload.hypothesis,
        icp_id=uuid.UUID(payload.icp_id) if payload.icp_id else None,
        segment_id=uuid.UUID(payload.segment_id) if payload.segment_id else None,
        messaging_id=uuid.UUID(payload.messaging_id) if payload.messaging_id else None,
        sequence_id=uuid.UUID(payload.sequence_id) if payload.sequence_id else None,
    )
    session.add(camp)
    session.commit()
    session.refresh(camp)

    if payload.az_test_variable:
        az = AZTest(
            workspace_id=workspace_id,
            campaign_id=camp.id,
            test_variable=payload.az_test_variable,
        )
        session.add(az)
        session.commit()
        session.refresh(az)
        camp.az_test_id = az.id
        session.add(camp)
        session.commit()

    return camp


@router.get("/{campaign_id}")
def get_campaign(
    campaign_id: uuid.UUID,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    camp = session.get(Campaign, campaign_id)
    if not camp or camp.workspace_id != workspace_id:
        raise HTTPException(404, "Campaign not found")
    return camp
