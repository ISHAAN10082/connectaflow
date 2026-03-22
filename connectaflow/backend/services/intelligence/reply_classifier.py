"""
Reply Classifier — single LLM call per reply.
Returns classification + sentiment.
"""
import json
import os
from loguru import logger


async def classify_reply(reply_text: str) -> dict:
    """
    Classify a reply using LLM.
    Returns: {"classification": "interested|objection|neutral|ooo", "sentiment": "positive|negative|neutral"}
    Falls back to neutral/neutral on any error.
    """
    from config import settings
    import litellm

    if not settings.has_any_llm_provider():
        return {"classification": "neutral", "sentiment": "neutral"}

    prompt = (
        "Classify this sales reply strictly as one of: Interested, Objection, Neutral, OOO.\n"
        "Also classify sentiment as: positive, negative, neutral.\n\n"
        f"Reply: {reply_text[:2000]}\n\n"
        'Return ONLY valid JSON: {"classification": "...", "sentiment": "..."}\n'
        "No explanation, no markdown, no extra text."
    )

    model, api_key_env = _get_provider()
    if not model:
        return {"classification": "neutral", "sentiment": "neutral"}

    try:
        response = await litellm.acompletion(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            api_key=os.getenv(api_key_env),
            temperature=0.1,
            max_tokens=80,
        )
        raw = response.choices[0].message.content.strip()
        # Strip markdown fences if present
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:])
            if raw.endswith("```"):
                raw = raw.rsplit("```", 1)[0]
        result = json.loads(raw)
        classification = result.get("classification", "neutral").lower()
        sentiment = result.get("sentiment", "neutral").lower()
        # Normalize
        valid_cls = {"interested", "objection", "neutral", "ooo"}
        valid_sent = {"positive", "negative", "neutral"}
        return {
            "classification": classification if classification in valid_cls else "neutral",
            "sentiment": sentiment if sentiment in valid_sent else "neutral",
        }
    except Exception as e:
        logger.warning(f"Reply classification failed: {e}")
        return {"classification": "neutral", "sentiment": "neutral"}


async def extract_top_objections(objection_texts: list[str]) -> list[str]:
    """
    Given a list of objection reply texts, extract top 3 core objection themes.
    Returns list of up to 3 theme strings.
    """
    from config import settings
    import litellm

    if not settings.has_any_llm_provider() or not objection_texts:
        return []

    sample = "\n---\n".join(objection_texts[:30])  # cap at 30 replies
    prompt = (
        "These are sales objection replies. Extract the top 3 core objection themes.\n"
        "Be concise — each theme should be 5-10 words max.\n\n"
        f"Replies:\n{sample}\n\n"
        'Return ONLY valid JSON: {"objections": ["theme 1", "theme 2", "theme 3"]}\n'
        "No explanation, no markdown."
    )

    model, api_key_env = _get_provider()
    if not model:
        return []

    try:
        response = await litellm.acompletion(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            api_key=os.getenv(api_key_env),
            temperature=0.2,
            max_tokens=150,
        )
        raw = response.choices[0].message.content.strip()
        if raw.startswith("```"):
            lines = raw.split("\n")
            raw = "\n".join(lines[1:])
            if raw.endswith("```"):
                raw = raw.rsplit("```", 1)[0]
        result = json.loads(raw)
        return result.get("objections", [])[:3]
    except Exception as e:
        logger.warning(f"Objection extraction failed: {e}")
        return []


def _get_provider() -> tuple[str, str]:
    from config import settings
    if settings.GROQ_API_KEY:
        return "groq/llama-3.3-70b-versatile", "GROQ_API_KEY"
    if settings.GEMINI_API_KEY:
        return "gemini/gemini-2.0-flash", "GEMINI_API_KEY"
    return "", ""
