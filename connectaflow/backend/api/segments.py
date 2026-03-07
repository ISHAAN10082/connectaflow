from __future__ import annotations

import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from api.deps import get_workspace_id
from database import get_session
from models import Segment

router = APIRouter(prefix="/segments", tags=["segments"])


class SegmentCreate(BaseModel):
    list_id: str
    name: str
    filters: dict = {}


@router.get("/")
def list_segments(
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    items = session.exec(select(Segment).where(Segment.workspace_id == workspace_id)).all()
    return {"segments": items}


@router.post("/")
def create_segment(
    payload: SegmentCreate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    seg = Segment(
        workspace_id=workspace_id,
        list_id=uuid.UUID(payload.list_id),
        name=payload.name,
        filters=payload.filters,
    )
    session.add(seg)
    session.commit()
    session.refresh(seg)
    return seg


@router.get("/{segment_id}")
def get_segment(
    segment_id: uuid.UUID,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    seg = session.get(Segment, segment_id)
    if not seg or seg.workspace_id != workspace_id:
        raise HTTPException(404, "Segment not found")
    return seg
