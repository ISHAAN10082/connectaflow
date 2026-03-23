"""
GTM Intelligence API — strategy layer.
CRUD for GTM contexts, personas, buying triggers, signal definitions, and plays.
AI generation endpoint to auto-create all from product context.
"""
import uuid
import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlmodel import Session, select
from pydantic import BaseModel
from loguru import logger

from api.deps import get_workspace_id
from config import settings
from database import get_session
from models import (
    GTMContext, Persona, BuyingTrigger, SignalDefinition, GTMPlay,
    GTMContextCreate, GTMContextUpdate, PersonaCreate,
    BuyingTriggerCreate, SignalDefinitionCreate, GTMPlayCreate,
    ICPDefinition, MotionIntent,
    ICP, ICPCreate, ICPUpdate,
)
from datetime import datetime
from services.icp_sync import (
    ensure_embedded_context_icp,
    sync_context_icp_state,
    sync_mission_icp_definition,
)

router = APIRouter(prefix="/gtm", tags=["gtm-intelligence"])


def _context_quality(ctx: GTMContext) -> int:
    from services.intelligence.context_parser import compute_context_quality
    return compute_context_quality({
        "company_name": ctx.company_name,
        "website_url": ctx.website_url,
        "product_description": ctx.product_description,
        "core_problem": ctx.core_problem,
        "product_category": ctx.product_category,
        "pricing_model": ctx.pricing_model,
        "avg_deal_size": ctx.avg_deal_size,
        "customer_examples": ctx.customer_examples,
        "competitors": ctx.competitors,
        "geographic_focus": ctx.geographic_focus,
    })


# ─── Helpers ──────────────────────────────────────────────────

def _uuid(val):
    return uuid.UUID(val) if val else None

def _str_uuid(val):
    return str(val) if val else None


def _serialize_persona(p: Persona) -> dict:
    return {**p.model_dump(), "id": str(p.id), "gtm_context_id": str(p.gtm_context_id)}

def _serialize_trigger(t: BuyingTrigger) -> dict:
    return {**t.model_dump(), "id": str(t.id), "gtm_context_id": str(t.gtm_context_id)}

def _serialize_signal_def(s: SignalDefinition) -> dict:
    return {**s.model_dump(), "id": str(s.id), "gtm_context_id": str(s.gtm_context_id), "trigger_id": _str_uuid(s.trigger_id)}

def _serialize_play(p: GTMPlay) -> dict:
    return {**p.model_dump(), "id": str(p.id), "gtm_context_id": str(p.gtm_context_id), "trigger_id": _str_uuid(p.trigger_id), "signal_id": _str_uuid(p.signal_id), "persona_id": _str_uuid(p.persona_id), "playbook_id": _str_uuid(p.playbook_id)}


def _full_context(ctx: GTMContext, session: Session) -> dict:
    ensure_embedded_context_icp(session, ctx)
    sync_context_icp_state(ctx, session)
    personas = session.exec(select(Persona).where(Persona.gtm_context_id == ctx.id)).all()
    triggers = session.exec(select(BuyingTrigger).where(BuyingTrigger.gtm_context_id == ctx.id)).all()
    signal_defs = session.exec(select(SignalDefinition).where(SignalDefinition.gtm_context_id == ctx.id)).all()
    plays = session.exec(select(GTMPlay).where(GTMPlay.gtm_context_id == ctx.id)).all()
    return {
        **ctx.model_dump(),
        "id": str(ctx.id),
        "icp_id": _str_uuid(ctx.icp_id),
        "personas": [_serialize_persona(p) for p in personas],
        "triggers": [_serialize_trigger(t) for t in triggers],
        "signal_definitions": [_serialize_signal_def(s) for s in signal_defs],
        "plays": [_serialize_play(p) for p in plays],
        "context_quality_score": _context_quality(ctx),
    }


# ─── GTM Context CRUD ────────────────────────────────────────

@router.get("/")
def list_contexts(
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    ctxs = session.exec(
        select(GTMContext)
        .where(GTMContext.workspace_id == workspace_id)
        .order_by(GTMContext.created_at.desc())
    ).all()
    for ctx in ctxs:
        ensure_embedded_context_icp(session, ctx)
        sync_context_icp_state(ctx, session)
    session.commit()
    result = []
    for ctx in ctxs:
        personas = session.exec(select(Persona).where(Persona.gtm_context_id == ctx.id)).all()
        triggers = session.exec(select(BuyingTrigger).where(BuyingTrigger.gtm_context_id == ctx.id)).all()
        plays = session.exec(select(GTMPlay).where(GTMPlay.gtm_context_id == ctx.id)).all()
        result.append({
            **ctx.model_dump(),
            "id": str(ctx.id),
            "icp_id": _str_uuid(ctx.icp_id),
            "persona_count": len(personas),
            "trigger_count": len(triggers),
            "play_count": len(plays),
        })
    return {"contexts": result}


@router.post("/")
def create_context(
    data: GTMContextCreate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    ctx = GTMContext(**data.model_dump(), workspace_id=workspace_id)
    session.add(ctx)
    session.commit()
    session.refresh(ctx)
    ensure_embedded_context_icp(session, ctx)
    sync_context_icp_state(ctx, session)
    session.commit()
    session.refresh(ctx)
    return _full_context(ctx, session)


@router.get("/{ctx_id}")
def get_context(
    ctx_id: uuid.UUID,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    ctx = session.get(GTMContext, ctx_id)
    if not ctx or ctx.workspace_id != workspace_id:
        raise HTTPException(404, "GTM context not found")
    ensure_embedded_context_icp(session, ctx)
    sync_context_icp_state(ctx, session)
    session.commit()
    session.refresh(ctx)
    return _full_context(ctx, session)


@router.patch("/{ctx_id}")
def update_context(
    ctx_id: uuid.UUID,
    data: GTMContextUpdate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    ctx = session.get(GTMContext, ctx_id)
    if not ctx or ctx.workspace_id != workspace_id:
        raise HTTPException(404, "GTM context not found")
    update = data.model_dump(exclude_unset=True)
    if "icp_id" in update:
        update["icp_id"] = _uuid(update["icp_id"])
    for k, v in update.items():
        setattr(ctx, k, v)
    ctx.updated_at = datetime.utcnow()
    session.add(ctx)
    session.commit()
    ensure_embedded_context_icp(session, ctx)
    sync_context_icp_state(ctx, session)
    session.commit()
    session.refresh(ctx)
    return _full_context(ctx, session)


@router.delete("/{ctx_id}")
def delete_context(
    ctx_id: uuid.UUID,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    ctx = session.get(GTMContext, ctx_id)
    if not ctx or ctx.workspace_id != workspace_id:
        raise HTTPException(404, "GTM context not found")
    # Cascade delete children
    for p in session.exec(select(Persona).where(Persona.gtm_context_id == ctx.id)).all():
        session.delete(p)
    for t in session.exec(select(BuyingTrigger).where(BuyingTrigger.gtm_context_id == ctx.id)).all():
        session.delete(t)
    for s in session.exec(select(SignalDefinition).where(SignalDefinition.gtm_context_id == ctx.id)).all():
        session.delete(s)
    for pl in session.exec(select(GTMPlay).where(GTMPlay.gtm_context_id == ctx.id)).all():
        session.delete(pl)
    session.delete(ctx)
    session.commit()
    return {"status": "deleted"}


# ─── Motion Intent ───────────────────────────────────────────

class MotionIntentCreate(BaseModel):
    name: str
    motion_type: str = "cold"
    primary_angle: str = "pain-led"
    tone: str = "consultative"
    cta_intent: str = "meeting"
    persona_id: Optional[str] = None
    notes: str = ""


@router.get("/{ctx_id}/motion-intents")
def list_motion_intents(
    ctx_id: uuid.UUID,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    ctx = session.get(GTMContext, ctx_id)
    if not ctx or ctx.workspace_id != workspace_id:
        raise HTTPException(404, "GTM context not found")
    intents = session.exec(
        select(MotionIntent)
        .where(MotionIntent.workspace_id == workspace_id)
        .where(MotionIntent.icp_id == ctx.icp_id)
    ).all()
    return {"motion_intents": intents}


@router.post("/{ctx_id}/motion-intents")
def create_motion_intent(
    ctx_id: uuid.UUID,
    payload: MotionIntentCreate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    ctx = session.get(GTMContext, ctx_id)
    if not ctx or ctx.workspace_id != workspace_id:
        raise HTTPException(404, "GTM context not found")
    mi = MotionIntent(
        workspace_id=workspace_id,
        icp_id=ctx.icp_id,
        persona_id=uuid.UUID(payload.persona_id) if payload.persona_id else None,
        name=payload.name,
        motion_type=payload.motion_type,
        primary_angle=payload.primary_angle,
        tone=payload.tone,
        cta_intent=payload.cta_intent,
        notes=payload.notes,
    )
    session.add(mi)
    session.commit()
    session.refresh(mi)
    return mi


# ─── Personas CRUD ────────────────────────────────────────────

@router.post("/{ctx_id}/personas")
def create_persona(
    ctx_id: uuid.UUID,
    data: PersonaCreate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    ctx = session.get(GTMContext, ctx_id)
    if not ctx or ctx.workspace_id != workspace_id:
        raise HTTPException(404, "GTM context not found")
    persona_data = data.model_dump(exclude={"icp_id"})
    icp_id = uuid.UUID(data.icp_id) if data.icp_id else None
    p = Persona(gtm_context_id=ctx_id, workspace_id=workspace_id, icp_id=icp_id, **persona_data)
    session.add(p)
    session.commit()
    session.refresh(p)
    return _serialize_persona(p)


@router.delete("/personas/{persona_id}")
def delete_persona(
    persona_id: uuid.UUID,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    p = session.get(Persona, persona_id)
    if not p or p.workspace_id != workspace_id:
        raise HTTPException(404, "Persona not found")
    session.delete(p)
    session.commit()
    return {"status": "deleted"}


@router.patch("/personas/{persona_id}")
def update_persona(
    persona_id: uuid.UUID,
    data: dict,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    p = session.get(Persona, persona_id)
    if not p or p.workspace_id != workspace_id:
        raise HTTPException(404, "Persona not found")
    for k, v in data.items():
        if hasattr(p, k):
            setattr(p, k, v)
    session.add(p)
    session.commit()
    session.refresh(p)
    return _serialize_persona(p)


# ─── Buying Triggers CRUD ────────────────────────────────────

@router.post("/{ctx_id}/triggers")
def create_trigger(
    ctx_id: uuid.UUID,
    data: BuyingTriggerCreate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    ctx = session.get(GTMContext, ctx_id)
    if not ctx or ctx.workspace_id != workspace_id:
        raise HTTPException(404, "GTM context not found")
    t = BuyingTrigger(gtm_context_id=ctx_id, workspace_id=workspace_id, **data.model_dump())
    session.add(t)
    session.commit()
    session.refresh(t)
    return _serialize_trigger(t)


@router.delete("/triggers/{trigger_id}")
def delete_trigger(
    trigger_id: uuid.UUID,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    t = session.get(BuyingTrigger, trigger_id)
    if not t or t.workspace_id != workspace_id:
        raise HTTPException(404, "Trigger not found")
    session.delete(t)
    session.commit()
    return {"status": "deleted"}


@router.patch("/triggers/{trigger_id}")
def update_trigger(
    trigger_id: uuid.UUID,
    data: dict,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    t = session.get(BuyingTrigger, trigger_id)
    if not t or t.workspace_id != workspace_id:
        raise HTTPException(404, "Trigger not found")
    for k, v in data.items():
        if hasattr(t, k):
            setattr(t, k, v)
    session.add(t)
    session.commit()
    session.refresh(t)
    return _serialize_trigger(t)


# ─── Signal Definitions CRUD ─────────────────────────────────

@router.post("/{ctx_id}/signals")
def create_signal_def(
    ctx_id: uuid.UUID,
    data: SignalDefinitionCreate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    ctx = session.get(GTMContext, ctx_id)
    if not ctx or ctx.workspace_id != workspace_id:
        raise HTTPException(404, "GTM context not found")
    s = SignalDefinition(
        gtm_context_id=ctx_id,
        workspace_id=workspace_id,
        name=data.name,
        description=data.description,
        trigger_id=_uuid(data.trigger_id),
        source=data.source,
        detection_method=data.detection_method,
    )
    session.add(s)
    session.commit()
    session.refresh(s)
    return _serialize_signal_def(s)


@router.delete("/signals/{signal_id}")
def delete_signal_def(
    signal_id: uuid.UUID,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    s = session.get(SignalDefinition, signal_id)
    if not s or s.workspace_id != workspace_id:
        raise HTTPException(404, "Signal definition not found")
    session.delete(s)
    session.commit()
    return {"status": "deleted"}


@router.patch("/signals/{signal_id}")
def update_signal(
    signal_id: uuid.UUID,
    data: dict,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    s = session.get(SignalDefinition, signal_id)
    if not s or s.workspace_id != workspace_id:
        raise HTTPException(404, "Signal not found")
    for k, v in data.items():
        if hasattr(s, k):
            setattr(s, k, v)
    session.add(s)
    session.commit()
    session.refresh(s)
    return _serialize_signal_def(s)


# ─── GTM Plays CRUD ──────────────────────────────────────────

@router.post("/{ctx_id}/plays")
def create_gtm_play(
    ctx_id: uuid.UUID,
    data: GTMPlayCreate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    ctx = session.get(GTMContext, ctx_id)
    if not ctx or ctx.workspace_id != workspace_id:
        raise HTTPException(404, "GTM context not found")
    pl = GTMPlay(
        gtm_context_id=ctx_id,
        workspace_id=workspace_id,
        name=data.name,
        icp_statement=data.icp_statement,
        trigger_id=_uuid(data.trigger_id),
        signal_id=_uuid(data.signal_id),
        persona_id=_uuid(data.persona_id),
        messaging_angle=data.messaging_angle,
        playbook_id=_uuid(data.playbook_id),
    )
    session.add(pl)
    session.commit()
    session.refresh(pl)
    return _serialize_play(pl)


@router.patch("/plays/{play_id}")
def update_gtm_play(
    play_id: uuid.UUID,
    data: dict,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    pl = session.get(GTMPlay, play_id)
    if not pl or pl.workspace_id != workspace_id:
        raise HTTPException(404, "Play not found")
    uuid_fields = {"trigger_id", "signal_id", "persona_id", "playbook_id"}
    for k, v in data.items():
        if k in uuid_fields:
            setattr(pl, k, _uuid(v))
        elif hasattr(pl, k):
            setattr(pl, k, v)
    session.add(pl)
    session.commit()
    session.refresh(pl)
    return _serialize_play(pl)


@router.delete("/plays/{play_id}")
def delete_gtm_play(
    play_id: uuid.UUID,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    pl = session.get(GTMPlay, play_id)
    if not pl or pl.workspace_id != workspace_id:
        raise HTTPException(404, "Play not found")
    session.delete(pl)
    session.commit()
    return {"status": "deleted"}


# ─── AI Generation: auto-create full GTM strategy ────────────

class GTMGenerateRequest(BaseModel):
    product_description: str
    target_industries: list[str] = []
    customer_examples: list[str] = []
    value_proposition: str = ""
    competitors: list[str] = []
    geographic_focus: str = ""


class ICPSuggestion(BaseModel):
    icp_name: str
    icp_statement: str
    icp_priority: str
    firmographic_range: dict
    icp_rationale: str
    list_sourcing_guidance: str


@router.post("/{ctx_id}/icp-suggestions")
async def generate_icp_suggestions(
    ctx_id: uuid.UUID,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    ctx = session.get(GTMContext, ctx_id)
    if not ctx or ctx.workspace_id != workspace_id:
        raise HTTPException(404, "GTM context not found")

    if not settings.has_any_llm_provider():
        from services.intelligence.demo_data import build_demo_icp_suggestions
        return {"suggestions": build_demo_icp_suggestions(ctx)}

    if settings.GROQ_API_KEY:
        model = "groq/llama-3.3-70b-versatile"
        api_key = settings.GROQ_API_KEY
    elif settings.GEMINI_API_KEY:
        model = "gemini/gemini-2.0-flash"
        api_key = settings.GEMINI_API_KEY
    else:
        raise HTTPException(500, "No LLM provider configured")

    prompt = f"""
Generate 3-5 ICP suggestions for outbound targeting.
Use the product context below. Return ONLY valid JSON with key "suggestions" (array of objects).
Each object must include: icp_name, icp_statement, icp_priority, firmographic_range (employee_range, revenue_range, business_model, geography), icp_rationale, list_sourcing_guidance.

PRODUCT CONTEXT:
Company: {ctx.company_name}
Website: {ctx.website_url}
Core Problem: {ctx.core_problem}
Product Category: {ctx.product_category}
Product Description: {ctx.product_description}
Value Prop: {ctx.value_proposition}
Target Industries: {', '.join(ctx.target_industries) if ctx.target_industries else 'Not specified'}
Customer Examples: {', '.join(ctx.customer_examples) if ctx.customer_examples else 'Not specified'}
Competitors: {', '.join(ctx.competitors) if ctx.competitors else 'Not specified'}
Geographic Focus: {ctx.geographic_focus or 'Global'}
Deal Size: {ctx.avg_deal_size}
Pricing: {ctx.pricing_model}
"""

    import litellm
    response = await litellm.acompletion(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        api_key=api_key,
        temperature=0.3,
        max_tokens=2000,
    )
    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1]
        if raw.endswith("```"):
            raw = raw.rsplit("```", 1)[0]
    try:
        data = json.loads(raw)
    except Exception as e:
        raise HTTPException(500, f"ICP suggestion parse failed: {e}")

    return data


@router.post("/{ctx_id}/sourcing-guide")
async def generate_sourcing_guide(
    ctx_id: uuid.UUID,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    ctx = session.get(GTMContext, ctx_id)
    if not ctx or ctx.workspace_id != workspace_id:
        raise HTTPException(404, "GTM context not found")

    if not settings.has_any_llm_provider():
        from services.intelligence.demo_data import build_demo_sourcing_guide
        guide = build_demo_sourcing_guide(ctx)
        ctx.list_sourcing_guidance = guide
        ctx.updated_at = datetime.utcnow()
        session.add(ctx)
        session.commit()
        return {"sourcing_guide": guide}

    if settings.GROQ_API_KEY:
        model = "groq/llama-3.3-70b-versatile"
        api_key = settings.GROQ_API_KEY
    elif settings.GEMINI_API_KEY:
        model = "gemini/gemini-2.0-flash"
        api_key = settings.GEMINI_API_KEY
    else:
        raise HTTPException(500, "No LLM provider configured")

    prompt = f"""
Create a concise list sourcing guide for Apollo/Clay.
Use the ICP statement and firmographic range to output filters and target titles.
Return ONLY plain text (no JSON), 4-6 lines max.

ICP NAME: {ctx.icp_name}
ICP STATEMENT: {ctx.icp_statement}
FIRMOGRAPHICS: {json.dumps(ctx.firmographic_range)}
INDUSTRIES: {', '.join(ctx.target_industries) if ctx.target_industries else ''}
GEOGRAPHY: {ctx.geographic_focus}
"""

    import litellm
    response = await litellm.acompletion(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        api_key=api_key,
        temperature=0.2,
        max_tokens=400,
    )
    guide = response.choices[0].message.content.strip()

    ctx.list_sourcing_guidance = guide
    ctx.updated_at = datetime.utcnow()
    session.add(ctx)
    session.commit()

    return {"sourcing_guide": guide}


@router.post("/{ctx_id}/generate")
async def generate_gtm_strategy(
    ctx_id: uuid.UUID,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """
    AI-generate personas, buying triggers, signal definitions, and plays
    for an existing GTM context. Uses the context's product info as input.
    """
    ctx = session.get(GTMContext, ctx_id)
    if not ctx or ctx.workspace_id != workspace_id:
        raise HTTPException(404, "GTM context not found")

    result = None

    if not settings.has_any_llm_provider():
        from services.intelligence.demo_data import build_demo_gtm_strategy
        result = build_demo_gtm_strategy(ctx)
    else:
        import litellm

        # Choose provider
        if settings.GROQ_API_KEY:
            model = "groq/llama-3.3-70b-versatile"
            api_key = settings.GROQ_API_KEY
        elif settings.GEMINI_API_KEY:
            model = "gemini/gemini-2.0-flash"
            api_key = settings.GEMINI_API_KEY
        else:
            raise HTTPException(500, "No LLM provider configured")

        # Build context block with all available depth
        ctx_block = f"""COMPANY: {ctx.company_name or 'Not specified'}
WEBSITE: {ctx.website_url or 'Not specified'}
CORE PROBLEM SOLVED: {ctx.core_problem or 'Not specified'}
PRODUCT CATEGORY: {ctx.product_category or 'Not specified'}
PRODUCT: {ctx.product_description}
VALUE PROPOSITION: {ctx.value_proposition}
TARGET INDUSTRIES: {', '.join(ctx.target_industries) if ctx.target_industries else 'Not specified'}
CUSTOMER EXAMPLES: {', '.join(ctx.customer_examples) if ctx.customer_examples else 'Not specified'}
COMPETITORS: {', '.join(ctx.competitors) if ctx.competitors else 'Not specified'}
GEOGRAPHIC FOCUS: {ctx.geographic_focus or 'Global'}"""

        # Layer in deep discovery fields if they exist
        if ctx.avg_deal_size:
            ctx_block += f"\nAVG DEAL SIZE: {ctx.avg_deal_size}"
        if ctx.sales_cycle_days:
            ctx_block += f"\nSALES CYCLE: {ctx.sales_cycle_days}"
        if ctx.decision_process:
            ctx_block += f"\nDECISION PROCESS: {ctx.decision_process}"
        if ctx.key_integrations:
            ctx_block += f"\nKEY INTEGRATIONS: {', '.join(ctx.key_integrations)}"
        if ctx.why_customers_buy:
            ctx_block += f"\nWHY CUSTOMERS BUY: {ctx.why_customers_buy}"
        if ctx.why_customers_churn:
            ctx_block += f"\nWHY CUSTOMERS CHURN: {ctx.why_customers_churn}"
        if ctx.common_objections:
            ctx_block += f"\nCOMMON OBJECTIONS: {', '.join(ctx.common_objections)}"
        if ctx.market_maturity:
            ctx_block += f"\nMARKET MATURITY: {ctx.market_maturity}"
        if ctx.pricing_model:
            ctx_block += f"\nPRICING MODEL: {ctx.pricing_model}"
        if ctx.icp_statement:
            ctx_block += f"\nICP STATEMENT: {ctx.icp_statement}"
        if ctx.icp_rationale:
            ctx_block += f"\nICP RATIONALE: {ctx.icp_rationale}"
        if ctx.list_sourcing_guidance:
            ctx_block += f"\nLIST SOURCING GUIDANCE: {ctx.list_sourcing_guidance}"
        if ctx.enrichment_patterns:
            ctx_block += f"\nENRICHMENT PATTERNS FROM SCRAPED DATA: {json.dumps(ctx.enrichment_patterns)}"
        if ctx.context_notes:
            ctx_block += f"\nCONTEXT NOTES (FROM FILES): {ctx.context_notes[:2000]}"

        prompt = f"""You are a world-class B2B Go-To-Market strategist who has built pipeline at companies like Gong, Outreach, and ZoomInfo. You think in terms of buyer psychology, not demographics. You use frameworks from Challenger Sale, MEDDPICC, and Jobs-to-Be-Done theory.

CONTEXT:
{ctx_block}

YOUR TASK: Generate a deeply insightful GTM strategy. Not generic persona cards — real buyer psychology. Not vague triggers — specific, observable, timing-aware events. Not bland messaging — hooks that actually get replies.

CRITICAL INSTRUCTIONS:
- Personas must feel like a real person you've sold to, not a LinkedIn profile. Include what keeps them up at night, what they'd Google at 11pm, what makes them look good to their boss, what language turns them off.
- Triggers must be SPECIFIC and TIMING-AWARE. Not "company is growing" — instead "Series B closed in last 90 days AND hiring first VP Sales = building outbound for first time, desperate for tooling."
- Signals must be ACTUALLY OBSERVABLE with real keywords and data sources. "Job posting on LinkedIn for RevOps Manager mentioning Salesforce migration" not just "technology change".
- Plays must include the ACTUAL opening hook (the first line of an email that would get a reply), channel sequence with timing rationale, and how to handle the top objection for that play.

Return a JSON object with these exact keys:

{{
  "personas": [
    {{
      "name": "Archetype name (e.g. The Overwhelmed VP Sales)",
      "department": "Sales|Marketing|Engineering|Product|Operations|Finance|C-Suite",
      "seniority": "VP|Director|Manager|IC|C-Level",
      "job_titles": ["VP Sales", "Head of Revenue"],
      "responsibilities": ["Owns $X pipeline target", "Reports to CRO on weekly forecast calls"],
      "kpis": ["Pipeline coverage ratio", "Rep ramp time", "Win rate by segment"],
      "pain_points": ["Reps spending 40% of time on research instead of selling", "No way to prioritize which accounts to pursue first"],
      "decision_role": "Decision Maker|Influencer|Champion|Blocker",
      "buying_style": "analytical|relationship|consensus|visionary",
      "information_diet": ["Pavilion Slack community", "Revenue Collective podcasts", "Gartner Magic Quadrant for their category"],
      "objections": ["We already have ZoomInfo", "My team won't adopt another tool", "Budget is locked until Q3"],
      "internal_politics": "Needs CRO buy-in, but CRO trusts this persona's vendor recommendations. Finance will push back on new spend unless there's clear ROI math.",
      "trigger_phrases": ["We need to be more data-driven about account selection", "Our reps are spending too much time researching", "How do other companies prioritize their outbound?"],
      "day_in_life": "7am: checks pipeline dashboard. 9am: team standup. 10am-12pm: deal reviews with reps. PM: forecasting, 1:1s with struggling reps, firefighting lost deals.",
      "success_looks_like": "Shows the board that pipeline grew 40% QoQ with same headcount. Gets promoted to CRO.",
      "nightmare_scenario": "Misses pipeline target for 2 consecutive quarters. Board brings in a new CRO who replaces the whole sales stack.",
      "evaluation_criteria": ["Time to value (can reps use it in week 1?)", "Integration with existing CRM", "Data accuracy vs. current tools", "Cost per enriched record vs. ZoomInfo"],
      "messaging_do": ["Lead with their specific pain (research time waste)", "Reference specific competitor gaps they've experienced", "Use revenue math (X more meetings = $Y pipeline)"],
      "messaging_dont": ["Don't lead with features", "Don't say 'AI-powered' without showing the output", "Don't trash their current vendor — they chose it"]
    }}
  ],
  "triggers": [
    {{
      "name": "Specific event name (e.g. Series B + First VP Sales Hire)",
      "description": "WHEN: Company raises Series B ($15-50M). THEN within 60 days, posts job for first VP Sales or CRO. WHY IT MATTERS: They're building outbound for the first time, moving from founder-led sales to a repeatable motion. They need tooling NOW before the new VP arrives and makes their own vendor decisions.",
      "category": "hiring|growth|leadership|technology|market",
      "urgency_level": "immediate|short_term|long_term",
      "why_it_matters": "The window between funding and new sales leader arriving is the highest-intent buying moment. The new VP will inherit whatever tools are in place.",
      "ideal_timing": "Within 30 days of the VP Sales job posting. Before the new hire starts and brings their own preferred vendors.",
      "qualifying_questions": ["When does the new VP Sales start?", "Are you building outbound for the first time or rebuilding?", "What's the pipeline target for the new team?"]
    }}
  ],
  "signal_definitions": [
    {{
      "name": "Specific observable thing (e.g. VP Sales job posting on LinkedIn mentioning 'build from scratch')",
      "description": "Job posting for VP Sales, Head of Sales, or CRO that includes phrases like 'build from scratch', 'first sales hire', 'establish outbound motion'",
      "source": "linkedin|website|news|funding_db|tech_stack|job_boards",
      "detection_method": "keyword|regex|api|manual",
      "trigger_name": "Name of the trigger this maps to",
      "keywords": ["VP Sales", "Head of Sales", "build from scratch", "first sales hire", "establish outbound", "CRO"],
      "strength_score": 0.92,
      "false_positive_notes": "Companies replacing an existing VP Sales (lateral move) look similar but have a different buying context — they already have tools.",
      "enrichment_fields_used": ["employee_count", "industry", "business_model"]
    }}
  ],
  "plays": [
    {{
      "name": "Descriptive play name (e.g. The New VP Sales Land-Before-They-Arrive)",
      "icp_statement": "Precise ICP (e.g. B2B SaaS companies, 50-200 employees, Series A/B, {ctx.geographic_focus or 'US'}, posting first VP Sales role)",
      "trigger_name": "Name of the trigger",
      "signal_name": "Name of the signal",
      "persona_name": "Name of the target persona",
      "messaging_angle": "You're about to build an outbound team for the first time. The #1 mistake companies at your stage make is letting reps manually research accounts. Here's what Stripe's first sales team did instead.",
      "channel_sequence": ["linkedin_connect", "email", "linkedin_comment", "email", "phone"],
      "timing_rationale": "Day 0: LinkedIn connect (warm before cold email). Day 2: First email with the hook. Day 5: Engage with their LinkedIn content. Day 9: Follow-up email with case study. Day 12: Phone call — by now they've seen your name 4x.",
      "opening_hook": "Saw you're hiring your first VP Sales — congrats on the growth. Quick question: is your team currently spending more time researching accounts or actually selling?",
      "objection_handling": {{
        "We already have a tool": "What's your team's research time per account right now? Most teams I talk to at your stage have a tool but reps still spend 30+ min per account.",
        "Not a priority right now": "Totally get it. Most VPS I work with want clean data in place BEFORE their new VP arrives so they're not starting from scratch. Want me to send a 2-min overview for when the timing is better?",
        "Too expensive": "At your deal size of $X, you only need 2 extra meetings per month to get 10x ROI. Happy to walk through the math."
      }},
      "competitive_positioning": "Unlike ZoomInfo (static database, expensive per-seat), we enrich in real-time from the company's own website + hiring signals. Accuracy is higher because it's live data, not 6-month-old scrapes.",
      "success_criteria": "18% reply rate, 5% positive reply, 2% meeting booked. Target 40 qualified meetings/quarter from this play alone.",
      "email_subject_lines": ["Building outbound at {{{{company_name}}}}?", "re: your VP Sales search", "How {{{{similar_company}}}} ramped their outbound in 30 days", "Quick question about {{{{company_name}}}}'s sales stack"],
      "call_talk_track": "Hi {{{{first_name}}}}, this is [name] from [company]. I noticed you're hiring your first VP Sales — congratulations. I work with a lot of companies at your stage and the #1 thing I hear is reps are spending 40% of their time researching instead of selling. Is that something you're seeing too?"
    }}
  ]
}}

Generate 2-4 deeply insightful personas, 3-5 buying triggers with timing, 4-6 signal definitions with real keywords, and 2-4 plays with actual hooks and objection handling.
Every persona must feel like a REAL PERSON, not a template. Every trigger must explain WHY NOW. Every play must include the ACTUAL FIRST EMAIL LINE.
Return ONLY valid JSON, no markdown fences."""

        try:
            response = await litellm.acompletion(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                api_key=api_key,
                max_tokens=8192,
                temperature=0.4,
            )
            raw = response.choices[0].message.content.strip()

            # Strip markdown fences if present
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1]
                if raw.endswith("```"):
                    raw = raw.rsplit("```", 1)[0]

            result = json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error(f"GTM generation JSON parse error: {e}\nRaw: {raw[:500]}")
            raise HTTPException(500, f"AI returned invalid JSON: {str(e)}")
        except Exception as e:
            logger.error(f"GTM generation failed: {e}")
            raise HTTPException(500, f"AI generation failed: {str(e)}")

    # ── Persist generated entities ────────────────────────────
    created = {"personas": [], "triggers": [], "signal_definitions": [], "plays": []}

    # Create personas
    persona_map = {}  # name -> id
    for p_data in result.get("personas", []):
        p = Persona(
            gtm_context_id=ctx.id,
            name=p_data.get("name", "Unnamed"),
            department=p_data.get("department", ""),
            seniority=p_data.get("seniority", ""),
            job_titles=p_data.get("job_titles", []),
            responsibilities=p_data.get("responsibilities", []),
            kpis=p_data.get("kpis", []),
            pain_points=p_data.get("pain_points", []),
            decision_role=p_data.get("decision_role", ""),
            buying_style=p_data.get("buying_style", ""),
            information_diet=p_data.get("information_diet", []),
            objections=p_data.get("objections", []),
            internal_politics=p_data.get("internal_politics", ""),
            trigger_phrases=p_data.get("trigger_phrases", []),
            day_in_life=p_data.get("day_in_life", ""),
            success_looks_like=p_data.get("success_looks_like", ""),
            nightmare_scenario=p_data.get("nightmare_scenario", ""),
            evaluation_criteria=p_data.get("evaluation_criteria", []),
            messaging_do=p_data.get("messaging_do", []),
            messaging_dont=p_data.get("messaging_dont", []),
        )
        session.add(p)
        session.flush()
        persona_map[p.name] = p.id
        created["personas"].append(_serialize_persona(p))

    # Create triggers
    trigger_map = {}  # name -> id
    for t_data in result.get("triggers", []):
        t = BuyingTrigger(
            gtm_context_id=ctx.id,
            name=t_data.get("name", "Unnamed"),
            description=t_data.get("description", ""),
            category=t_data.get("category", ""),
            urgency_level=t_data.get("urgency_level", ""),
            why_it_matters=t_data.get("why_it_matters", ""),
            ideal_timing=t_data.get("ideal_timing", ""),
            qualifying_questions=t_data.get("qualifying_questions", []),
        )
        session.add(t)
        session.flush()
        trigger_map[t.name] = t.id
        created["triggers"].append(_serialize_trigger(t))

    # Create signal definitions (linked to triggers by name)
    signal_map = {}  # name -> id
    for s_data in result.get("signal_definitions", []):
        trigger_name = s_data.get("trigger_name", "")
        trigger_id = trigger_map.get(trigger_name)
        s = SignalDefinition(
            gtm_context_id=ctx.id,
            name=s_data.get("name", "Unnamed"),
            description=s_data.get("description", ""),
            trigger_id=trigger_id,
            source=s_data.get("source", ""),
            detection_method=s_data.get("detection_method", ""),
            keywords=s_data.get("keywords", []),
            strength_score=s_data.get("strength_score", 0.5),
            false_positive_notes=s_data.get("false_positive_notes", ""),
            enrichment_fields_used=s_data.get("enrichment_fields_used", []),
        )
        session.add(s)
        session.flush()
        signal_map[s.name] = s.id
        created["signal_definitions"].append(_serialize_signal_def(s))

    # Create plays (linked to trigger/signal/persona by name)
    for pl_data in result.get("plays", []):
        pl = GTMPlay(
            gtm_context_id=ctx.id,
            name=pl_data.get("name", "Unnamed"),
            icp_statement=pl_data.get("icp_statement", ""),
            trigger_id=trigger_map.get(pl_data.get("trigger_name", "")),
            signal_id=signal_map.get(pl_data.get("signal_name", "")),
            persona_id=persona_map.get(pl_data.get("persona_name", "")),
            messaging_angle=pl_data.get("messaging_angle", ""),
            channel_sequence=pl_data.get("channel_sequence", []),
            timing_rationale=pl_data.get("timing_rationale", ""),
            opening_hook=pl_data.get("opening_hook", ""),
            objection_handling=pl_data.get("objection_handling", {}),
            competitive_positioning=pl_data.get("competitive_positioning", ""),
            success_criteria=pl_data.get("success_criteria", ""),
            email_subject_lines=pl_data.get("email_subject_lines", []),
            call_talk_track=pl_data.get("call_talk_track", ""),
        )
        session.add(pl)
        session.flush()
        created["plays"].append(_serialize_play(pl))

    session.commit()
    return {
        "status": "generated",
        "created": created,
        "counts": {k: len(v) for k, v in created.items()},
    }


# ─── Enrichment Feedback: learn from scraped company data ─────

@router.post("/{ctx_id}/refine-from-enrichment")
async def refine_from_enrichment(
    ctx_id: uuid.UUID,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """
    Analyze all enriched company profiles and feed patterns back into the GTM strategy.
    This closes the loop: scrape → learn → refine targeting.
    """
    from models import CompanyProfile, ICPScore, Signal as SignalModel
    from config import settings
    import litellm

    ctx = session.get(GTMContext, ctx_id)
    if not ctx or ctx.workspace_id != workspace_id:
        raise HTTPException(404, "GTM context not found")

    # Gather enriched data
    profiles = session.exec(
        select(CompanyProfile)
        .where(CompanyProfile.workspace_id == workspace_id)
        .limit(200)
    ).all()
    if not profiles:
        raise HTTPException(400, "No enriched profiles yet. Run enrichment first.")

    # Gather ICP scores if available
    scores = {}
    if ctx.icp_id:
        for s in session.exec(
            select(ICPScore)
            .where(ICPScore.icp_id == ctx.icp_id)
            .where(ICPScore.workspace_id == workspace_id)
        ).all():
            scores[s.domain] = {"score": s.final_score, "fit": s.fit_category, "missing": s.missing_fields}

    # Gather signals
    signals_by_domain = {}
    for sig in session.exec(select(SignalModel).where(SignalModel.workspace_id == workspace_id)).all():
        signals_by_domain.setdefault(sig.domain, []).append({"type": sig.signal_type, "strength": sig.strength})

    # Build summary for LLM
    company_summaries = []
    for p in profiles[:50]:  # Top 50 to fit context
        ed = p.enriched_data or {}
        summary = {
            "domain": p.domain,
            "name": ed.get("company_name", {}).get("value") if isinstance(ed.get("company_name"), dict) else p.name,
            "industry": ed.get("industry", {}).get("value") if isinstance(ed.get("industry"), dict) else None,
            "employees": ed.get("employee_count", {}).get("value") if isinstance(ed.get("employee_count"), dict) else None,
            "business_model": ed.get("business_model", {}).get("value") if isinstance(ed.get("business_model"), dict) else None,
            "quality": p.quality_score,
            "icp_score": scores.get(p.domain, {}).get("score"),
            "icp_fit": scores.get(p.domain, {}).get("fit"),
            "missing_fields": scores.get(p.domain, {}).get("missing", []),
            "signals": signals_by_domain.get(p.domain, []),
        }
        company_summaries.append(summary)

    high_fit = [c for c in company_summaries if c.get("icp_fit") == "high"]
    low_fit = [c for c in company_summaries if c.get("icp_fit") == "low"]
    signaled = [c for c in company_summaries if c.get("signals")]

    if settings.GROQ_API_KEY:
        model = "groq/llama-3.3-70b-versatile"
        api_key = settings.GROQ_API_KEY
    elif settings.GEMINI_API_KEY:
        model = "gemini/gemini-2.0-flash"
        api_key = settings.GEMINI_API_KEY
    else:
        raise HTTPException(500, "No LLM provider configured")

    analysis_prompt = f"""You are a GTM analyst. I've scraped and scored {len(company_summaries)} companies. Analyze the patterns and tell me what we're learning about our market.

PRODUCT CONTEXT: {ctx.product_description}
TARGET INDUSTRIES: {', '.join(ctx.target_industries) if ctx.target_industries else 'not set'}

HIGH-FIT COMPANIES ({len(high_fit)}):
{json.dumps(high_fit[:15], default=str)}

LOW-FIT COMPANIES ({len(low_fit)}):
{json.dumps(low_fit[:10], default=str)}

COMPANIES WITH SIGNALS ({len(signaled)}):
{json.dumps(signaled[:15], default=str)}

COMMONLY MISSING DATA FIELDS:
{json.dumps(list(set(f for c in company_summaries for f in c.get("missing_fields", []))))}

Return a JSON object:
{{
  "patterns": {{
    "common_industries": ["list of industries that appear in high-fit"],
    "common_employee_range": "typical range",
    "common_business_models": ["list"],
    "common_signals": ["most frequent signal types in high-fit"],
    "surprising_findings": ["things that don't match our initial assumptions"],
    "data_gaps": ["fields we're not collecting that would improve scoring"]
  }},
  "recommendations": {{
    "refine_icp": "specific suggestion to narrow or broaden ICP",
    "new_triggers": ["trigger ideas based on what we're seeing"],
    "new_signals": ["signal ideas based on what we're seeing"],
    "persona_insights": "what we're learning about who to target",
    "messaging_update": "how to adjust messaging based on what high-fit companies have in common"
  }}
}}

Be specific and data-driven. Reference actual companies from the data. Return ONLY valid JSON."""

    try:
        response = await litellm.acompletion(
            model=model,
            messages=[{"role": "user", "content": analysis_prompt}],
            api_key=api_key,
            max_tokens=4096,
            temperature=0.3,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]
            if raw.endswith("```"):
                raw = raw.rsplit("```", 1)[0]
        analysis = json.loads(raw)
    except Exception as e:
        logger.error(f"Enrichment analysis failed: {e}")
        raise HTTPException(500, f"Analysis failed: {str(e)}")

    # Save patterns to context
    ctx.enrichment_patterns = analysis
    ctx.updated_at = datetime.utcnow()
    session.add(ctx)
    session.commit()

    return {
        "status": "analyzed",
        "companies_analyzed": len(company_summaries),
        "high_fit_count": len(high_fit),
        "signaled_count": len(signaled),
        "analysis": analysis,
    }
# ─── Company Context Parsing ────────────────────────────────

# ── ICP CRUD (linked to Mission / GTMContext) ─────────────────────────────────

@router.get("/{ctx_id}/icps", response_model=dict)
def list_icps_for_mission(
    ctx_id: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """List all ICPs linked to a mission (GTMContext)."""
    ctx = _get_ctx_or_404(ctx_id, workspace_id, session)
    icps = session.exec(
        select(ICP)
        .where(ICP.mission_id == ctx.id)
        .where(ICP.workspace_id == workspace_id)
        .order_by(ICP.created_at.asc())  # type: ignore
    ).all()
    return {"icps": [_serialize_icp(icp) for icp in icps], "total": len(icps)}


@router.post("/{ctx_id}/icps", response_model=dict)
def create_icp_for_mission(
    ctx_id: str,
    payload: ICPCreate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Create a new ICP linked to a mission."""
    ctx = _get_ctx_or_404(ctx_id, workspace_id, session)
    existing_icps = session.exec(
        select(ICP)
        .where(ICP.workspace_id == workspace_id)
        .where(ICP.mission_id == ctx.id)
    ).all()
    icp = ICP(
        id=(ctx.icp_id if not existing_icps and ctx.icp_id else uuid.uuid4()),
        workspace_id=workspace_id,
        mission_id=ctx.id,
        name=payload.name,
        industry=payload.industry or [],
        company_size=payload.company_size or {},
        geography=payload.geography or [],
        use_cases=payload.use_cases or [],
        firmographic_range=payload.firmographic_range or {},
        icp_statement=payload.icp_statement or "",
        icp_priority=payload.icp_priority or "Primary",
        list_sourcing_guidance=payload.list_sourcing_guidance or "",
        icp_rationale=payload.icp_rationale or "",
    )
    session.add(icp)
    session.flush()
    sync_mission_icp_definition(icp, ctx, session)
    sync_context_icp_state(ctx, session)
    session.commit()
    session.refresh(icp)
    return _serialize_icp(icp)


@router.get("/{ctx_id}/icps/{icp_id}", response_model=dict)
def get_icp_for_mission(
    ctx_id: str,
    icp_id: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Get a single ICP."""
    _get_ctx_or_404(ctx_id, workspace_id, session)
    icp = _get_icp_or_404(icp_id, workspace_id, session)
    return _serialize_icp(icp)


@router.patch("/{ctx_id}/icps/{icp_id}", response_model=dict)
def update_icp_for_mission(
    ctx_id: str,
    icp_id: str,
    payload: ICPUpdate,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Update an ICP."""
    ctx = _get_ctx_or_404(ctx_id, workspace_id, session)
    icp = _get_icp_or_404(icp_id, workspace_id, session)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(icp, field, value)
    session.add(icp)
    sync_mission_icp_definition(icp, ctx, session)
    sync_context_icp_state(ctx, session)
    session.commit()
    session.refresh(icp)
    return _serialize_icp(icp)


@router.delete("/{ctx_id}/icps/{icp_id}", response_model=dict)
def delete_icp_for_mission(
    ctx_id: str,
    icp_id: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Delete an ICP."""
    ctx = _get_ctx_or_404(ctx_id, workspace_id, session)
    icp = _get_icp_or_404(icp_id, workspace_id, session)
    legacy = session.get(ICPDefinition, icp.id)
    if legacy:
        session.delete(legacy)
    session.delete(icp)
    session.flush()
    next_primary = sync_context_icp_state(ctx, session)
    if not next_primary:
        ctx.icp_id = None
        ctx.icp_name = ""
        ctx.icp_statement = ""
        ctx.icp_priority = "Primary"
        ctx.icp_rationale = ""
        ctx.list_sourcing_guidance = ""
        session.add(ctx)
    session.commit()
    return {"deleted": True}


@router.post("/{ctx_id}/icps/{icp_id}/duplicate", response_model=dict)
def duplicate_icp_for_mission(
    ctx_id: str,
    icp_id: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Duplicate an ICP."""
    ctx = _get_ctx_or_404(ctx_id, workspace_id, session)
    source = _get_icp_or_404(icp_id, workspace_id, session)
    new_icp = ICP(
        id=uuid.uuid4(),
        workspace_id=workspace_id,
        mission_id=ctx.id,
        name=source.name + " (copy)",
        industry=source.industry,
        company_size=source.company_size,
        geography=source.geography,
        use_cases=source.use_cases or [],
        firmographic_range=source.firmographic_range or {},
        icp_statement=source.icp_statement,
        icp_priority="Secondary",
        list_sourcing_guidance=source.list_sourcing_guidance or "",
        icp_rationale=source.icp_rationale or "",
    )
    session.add(new_icp)
    session.commit()
    session.refresh(new_icp)
    return _serialize_icp(new_icp)


# ── ICP helpers ────────────────────────────────────────────────────────────────

def _get_ctx_or_404(ctx_id: str, workspace_id: uuid.UUID, session: Session) -> GTMContext:
    ctx = session.exec(
        select(GTMContext)
        .where(GTMContext.id == uuid.UUID(ctx_id))
        .where(GTMContext.workspace_id == workspace_id)
    ).first()
    if not ctx:
        raise HTTPException(status_code=404, detail="GTM context not found")
    return ctx


def _get_icp_or_404(icp_id: str, workspace_id: uuid.UUID, session: Session) -> ICP:
    icp = session.exec(
        select(ICP)
        .where(ICP.id == uuid.UUID(icp_id))
        .where(ICP.workspace_id == workspace_id)
    ).first()
    if not icp:
        raise HTTPException(status_code=404, detail="ICP not found")
    return icp


def _serialize_icp(icp: ICP) -> dict:
    return {
        "id": str(icp.id),
        "workspace_id": str(icp.workspace_id),
        "mission_id": str(icp.mission_id),
        "name": icp.name,
        "industry": icp.industry,
        "company_size": icp.company_size,
        "geography": icp.geography,
        "use_cases": icp.use_cases,
        "firmographic_range": icp.firmographic_range,
        "icp_statement": icp.icp_statement,
        "icp_priority": icp.icp_priority,
        "list_sourcing_guidance": icp.list_sourcing_guidance,
        "icp_rationale": icp.icp_rationale,
        "created_at": icp.created_at.isoformat(),
    }


# ── context route helper (referenced in ICP CRUD above) ───────────────────────

def _get_context_for_workspace(ctx_id: str, workspace_id: uuid.UUID, session: Session) -> GTMContext:
    ctx = session.exec(
        select(GTMContext)
        .where(GTMContext.id == uuid.UUID(ctx_id))
        .where(GTMContext.workspace_id == workspace_id)
    ).first()
    if not ctx:
        raise HTTPException(status_code=404, detail="GTM context not found")
    return ctx


@router.post("/context/parse")
async def parse_context_files(
    files: list[UploadFile] = File(...),
):
    """
    Parse uploaded context files (PDF/DOCX/PPTX) and extract structured fields.
    """
    from services.intelligence.context_parser import extract_text_from_file, parse_context_with_llm, compute_context_quality

    combined = []
    for f in files:
        data = await f.read()
        text = extract_text_from_file(f.filename or "", data)
        if text:
            combined.append(text)

    if not combined:
        raise HTTPException(400, "No readable text found in files")

    if not settings.has_any_llm_provider():
        combined_text = "\n\n".join(combined)
        extracted = {"context_notes": combined_text[:1200]}
    else:
        extracted = await parse_context_with_llm("\n\n".join(combined), {}, settings)
    quality = compute_context_quality(extracted)
    return {"extracted": extracted, "context_quality_score": quality}
