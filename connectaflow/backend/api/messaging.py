from __future__ import annotations

import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from api.deps import get_workspace_id
from database import get_session
from models import MessagingSet, MessagingSequence, MessagingStep, MessagingVariant

router = APIRouter(prefix="/messaging", tags=["messaging"])


class MessagingSetCreate(BaseModel):
    name: str
    icp_id: Optional[str] = None
    persona_id: Optional[str] = None
    motion_intent_id: Optional[str] = None


class SequenceCreate(BaseModel):
    step_count: int = 5
    cadence_config: dict = {}


class StepCreate(BaseModel):
    step_number: int
    label: str
    day_offset: int = 0
    tone: str = "neutral"


class VariantCreate(BaseModel):
    step_number: int
    component: str
    label: str
    content: str


@router.get("/")
def list_messaging_sets(
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    items = session.exec(select(MessagingSet).where(MessagingSet.workspace_id == workspace_id)).all()
    return {"messaging_sets": items}


@router.post("/")
def create_messaging_set(
    payload: MessagingSetCreate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    ms = MessagingSet(
        workspace_id=workspace_id,
        name=payload.name,
        icp_id=uuid.UUID(payload.icp_id) if payload.icp_id else None,
        persona_id=uuid.UUID(payload.persona_id) if payload.persona_id else None,
        motion_intent_id=uuid.UUID(payload.motion_intent_id) if payload.motion_intent_id else None,
    )
    session.add(ms)
    session.commit()
    session.refresh(ms)
    return ms


@router.get("/{messaging_id}")
def get_messaging_set(
    messaging_id: uuid.UUID,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    ms = session.get(MessagingSet, messaging_id)
    if not ms or ms.workspace_id != workspace_id:
        raise HTTPException(404, "Messaging set not found")

    seqs = session.exec(select(MessagingSequence).where(MessagingSequence.messaging_id == messaging_id)).all()
    variants = session.exec(select(MessagingVariant).where(MessagingVariant.messaging_id == messaging_id)).all()
    return {"messaging": ms, "sequences": seqs, "variants": variants}


@router.post("/{messaging_id}/sequences")
def create_sequence(
    messaging_id: uuid.UUID,
    payload: SequenceCreate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    ms = session.get(MessagingSet, messaging_id)
    if not ms or ms.workspace_id != workspace_id:
        raise HTTPException(404, "Messaging set not found")

    seq = MessagingSequence(
        workspace_id=workspace_id,
        messaging_id=messaging_id,
        step_count=payload.step_count,
        cadence_config=payload.cadence_config,
    )
    session.add(seq)
    session.commit()
    session.refresh(seq)
    return seq


@router.post("/{messaging_id}/steps")
def add_step(
    messaging_id: uuid.UUID,
    payload: StepCreate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    ms = session.get(MessagingSet, messaging_id)
    if not ms or ms.workspace_id != workspace_id:
        raise HTTPException(404, "Messaging set not found")

    seq = session.exec(
        select(MessagingSequence).where(MessagingSequence.messaging_id == messaging_id)
    ).first()
    if not seq:
        raise HTTPException(400, "Create a sequence first")

    step = MessagingStep(
        workspace_id=workspace_id,
        sequence_id=seq.id,
        step_number=payload.step_number,
        label=payload.label,
        day_offset=payload.day_offset,
        tone=payload.tone,
    )
    session.add(step)
    session.commit()
    session.refresh(step)
    return step


@router.post("/{messaging_id}/variants")
def add_variant(
    messaging_id: uuid.UUID,
    payload: VariantCreate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    ms = session.get(MessagingSet, messaging_id)
    if not ms or ms.workspace_id != workspace_id:
        raise HTTPException(404, "Messaging set not found")

    variant = MessagingVariant(
        workspace_id=workspace_id,
        messaging_id=messaging_id,
        step_number=payload.step_number,
        component=payload.component,
        label=payload.label,
        content=payload.content,
    )
    session.add(variant)
    session.commit()
    session.refresh(variant)
    return variant
