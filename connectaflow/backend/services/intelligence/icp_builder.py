"""
ICP Builder: 3-pass Constitutional AI to generate a machine-readable scoring rubric.
Pass 1: Draft ICP from product description + customer examples
Pass 2: Red-team — find holes and false positives
Pass 3: Generate machine-readable rubric with scoring weights

Inspired by RFM analysis: multi-dimensional weighted scoring.
"""
import os
from typing import Optional
from pydantic import BaseModel, Field as PydField
from loguru import logger
from config import settings
from models import ICPDefinition, ICPRubric, ICPCriterion


# ── instructor response models for each pass ──────────────

class ICPDraft(BaseModel):
    """Pass 1 output: high-level ICP description."""
    ideal_company_size: Optional[str] = None
    ideal_industries: list[str] = []
    ideal_business_model: Optional[str] = None
    ideal_geography: Optional[str] = None
    ideal_tech_signals: list[str] = []
    why_these_customers_fit: str = ""
    deal_breakers: list[str] = []
    summary: str = ""


class ICPRedTeam(BaseModel):
    """Pass 2 output: critique of the draft ICP."""
    false_positive_risks: list[str] = []
    missing_criteria: list[str] = []
    over_weighted_criteria: list[str] = []
    refined_exclusions: list[str] = []
    confidence_notes: str = ""


class ICPRubricOutput(BaseModel):
    """Pass 3 output: machine-readable scoring rubric."""
    criteria: list[dict] = PydField([], description="List of {field_name, label, weight, match_type, match_value}")
    required_fields: list[str] = PydField([], description="Fields needed for extraction")
    synthetic_negatives: list[str] = PydField([], description="3-5 company descriptions that look like they fit but shouldn't")


async def generate_icp(
    product_description: str,
    customer_examples: list[str],
    name: str = "Default ICP",
    on_stream: Optional[callable] = None,
) -> ICPDefinition:
    """
    3-pass Constitutional AI ICP generation.
    Each pass uses instructor for guaranteed schema output.
    """
    import instructor
    import litellm

    # Choose provider — prioritizing Groq for speed and to bypass Gemini rate limits
    if settings.GROQ_API_KEY:
        model = "groq/llama-3.3-70b-versatile"
        api_key = settings.GROQ_API_KEY
    elif settings.GEMINI_API_KEY:
        model = "gemini/gemini-2.0-flash"
        api_key = settings.GEMINI_API_KEY
    else:
        raise ValueError("No LLM provider configured. Set GROQ_API_KEY or GEMINI_API_KEY.")

    client = instructor.from_litellm(litellm.acompletion)

    # ── Pass 1: Draft ICP ───────────────────────────────────
    if on_stream:
        await on_stream({"pass": 1, "status": "generating_draft"})

    draft = await client.chat.completions.create(
        model=model,
        api_key=api_key,
        messages=[
            {"role": "system", "content": "You are an expert B2B sales strategist. Generate a precise Ideal Customer Profile based on the product and existing customers."},
            {"role": "user", "content": f"""
Product Description:
{product_description}

Example Customers (companies that are already successful users):
{chr(10).join(f'- {c}' for c in customer_examples)}

Generate a detailed ICP. Focus on measurable, verifiable criteria (company size, industry, tech stack, business model) — not vague attributes like 'innovative' or 'growth-minded'.
"""},
        ],
        response_model=ICPDraft,
        max_retries=2,
        temperature=0.3,
    )

    if on_stream:
        await on_stream({"pass": 1, "status": "complete", "draft": draft.model_dump()})

    # ── Pass 2: Red-team ────────────────────────────────────
    if on_stream:
        await on_stream({"pass": 2, "status": "red_teaming"})

    redteam = await client.chat.completions.create(
        model=model,
        api_key=api_key,
        messages=[
            {"role": "system", "content": "You are a critical analyst. Find flaws in this ICP that would lead to wasted sales effort."},
            {"role": "user", "content": f"""
Draft ICP:
{draft.model_dump_json(indent=2)}

Product: {product_description}

Critique this ICP:
1. What types of companies would match these criteria but be terrible customers?
2. What important criteria are missing?
3. What criteria are over-weighted or under-weighted?
4. What specific exclusion rules should be added?
"""},
        ],
        response_model=ICPRedTeam,
        max_retries=2,
        temperature=0.4,
    )

    if on_stream:
        await on_stream({"pass": 2, "status": "complete", "redteam": redteam.model_dump()})

    # ── Pass 3: Generate machine-readable rubric ────────────
    if on_stream:
        await on_stream({"pass": 3, "status": "building_rubric"})

    rubric_output = await client.chat.completions.create(
        model=model,
        api_key=api_key,
        messages=[
            {"role": "system", "content": """You are a scoring system designer. Convert this ICP into a machine-readable scoring rubric.
Each criterion should use one of these match_types:
- 'contains': field value contains the match string (case-insensitive)
- 'range': field value is within [min, max]
- 'exact': field value exactly matches
- 'regex': field value matches the regex pattern

field_name must be one of: employee_count, founded_year, hq_location, industry, business_model, tech_stack, company_description, customer_segment, email_provider

All weights must sum to 1.0."""},
            {"role": "user", "content": f"""
Draft ICP: {draft.model_dump_json()}
Red-team critique: {redteam.model_dump_json()}
Product: {product_description}

Generate a scoring rubric with 4-8 criteria. Weights must sum to 1.0.
Also generate 3-5 synthetic negative company descriptions (companies that look like they fit but shouldn't).
"""},
        ],
        response_model=ICPRubricOutput,
        max_retries=2,
        temperature=0.2,
    )

    if on_stream:
        await on_stream({"pass": 3, "status": "complete", "rubric": rubric_output.model_dump()})

    # ── Build ICP Definition ────────────────────────────────
    criteria = []
    for c in rubric_output.criteria:
        try:
            criteria.append(ICPCriterion(
                field_name=c.get("field_name", ""),
                label=c.get("label", ""),
                weight=float(c.get("weight", 0)),
                match_type=c.get("match_type", "contains"),
                match_value=c.get("match_value", ""),
            ))
        except Exception:
            continue

    # Normalize weights to sum to 1.0
    total_weight = sum(c.weight for c in criteria)
    if total_weight > 0:
        for c in criteria:
            c.weight /= total_weight

    rubric = ICPRubric(
        criteria=criteria,
        required_fields=rubric_output.required_fields or [c.field_name for c in criteria],
        description=draft.summary,
        exclusions=redteam.refined_exclusions,
        synthetic_negatives=rubric_output.synthetic_negatives,
    )

    # ── Compute embedding centroids (if fastembed available) ─
    pos_centroid = None
    neg_centroid = None
    try:
        from fastembed import TextEmbedding
        embed_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")

        # Positive centroid from customer examples + draft summary
        pos_texts = customer_examples + [draft.summary]
        pos_embeddings = list(embed_model.embed(pos_texts))
        import numpy as np
        pos_centroid = np.mean(pos_embeddings, axis=0).tolist()

        # Negative centroid from synthetic negatives
        if rubric.synthetic_negatives:
            neg_embeddings = list(embed_model.embed(rubric.synthetic_negatives))
            neg_centroid = np.mean(neg_embeddings, axis=0).tolist()

    except Exception as e:
        logger.warning(f"Embedding centroids failed: {e}")

    icp = ICPDefinition(
        name=name,
        product_description=product_description,
        customer_examples=customer_examples,
        rubric=rubric.model_dump(),
        pos_centroid=pos_centroid,
        neg_centroid=neg_centroid,
        draft_text=draft.summary,
        redteam_text=redteam.confidence_notes,
    )

    return icp
