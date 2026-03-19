"""
Cross-validator: multi-source agreement/conflict resolution.
Core quality guarantee — prefer null over wrong.
"""
from typing import Optional
from models import DataPoint
from loguru import logger


# Source reliability tiers (lower = more authoritative)
SOURCE_TIERS = {
    "manual_override": 0,
    "schema_org": 1,
    "dns_mx": 1,
    "contact_points": 1,
    "http_headers": 2,
    "html_scripts": 2,
    "meta_og": 2,
    "meta_html": 2,
    "commoncrawl": 2,
    "text_pattern": 3,
    "llm_synthesis": 3,
    "jina_reader": 2,
}


def _normalize_for_comparison(val) -> str:
    """Normalize a value for fuzzy comparison."""
    return str(val).lower().strip().replace(",", "").replace(".", "")


def _format_source_list(sources: list[str]) -> str:
    unique = list(dict.fromkeys(source for source in sources if source))
    return ", ".join(unique)


def cross_validate_field(candidates: list[DataPoint], field_name: str = "") -> Optional[DataPoint]:
    """
    The quality guarantee:
    - Multiple sources agree → boost confidence
    - Single source → use at face value
    - Conflict → use highest tier, reduce confidence, flag it
    - No sources → None (NEVER guess)
    """
    if not candidates:
        return None

    # Filter out empty/null values
    valid = [c for c in candidates if c.value is not None and str(c.value).strip()]
    if not valid:
        return None

    if len(valid) == 1:
        return valid[0]

    # Sort by source tier (lower = more authoritative)
    valid.sort(key=lambda d: SOURCE_TIERS.get(d.source, 99))

    # Check agreement using normalized values
    normalized = [_normalize_for_comparison(c.value) for c in valid]
    unique_values = set(normalized)

    if len(unique_values) == 1:
        # All sources agree → boost confidence
        best = valid[0]
        best.confidence = min(0.99, best.confidence + 0.08)
        agreeing_sources = _format_source_list([point.source for point in valid])
        best.evidence = f"Confirmed by {len(set(point.source for point in valid))} source types ({agreeing_sources}). {best.evidence or ''}".strip()
        return best
    else:
        # Conflict — use tier-1 source, penalize confidence
        best = valid[0]
        best.confidence *= 0.70
        conflicting_sources = _format_source_list([c.source for c in valid[1:] if _normalize_for_comparison(c.value) != normalized[0]])
        if conflicting_sources:
            best.evidence = f"Source disagreement with {conflicting_sources}. Using {best.source}. {best.evidence or ''}".strip()
        logger.debug(f"Cross-validation conflict for {field_name}: {[c.value for c in valid]}")
        return best


def cross_validate_all(all_points: list[DataPoint]) -> dict[str, DataPoint]:
    """
    Group DataPoints by field type and cross-validate each.
    Returns dict of field_name → best DataPoint.
    """
    # Group points by their semantic field
    groups: dict[str, list[DataPoint]] = {}
    for p in all_points:
        # Determine field from evidence/source
        field = _classify_field(p)
        if field:
            groups.setdefault(field, []).append(p)

    result = {}
    for field_name, candidates in groups.items():
        validated = cross_validate_field(candidates, field_name)
        if validated:
            result[field_name] = validated

    return result


def _classify_field(point: DataPoint) -> Optional[str]:
    """Classify a DataPoint into a semantic field based on context."""
    evidence = (point.evidence or "").lower()
    source = point.source

    if any(kw in evidence for kw in ["employee", "team_of", "team_member", "numberofemployees", "people"]):
        return "employee_count"
    if any(kw in evidence for kw in ["founded", "founding", "established", "since"]):
        return "founded_year"
    if any(kw in evidence for kw in ["address", "location", "addresslocality"]):
        return "hq_location"
    if "industry" in evidence:
        return "industry"
    if "business_model" in evidence:
        return "business_model"
    if "pricing_model" in evidence:
        return "pricing_model"
    if any(kw in evidence for kw in ["funding_stage", "funding_amount"]):
        return "funding_stage"
    if any(kw in evidence for kw in ["customer_count", "trusted_by"]):
        return "customer_count"
    if any(kw in evidence for kw in ["headers", "tech", "vercel", "cloudflare", "server"]):
        return "tech_stack"
    if any(kw in evidence for kw in ["telephone", "phone", "tel link", "contactpoint telephone"]):
        return "company_phone"
    if "linkedin" in evidence:
        return "linkedin_url"
    if any(kw in evidence for kw in ["description", "summary", "og:description"]):
        return "company_description"
    if any(kw in evidence for kw in ["@type=", "site_name", "og:site_name"]):
        return "company_name"
    if source == "schema_org" and isinstance(point.value, str) and len(point.value) < 100:
        return "company_name"

    return None


def compute_quality_score(enriched: dict[str, DataPoint], important_fields: list[str] = None) -> float:
    """
    Quality = (reliable fields present) / (important fields expected)
    """
    if important_fields is None:
        important_fields = ["company_name", "employee_count", "industry", "business_model", "hq_location", "company_description"]

    reliable_count = 0
    for field in important_fields:
        dp = enriched.get(field)
        if dp and dp.confidence >= 0.50:
            reliable_count += 1

    return reliable_count / max(len(important_fields), 1)


def quality_tier(score: float) -> str:
    if score >= 0.70:
        return "high"
    elif score >= 0.40:
        return "medium"
    elif score > 0:
        return "low"
    else:
        return "insufficient"
