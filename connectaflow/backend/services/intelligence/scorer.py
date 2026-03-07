"""
ICP Scorer: hybrid structured + semantic + signal scoring.
Adapted from RFM paper: weighted multi-criteria with confidence intervals.
"""
import re
import numpy as np
from typing import Optional
from loguru import logger
from models import DataPoint, CompanyProfile, ICPScore, ICPRubric, ICPCriterion


def _score_criterion(value, criterion: ICPCriterion) -> float:
    """Score a single value against a criterion. Returns 0-100."""
    if value is None:
        return 0.0

    val_str = str(value).lower().strip()
    match_val = criterion.match_value

    if criterion.match_type == "contains":
        target = str(match_val).lower()
        # Check if any of the target terms appear
        terms = [t.strip() for t in target.split(",")]
        matches = sum(1 for t in terms if t in val_str)
        if matches > 0:
            return min(100, (matches / max(len(terms), 1)) * 100)
        return 0.0

    elif criterion.match_type == "range":
        try:
            num_val = float(re.sub(r'[^\d.]', '', val_str))
            if isinstance(match_val, (list, tuple)) and len(match_val) == 2:
                low, high = float(match_val[0]), float(match_val[1])
                if low <= num_val <= high:
                    return 100.0
                # Partial credit for being close
                if num_val < low:
                    return max(0, 100 - (low - num_val) / low * 100)
                else:
                    return max(0, 100 - (num_val - high) / high * 100)
        except (ValueError, TypeError):
            return 0.0

    elif criterion.match_type == "exact":
        if val_str == str(match_val).lower().strip():
            return 100.0
        return 0.0

    elif criterion.match_type == "regex":
        try:
            if re.search(str(match_val), val_str, re.IGNORECASE):
                return 100.0
        except re.error:
            pass
        return 0.0

    return 0.0


def score_company(
    profile: CompanyProfile,
    rubric: ICPRubric,
    signals: Optional[list] = None,
    pos_centroid: Optional[list[float]] = None,
    neg_centroid: Optional[list[float]] = None,
) -> ICPScore:
    """
    Score a company against an ICP using 3 dimensions:
    - Structured (50%): per-criterion scoring from enriched data
    - Semantic (30%): embedding similarity to ICP centroids
    - Signal (20%): active signals weighted by strength × recency
    """
    enriched = profile.enriched_data
    criterion_scores = {}
    total_weight_used = 0.0
    confidences = []

    # ── Structured score (50%) ──────────────────────────────
    for criterion in rubric.criteria:
        dp_dict = enriched.get(criterion.field_name)

        if dp_dict is None:
            # Missing field — skip, redistribute weight
            continue

        dp_confidence = dp_dict.get("confidence", 0.5) if isinstance(dp_dict, dict) else 0.5
        dp_value = dp_dict.get("value") if isinstance(dp_dict, dict) else dp_dict

        if dp_confidence < 0.40:
            # Too low confidence — include heavily discounted
            raw = _score_criterion(dp_value, criterion)
            adjusted = raw * dp_confidence * 0.5
            criterion_scores[criterion.field_name] = {
                "label": criterion.label,
                "raw_score": raw,
                "adjusted_score": adjusted,
                "weight": criterion.weight,
                "confidence": dp_confidence,
                "warning": "low_confidence",
            }
        else:
            raw = _score_criterion(dp_value, criterion)
            adjusted = raw * dp_confidence
            criterion_scores[criterion.field_name] = {
                "label": criterion.label,
                "raw_score": raw,
                "adjusted_score": adjusted,
                "weight": criterion.weight,
                "confidence": dp_confidence,
            }

        total_weight_used += criterion.weight
        confidences.append(dp_confidence)

    # Insufficient data check
    missing_fields = [c.field_name for c in rubric.criteria if c.field_name not in criterion_scores]
    if total_weight_used < 0.30:
        return ICPScore(
            domain=profile.domain,
            icp_id=rubric.criteria[0].field_name if rubric.criteria else "",
            fit_category="insufficient",
            missing_fields=missing_fields,
            criterion_scores=criterion_scores,
            score_confidence=0.0,
        )

    # Renormalize weights for available criteria
    norm = 1.0 / total_weight_used if total_weight_used > 0 else 0
    structured_score = sum(
        cs["adjusted_score"] * cs["weight"] * norm
        for cs in criterion_scores.values()
    )

    # ── Semantic score (30%) ────────────────────────────────
    semantic_score = None
    desc_dp = enriched.get("company_description") or enriched.get("company_summary")
    if desc_dp and pos_centroid:
        desc_text = desc_dp.get("value", "") if isinstance(desc_dp, dict) else str(desc_dp)
        if desc_text:
            try:
                from fastembed import TextEmbedding
                embed_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
                embedding = list(embed_model.embed([desc_text]))[0]

                # Cosine similarity to positive centroid
                pos_sim = float(np.dot(embedding, pos_centroid) / (
                    np.linalg.norm(embedding) * np.linalg.norm(pos_centroid) + 1e-8
                ))

                # Contrastive: subtract similarity to negative centroid
                neg_sim = 0.0
                if neg_centroid:
                    neg_sim = float(np.dot(embedding, neg_centroid) / (
                        np.linalg.norm(embedding) * np.linalg.norm(neg_centroid) + 1e-8
                    ))

                semantic_score = float(np.clip((pos_sim - 0.4 * neg_sim) * 100, 0, 100))
            except Exception as e:
                logger.debug(f"Semantic scoring failed: {e}")

    # ── Signal score (20%) ──────────────────────────────────
    signal_score = 0.0
    if signals:
        for sig in signals:
            strength = sig.strength if hasattr(sig, 'strength') else sig.get('strength', 0)
            signal_score += strength * 20  # Scale signals to 0-100 range
        signal_score = min(100.0, signal_score)

    # ── Combine scores ──────────────────────────────────────
    components = [(structured_score, 0.50)]
    if semantic_score is not None:
        components.append((semantic_score, 0.30))
    else:
        # Redistribute semantic weight to structural
        components[0] = (structured_score, 0.80)
    if signals:
        components.append((signal_score, 0.20))
    else:
        # Redistribute signal weight proportionally
        total_w = sum(w for _, w in components)
        components = [(s, w / total_w) for s, w in components]

    final_score = sum(s * w for s, w in components)

    # ── Confidence interval ─────────────────────────────────
    score_confidence = float(np.mean(confidences)) if confidences else 0.0
    score_std = float(np.std(confidences) * final_score / 100) if confidences else 0.0
    score_low = max(0, final_score - 1.96 * score_std * 100)
    score_high = min(100, final_score + 1.96 * score_std * 100)

    # ── Fit category ────────────────────────────────────────
    if final_score >= 70:
        fit = "high"
    elif final_score >= 45:
        fit = "medium"
    elif final_score > 0:
        fit = "low"
    else:
        fit = "insufficient"

    return ICPScore(
        domain=profile.domain,
        icp_id=rubric.criteria[0].field_name if rubric.criteria else "",
        structured_score=structured_score,
        semantic_score=semantic_score,
        signal_score=signal_score if signals else None,
        final_score=final_score,
        score_low=score_low,
        score_high=score_high,
        score_confidence=score_confidence,
        fit_category=fit,
        criterion_scores=criterion_scores,
        missing_fields=missing_fields,
    )
