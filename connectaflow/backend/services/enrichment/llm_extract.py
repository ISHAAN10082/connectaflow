"""
LLM client: instructor + litellm for structured extraction.
Only called when deterministic extractors didn't find a field.
Post-extraction hallucination check.
"""
import os
import orjson
from typing import Optional
from pydantic import BaseModel, Field as PydField
from loguru import logger
from config import settings


class CompanyExtraction(BaseModel):
    """Schema for LLM extraction — instructor enforces this."""
    company_name: Optional[str] = PydField(None, description="Official company name")
    employee_count: Optional[str] = PydField(None, description="Number of employees, e.g. '150' or '50-200'")
    founded_year: Optional[int] = PydField(None, description="Year the company was founded")
    hq_location: Optional[str] = PydField(None, description="Headquarters city and country")
    industry: Optional[str] = PydField(None, description="Primary industry or vertical")
    business_model: Optional[str] = PydField(None, description="B2B SaaS, B2C, Marketplace, etc.")
    company_description: Optional[str] = PydField(None, description="One-paragraph company description")
    customer_segment: Optional[str] = PydField(None, description="SMB, Mid-Market, Enterprise, etc.")


GROUNDED_SYSTEM_PROMPT = """You are a data extraction assistant. You extract ONLY factual data that is explicitly stated in the provided text.

RULES:
1. Only extract information that is DIRECTLY stated in the text
2. If a field is not mentioned or you are unsure, return null
3. Do NOT guess, infer, or use your training knowledge
4. Do NOT hallucinate — every value must be traceable to the text
5. Return valid JSON matching the schema"""


# Track provider health to avoid wasting time on failing providers
_provider_failures: dict[str, int] = {}
_FAILURE_THRESHOLD = 3


def _get_provider_chain() -> list[tuple[str, str]]:
    """Return available providers in priority order: (model, env_key)"""
    chain = []
    # Prioritize Groq to bypass Gemini rate limits
    if settings.GROQ_API_KEY and _provider_failures.get("groq", 0) < _FAILURE_THRESHOLD:
        chain.append(("groq/llama-3.1-8b-instant", "GROQ_API_KEY"))
    if settings.GEMINI_API_KEY and _provider_failures.get("gemini", 0) < _FAILURE_THRESHOLD:
        chain.append(("gemini/gemini-2.0-flash", "GEMINI_API_KEY"))
    return chain


async def llm_extract(text: str, missing_fields: list[str], source_url: str = "") -> dict:
    """
    Call LLM to extract fields that deterministic extractors missed.
    Returns dict of field_name → DataPoint-ready dict.
    Uses instructor for guaranteed schema compliance.
    """
    if not text or not missing_fields:
        return {}

    chain = _get_provider_chain()
    if not chain:
        logger.warning("No LLM providers available")
        return {}

    # Truncate to avoid token limits
    truncated = text[:12000]

    prompt = f"""Extract the following fields from the company page text below:
Fields needed: {', '.join(missing_fields)}

TEXT:
{truncated}

Remember: return null for any field not explicitly mentioned. Do NOT guess."""

    for model, env_key in chain:
        provider_name = model.split("/")[0]
        try:
            import instructor
            import litellm

            client = instructor.from_litellm(litellm.acompletion)
            result = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": GROUNDED_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                response_model=CompanyExtraction,
                max_retries=2,
                api_key=os.getenv(env_key),
                max_tokens=512,
                temperature=0.1,
            )

            # Reset failure count on success
            _provider_failures[provider_name] = 0

            # Post-hoc hallucination check
            extracted = {}
            for field_name in missing_fields:
                val = getattr(result, field_name, None)
                if val is not None:
                    # Grounding check: does the value appear in source text?
                    val_str = str(val).lower()
                    is_grounded = val_str in truncated.lower() or any(
                        word in truncated.lower() for word in val_str.split() if len(word) > 3
                    )
                    confidence = 0.75 if is_grounded else 0.45
                    extracted[field_name] = {
                        "value": val,
                        "confidence": confidence,
                        "source": "llm_synthesis",
                        "source_url": source_url,
                        "evidence": f"LLM extraction ({'grounded' if is_grounded else 'UNGROUNDED'})",
                    }

            return extracted

        except Exception as e:
            _provider_failures[provider_name] = _provider_failures.get(provider_name, 0) + 1
            logger.warning(f"LLM extraction failed with {provider_name}: {e}")
            continue

    return {}
