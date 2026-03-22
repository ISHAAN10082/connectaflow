"""
Plays Messaging Generator.
Generates structured messaging anatomy and assembles full email variants.
"""
import json
import os
import uuid
from typing import Optional
from loguru import logger
from sqlmodel import Session, select

from models import (
    MessagingPlay, PlayComponent, PlayVariation, EmailVariant,
    ICP, Persona, GTMContext, SocialProofAsset, Signal,
)

COMPONENT_ORDER = [
    "subject", "greeting", "opener", "problem",
    "value_prop", "story", "cta", "closer", "variables",
]


async def generate_messaging_table(
    play_id: uuid.UUID,
    workspace_id: uuid.UUID,
    instruction: str,
    session: Session,
) -> dict:
    """
    Generate all messaging components for a play via LLM.
    Clears existing components/variations and replaces them.
    Returns the full play with components.
    """
    from config import settings
    import litellm

    play = session.get(MessagingPlay, play_id)
    if not play:
        return {"error": "Play not found"}

    # ── Assemble context ─────────────────────────────────────────────────────
    mission_context = {}
    icp_context = {}
    persona_context = {}
    assets_context = []

    mission = session.get(GTMContext, play.mission_id)
    if mission:
        mission_context = {
            "company": mission.company_name,
            "core_problem": mission.core_problem,
            "value_proposition": mission.value_proposition,
            "avg_deal_size": mission.avg_deal_size,
            "common_objections": mission.common_objections,
            "why_customers_buy": mission.why_customers_buy,
        }

    if play.icp_id:
        icp = session.get(ICP, play.icp_id)
        if icp:
            icp_context = {
                "name": icp.name,
                "icp_statement": icp.icp_statement,
                "industry": icp.industry,
                "company_size": icp.company_size,
                "geography": icp.geography,
                "use_cases": icp.use_cases,
            }

    persona = session.get(Persona, play.persona_id)
    if persona:
        persona_context = {
            "name": persona.name,
            "department": persona.department,
            "seniority": persona.seniority,
            "job_titles": persona.job_titles,
            "pain_points": persona.pain_points,
            "kpis": persona.kpis,
            "objections": persona.objections,
            "messaging_do": persona.messaging_do,
            "messaging_dont": persona.messaging_dont,
            "trigger_phrases": persona.trigger_phrases,
            "success_looks_like": persona.success_looks_like,
            "nightmare_scenario": persona.nightmare_scenario,
        }

    # Assets matching this play's ICP/persona
    assets_q = select(SocialProofAsset).where(
        SocialProofAsset.workspace_id == workspace_id
    )
    all_assets = session.exec(assets_q).all()
    for asset in all_assets[:10]:  # cap context size
        # Prefer assets matched to this ICP or persona
        if (play.icp_id and asset.icp_id == play.icp_id) or \
           (asset.persona_id == play.persona_id) or \
           (asset.icp_id is None and asset.persona_id is None):
            assets_context.append({
                "type": asset.type,
                "title": asset.title,
                "content": asset.content[:300],
            })

    # Fallback: structured generation if no LLM
    fallback = _fallback_components(persona_context, mission_context, icp_context)

    if not settings.has_any_llm_provider():
        return _save_components(play_id, workspace_id, fallback, session, play)

    prompt = (
        "You are a B2B cold outreach messaging strategist.\n"
        "Generate a complete messaging anatomy table for a sales play.\n\n"
        f"MISSION: {json.dumps(mission_context)}\n"
        f"ICP: {json.dumps(icp_context)}\n"
        f"PERSONA: {json.dumps(persona_context)}\n"
        f"SOCIAL PROOF ASSETS: {json.dumps(assets_context)}\n"
    )
    if instruction:
        prompt += f"\nGLOBAL INSTRUCTION: {instruction}\n"

    prompt += (
        "\nReturn ONLY valid JSON with this exact structure "
        "(each key maps to an array of 2-3 variation strings):\n"
        "{\n"
        '  "subject": ["variation A", "variation B", "variation C"],\n'
        '  "greeting": ["Hi {first_name},", "Hey {first_name},"],\n'
        '  "opener": ["variation A", "variation B", "variation C"],\n'
        '  "problem": ["variation A", "variation B"],\n'
        '  "value_prop": ["variation A", "variation B"],\n'
        '  "story": ["case study or proof point A", "metric proof B"],\n'
        '  "cta": ["variation A", "variation B", "variation C"],\n'
        '  "closer": ["variation A", "variation B"],\n'
        '  "variables": ["{first_name}", "{company}", "{signal_reference}"]\n'
        "}\n"
        "No markdown. No explanation. Only the JSON object."
    )

    model, api_key_env = _get_provider()
    try:
        response = await litellm.acompletion(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            api_key=os.getenv(api_key_env),
            temperature=0.4,
            max_tokens=3000,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:])
            if raw.endswith("```"):
                raw = raw.rsplit("```", 1)[0]
        components_data = json.loads(raw)
    except Exception as e:
        logger.warning(f"Plays generation failed, using fallback: {e}")
        components_data = fallback

    return _save_components(play_id, workspace_id, components_data, session, play)


def _save_components(
    play_id: uuid.UUID,
    workspace_id: uuid.UUID,
    components_data: dict,
    session: Session,
    play: MessagingPlay,
) -> dict:
    """Delete existing components/variations and save new ones."""
    # Clear existing
    existing_components = session.exec(
        select(PlayComponent).where(PlayComponent.play_id == play_id)
    ).all()
    for comp in existing_components:
        # Delete variations
        variations = session.exec(
            select(PlayVariation).where(PlayVariation.component_id == comp.id)
        ).all()
        for v in variations:
            session.delete(v)
        session.delete(comp)

    # Clear existing email variants
    existing_variants = session.exec(
        select(EmailVariant).where(EmailVariant.play_id == play_id)
    ).all()
    for ev in existing_variants:
        session.delete(ev)

    session.commit()

    # Save new components + variations
    saved_components = []
    for order, comp_type in enumerate(COMPONENT_ORDER):
        variations_list = components_data.get(comp_type, [])
        if not variations_list:
            continue

        component = PlayComponent(
            workspace_id=workspace_id,
            play_id=play_id,
            component_type=comp_type,
            display_order=order,
        )
        session.add(component)
        session.flush()  # get component.id

        comp_variations = []
        for i, content in enumerate(variations_list):
            variation = PlayVariation(
                workspace_id=workspace_id,
                component_id=component.id,
                content=str(content),
                is_selected=(i == 0),  # first variation selected by default
            )
            session.add(variation)
            comp_variations.append({"content": str(content), "is_selected": (i == 0)})

        saved_components.append({
            "id": str(component.id),
            "component_type": comp_type,
            "display_order": order,
            "variations": comp_variations,
        })

    session.commit()
    return {
        "play_id": str(play_id),
        "components": saved_components,
    }


def _fallback_components(persona: dict, mission: dict, icp: dict) -> dict:
    persona_name = persona.get("name", "the persona")
    problem = (persona.get("pain_points") or ["their challenge"])[0]
    return {
        "subject": [
            f"Quick question about {problem[:40]}",
            f"How {persona_name}s are solving {problem[:30]}",
        ],
        "greeting": ["Hi {first_name},", "Hey {first_name},"],
        "opener": [
            "I noticed {company} is growing fast and wanted to reach out.",
            "Saw some interesting signals from {company} recently.",
        ],
        "problem": [
            f"Many {persona_name}s struggle with {problem}.",
            f"The challenge of {problem} keeps coming up.",
        ],
        "value_prop": [
            mission.get("value_proposition", "We help teams achieve better results."),
        ],
        "story": ["We helped a similar company achieve significant results."],
        "cta": [
            "Would a 15-minute call make sense this week?",
            "Open to a quick chat?",
        ],
        "closer": [
            "Best, {sender_name}",
            "Talk soon, {sender_name}",
        ],
        "variables": ["{first_name}", "{company}", "{sender_name}"],
    }


def assemble_email_variants(
    play_id: uuid.UUID,
    workspace_id: uuid.UUID,
    session: Session,
) -> list[dict]:
    """
    Assemble 3-5 complete email variants from play components.
    Mixes selected Subject × Opener × CTA combinations.
    Stores as EmailVariant records.
    """
    # Load components with their variations
    components = session.exec(
        select(PlayComponent)
        .where(PlayComponent.play_id == play_id)
        .order_by(PlayComponent.display_order)  # type: ignore
    ).all()

    comp_map = {}
    for comp in components:
        variations = session.exec(
            select(PlayVariation)
            .where(PlayVariation.component_id == comp.id)
        ).all()
        comp_map[comp.component_type] = variations

    def get_variation(comp_type: str, index: int = 0) -> str:
        variations = comp_map.get(comp_type, [])
        if not variations:
            return ""
        return variations[min(index, len(variations) - 1)].content

    # Clear existing variants
    existing = session.exec(
        select(EmailVariant).where(EmailVariant.play_id == play_id)
    ).all()
    for ev in existing:
        session.delete(ev)
    session.commit()

    styles = [
        ("Direct", 0, 0, 0),
        ("Storytelling", 0, 1, 1),
        ("Question Hook", 1, 0, 2),
        ("Metric-Led", 1, 1, 0),
        ("Challenger", 0, 2, 1),
    ]

    saved = []
    for style_label, subj_i, opener_i, cta_i in styles:
        subject = get_variation("subject", subj_i) or get_variation("subject", 0)
        if not subject:
            continue

        body_parts = [
            get_variation("greeting", 0),
            get_variation("opener", opener_i) or get_variation("opener", 0),
            get_variation("problem", 0),
            get_variation("value_prop", 0),
            get_variation("story", 0),
            get_variation("cta", cta_i) or get_variation("cta", 0),
            get_variation("closer", 0),
        ]
        body = "\n\n".join(p for p in body_parts if p)

        variant = EmailVariant(
            workspace_id=workspace_id,
            play_id=play_id,
            subject=subject,
            body=body,
            style_label=style_label,
        )
        session.add(variant)
        session.flush()
        saved.append({
            "id": str(variant.id),
            "subject": subject,
            "body": body,
            "style_label": style_label,
        })

    session.commit()
    return saved


def _get_provider() -> tuple[str, str]:
    from config import settings
    if settings.GROQ_API_KEY:
        return "groq/llama-3.3-70b-versatile", "GROQ_API_KEY"
    if settings.GEMINI_API_KEY:
        return "gemini/gemini-2.0-flash", "GEMINI_API_KEY"
    return "", ""
