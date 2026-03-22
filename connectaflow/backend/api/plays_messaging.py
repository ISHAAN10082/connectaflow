"""
Plays Messaging Studio API.
Handles messaging play CRUD, AI generation, and email variant assembly.
Separate from the execution-layer Playbooks (playbooks.py).
"""
import uuid
from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlmodel import Session, select

from database import get_session
from api.deps import get_workspace_id
from models import (
    MessagingPlay, MessagingPlayCreate, MessagingPlayUpdate,
    PlayComponent, PlayVariation, PlayVariationCreate, PlayVariationUpdate,
    EmailVariant, GenerateMessagingRequest,
    ICP, Persona, GTMContext,
)

router = APIRouter(prefix="/plays-messaging", tags=["plays-messaging"])

COMPONENT_ORDER = [
    "subject", "greeting", "opener", "problem",
    "value_prop", "story", "cta", "closer", "variables",
]


# ── Play CRUD ─────────────────────────────────────────────────────────────────

@router.post("/", response_model=dict)
def create_play(
    payload: MessagingPlayCreate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    # Validate persona exists
    persona_id = uuid.UUID(payload.persona_id)
    persona = session.get(Persona, persona_id)
    if not persona or persona.workspace_id != workspace_id:
        raise HTTPException(status_code=400, detail="Persona not found in this workspace")

    # Validate ICP if provided
    icp_id = None
    if payload.icp_id:
        icp_id = uuid.UUID(payload.icp_id)
        icp = session.get(ICP, icp_id)
        if not icp or icp.workspace_id != workspace_id:
            raise HTTPException(status_code=400, detail="ICP not found in this workspace")

    play = MessagingPlay(
        workspace_id=workspace_id,
        mission_id=uuid.UUID(payload.mission_id),
        persona_id=persona_id,
        icp_id=icp_id,
        name=payload.name,
        global_instruction=payload.global_instruction,
    )
    session.add(play)
    session.commit()
    session.refresh(play)
    return _play_summary(play, session)


@router.get("/", response_model=dict)
def list_plays(
    mission_id: Optional[str] = None,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    q = select(MessagingPlay).where(MessagingPlay.workspace_id == workspace_id)
    if mission_id:
        q = q.where(MessagingPlay.mission_id == uuid.UUID(mission_id))

    plays = session.exec(q.order_by(MessagingPlay.created_at.desc())).all()  # type: ignore
    return {
        "plays": [_play_summary(p, session) for p in plays],
        "total": len(plays),
    }


@router.get("/{play_id}", response_model=dict)
def get_play(
    play_id: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    play = _get_play_or_404(play_id, workspace_id, session)
    return _play_detail(play, session)


@router.patch("/{play_id}", response_model=dict)
def update_play(
    play_id: str,
    payload: MessagingPlayUpdate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    play = _get_play_or_404(play_id, workspace_id, session)
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(play, field, value)
    play.updated_at = datetime.utcnow()
    session.add(play)
    session.commit()
    session.refresh(play)
    return _play_summary(play, session)


@router.delete("/{play_id}", response_model=dict)
def delete_play(
    play_id: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    play = _get_play_or_404(play_id, workspace_id, session)

    # Cascade delete components → variations
    components = session.exec(
        select(PlayComponent).where(PlayComponent.play_id == play.id)
    ).all()
    for comp in components:
        variations = session.exec(
            select(PlayVariation).where(PlayVariation.component_id == comp.id)
        ).all()
        for v in variations:
            session.delete(v)
        session.delete(comp)

    # Delete email variants
    for ev in session.exec(select(EmailVariant).where(EmailVariant.play_id == play.id)).all():
        session.delete(ev)

    session.delete(play)
    session.commit()
    return {"deleted": True}


# ── AI Generation ─────────────────────────────────────────────────────────────

@router.post("/{play_id}/generate-messaging", response_model=dict)
async def generate_messaging(
    play_id: str,
    payload: GenerateMessagingRequest,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Generate full messaging anatomy using LLM. Clears and replaces existing components."""
    from services.intelligence.plays_generator import generate_messaging_table
    play = _get_play_or_404(play_id, workspace_id, session)
    result = await generate_messaging_table(play.id, workspace_id, payload.instruction, session)
    return result


@router.post("/{play_id}/regenerate", response_model=dict)
async def regenerate_messaging(
    play_id: str,
    payload: GenerateMessagingRequest,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Regenerate all components with a new global instruction."""
    from services.intelligence.plays_generator import generate_messaging_table
    play = _get_play_or_404(play_id, workspace_id, session)
    # Update global instruction on play
    play.global_instruction = payload.instruction
    play.updated_at = datetime.utcnow()
    session.add(play)
    session.commit()
    result = await generate_messaging_table(play.id, workspace_id, payload.instruction, session)
    return result


@router.post("/{play_id}/generate-emails", response_model=dict)
def generate_emails(
    play_id: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Assemble 3-5 full email variants from existing components."""
    from services.intelligence.plays_generator import assemble_email_variants
    play = _get_play_or_404(play_id, workspace_id, session)
    variants = assemble_email_variants(play.id, workspace_id, session)
    return {"email_variants": variants, "count": len(variants)}


# ── Variations CRUD ───────────────────────────────────────────────────────────

@router.post("/variations", response_model=dict)
def add_variation(
    payload: PlayVariationCreate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    component_id = uuid.UUID(payload.component_id)
    component = session.get(PlayComponent, component_id)
    if not component or component.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Component not found")

    variation = PlayVariation(
        workspace_id=workspace_id,
        component_id=component_id,
        content=payload.content,
        tone=payload.tone,
        is_selected=payload.is_selected,
    )
    session.add(variation)
    session.commit()
    session.refresh(variation)
    return _variation_dict(variation)


@router.patch("/variations/{variation_id}", response_model=dict)
def update_variation(
    variation_id: str,
    payload: PlayVariationUpdate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    variation = session.exec(
        select(PlayVariation)
        .where(PlayVariation.id == uuid.UUID(variation_id))
        .where(PlayVariation.workspace_id == workspace_id)
    ).first()
    if not variation:
        raise HTTPException(status_code=404, detail="Variation not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(variation, field, value)
    session.add(variation)
    session.commit()
    session.refresh(variation)
    return _variation_dict(variation)


@router.delete("/variations/{variation_id}", response_model=dict)
def delete_variation(
    variation_id: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    variation = session.exec(
        select(PlayVariation)
        .where(PlayVariation.id == uuid.UUID(variation_id))
        .where(PlayVariation.workspace_id == workspace_id)
    ).first()
    if not variation:
        raise HTTPException(status_code=404, detail="Variation not found")
    session.delete(variation)
    session.commit()
    return {"deleted": True}


# ── Email Variants ────────────────────────────────────────────────────────────

@router.get("/{play_id}/email-variants", response_model=dict)
def list_email_variants(
    play_id: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    play = _get_play_or_404(play_id, workspace_id, session)
    variants = session.exec(
        select(EmailVariant).where(EmailVariant.play_id == play.id)
    ).all()
    return {
        "email_variants": [_email_variant_dict(v) for v in variants],
        "count": len(variants),
    }


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_play_or_404(play_id: str, workspace_id: uuid.UUID, session: Session) -> MessagingPlay:
    play = session.exec(
        select(MessagingPlay)
        .where(MessagingPlay.id == uuid.UUID(play_id))
        .where(MessagingPlay.workspace_id == workspace_id)
    ).first()
    if not play:
        raise HTTPException(status_code=404, detail="Messaging play not found")
    return play


def _play_summary(play: MessagingPlay, session: Session) -> dict:
    persona_name = ""
    icp_name = ""
    if play.persona_id:
        p = session.get(Persona, play.persona_id)
        if p:
            persona_name = p.name
    if play.icp_id:
        icp = session.get(ICP, play.icp_id)
        if icp:
            icp_name = icp.name

    component_count = len(session.exec(
        select(PlayComponent).where(PlayComponent.play_id == play.id)
    ).all())

    return {
        "id": str(play.id),
        "mission_id": str(play.mission_id),
        "persona_id": str(play.persona_id),
        "persona_name": persona_name,
        "icp_id": str(play.icp_id) if play.icp_id else None,
        "icp_name": icp_name,
        "name": play.name,
        "global_instruction": play.global_instruction,
        "status": play.status,
        "component_count": component_count,
        "created_at": play.created_at.isoformat(),
        "updated_at": play.updated_at.isoformat(),
    }


def _play_detail(play: MessagingPlay, session: Session) -> dict:
    summary = _play_summary(play, session)

    # Load components + variations in order
    components_raw = session.exec(
        select(PlayComponent)
        .where(PlayComponent.play_id == play.id)
        .order_by(PlayComponent.display_order)  # type: ignore
    ).all()

    components = []
    for comp in components_raw:
        variations = session.exec(
            select(PlayVariation)
            .where(PlayVariation.component_id == comp.id)
            .order_by(PlayVariation.created_at)  # type: ignore
        ).all()
        components.append({
            "id": str(comp.id),
            "component_type": comp.component_type,
            "display_order": comp.display_order,
            "variations": [_variation_dict(v) for v in variations],
        })

    # Email variants
    email_variants = session.exec(
        select(EmailVariant).where(EmailVariant.play_id == play.id)
    ).all()

    summary["components"] = components
    summary["email_variants"] = [_email_variant_dict(v) for v in email_variants]
    return summary


def _variation_dict(variation: PlayVariation) -> dict:
    return {
        "id": str(variation.id),
        "component_id": str(variation.component_id),
        "content": variation.content,
        "tone": variation.tone,
        "is_selected": variation.is_selected,
        "created_at": variation.created_at.isoformat(),
    }


def _email_variant_dict(variant: EmailVariant) -> dict:
    return {
        "id": str(variant.id),
        "play_id": str(variant.play_id),
        "subject": variant.subject,
        "body": variant.body,
        "style_label": variant.style_label,
        "smartlead_variant_id": variant.smartlead_variant_id,
        "created_at": variant.created_at.isoformat(),
    }
