"""
ICP Scorer — spec-aligned formula:
  Final Score = ICP_fit × (0.7 × Intent + 0.3 × Timing) × 100

  icp_fit  = firmographic/structured match (0–1)
  intent   = signal strength proxy (0–1)
  timing   = recency decay of signals (0–1)

Tier assignment (run after batch scoring):
  T1 = top 20%
  T2 = next 30%
  T3 = remaining 50%
"""
import re
import math
import numpy as np
from datetime import datetime
from typing import Optional
from loguru import logger
from models import DataPoint, CompanyProfile, ICPScore, ICPRubric, ICPCriterion


def _score_criterion(value, criterion: ICPCriterion) -> float:
    """Score a single value against a criterion. Returns 0–100."""
    if value is None:
        return 0.0

    val_str = str(value).lower().strip()
    match_val = criterion.match_value

    if criterion.match_type == "contains":
        target = str(match_val).lower()
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


def _recency_decay(detected_at: datetime, half_life_days: float = 14.0) -> float:
    """Exponential decay — signal loses half its value every half_life_days."""
    age_days = (datetime.utcnow() - detected_at).total_seconds() / 86400
    return math.exp(-0.693 * age_days / half_life_days)


def score_company(
    profile: CompanyProfile,
    rubric: ICPRubric,
    signals: Optional[list] = None,
    pos_centroid: Optional[list[float]] = None,
    neg_centroid: Optional[list[float]] = None,
) -> ICPScore:
    """
    Score a company using the spec formula:
      Final Score = icp_fit × (0.7 × intent + 0.3 × timing) × 100

    icp_fit  — structured firmographic match (0–1)
    intent   — signal strength (0–1)
    timing   — recency decay of signals (0–1)
    """
    enriched = profile.enriched_data
    criterion_scores = {}
    total_weight_used = 0.0
    confidences = []

    # ── Step 1: Structured / firmographic score (icp_fit) ──────────────────
    for criterion in rubric.criteria:
        dp_dict = enriched.get(criterion.field_name)
        if dp_dict is None:
            continue

        dp_confidence = dp_dict.get("confidence", 0.5) if isinstance(dp_dict, dict) else 0.5
        dp_value = dp_dict.get("value") if isinstance(dp_dict, dict) else dp_dict

        if dp_confidence < 0.40:
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

    missing_fields = [c.field_name for c in rubric.criteria if c.field_name not in criterion_scores]

    # Insufficient data fallback
    if total_weight_used < 0.30:
        return ICPScore(
            domain=profile.domain,
            icp_id=rubric.criteria[0].field_name if rubric.criteria else "",
            fit_category="insufficient",
            missing_fields=missing_fields,
            criterion_scores=criterion_scores,
            score_confidence=0.0,
            structured_score=0.0,
            final_score=0.0,
        )

    # Renormalize weights
    norm = 1.0 / total_weight_used if total_weight_used > 0 else 0
    structured_raw = sum(
        cs["adjusted_score"] * cs["weight"] * norm
        for cs in criterion_scores.values()
    )
    # icp_fit normalized 0–1
    icp_fit = min(1.0, max(0.0, structured_raw / 100.0))

    # ── Step 2: Intent = signal strength (0–1) ──────────────────────────────
    intent = 0.0
    timing = 0.0
    signal_score_raw = 0.0

    if signals and len(signals) > 0:
        strengths = []
        recencies = []
        for sig in signals:
            strength = sig.strength if hasattr(sig, 'strength') else sig.get('strength', 0)
            detected = sig.detected_at if hasattr(sig, 'detected_at') else None
            if detected is None and isinstance(sig, dict):
                detected = sig.get('detected_at')
            if detected and isinstance(detected, datetime):
                recency = _recency_decay(detected)
            else:
                recency = 0.5  # default if no timestamp
            strengths.append(float(strength))
            recencies.append(recency)

        # intent = mean signal strength, capped at 1
        intent = min(1.0, sum(strengths) / len(strengths)) if strengths else 0.0
        # timing = mean recency decay
        timing = sum(recencies) / len(recencies) if recencies else 0.0
        # raw signal score for storage
        signal_score_raw = min(100.0, intent * 100)

    # ── Step 3: Final score using spec formula ───────────────────────────────
    if signals and len(signals) > 0:
        final_score = icp_fit * (0.7 * intent + 0.3 * timing) * 100
    else:
        # No signals — score purely on icp_fit, scaled to be meaningful
        # Use icp_fit × 0.3 max (signals required for high score per spec intent)
        final_score = icp_fit * 30.0

    final_score = float(np.clip(final_score, 0, 100))

    # ── Structured score stored for breakdown display ────────────────────────
    structured_score = structured_raw  # keep in 0–100 range for display

    # ── Semantic score (supplementary, not in final formula) ─────────────────
    semantic_score = None
    desc_dp = enriched.get("company_description") or enriched.get("company_summary")
    if desc_dp and pos_centroid:
        desc_text = desc_dp.get("value", "") if isinstance(desc_dp, dict) else str(desc_dp)
        if desc_text:
            try:
                from fastembed import TextEmbedding
                embed_model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
                embedding = list(embed_model.embed([desc_text]))[0]
                pos_sim = float(np.dot(embedding, pos_centroid) / (
                    np.linalg.norm(embedding) * np.linalg.norm(pos_centroid) + 1e-8
                ))
                neg_sim = 0.0
                if neg_centroid:
                    neg_sim = float(np.dot(embedding, neg_centroid) / (
                        np.linalg.norm(embedding) * np.linalg.norm(neg_centroid) + 1e-8
                    ))
                semantic_score = float(np.clip((pos_sim - 0.4 * neg_sim) * 100, 0, 100))
            except Exception as e:
                logger.debug(f"Semantic scoring skipped: {e}")

    # ── Confidence interval ──────────────────────────────────────────────────
    score_confidence = float(np.mean(confidences)) if confidences else 0.0
    score_std = float(np.std(confidences) * final_score / 100) if confidences else 0.0
    score_low = max(0.0, final_score - 1.96 * score_std * 100)
    score_high = min(100.0, final_score + 1.96 * score_std * 100)

    # ── Fit category ─────────────────────────────────────────────────────────
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
        signal_score=signal_score_raw if signals else None,
        final_score=final_score,
        score_low=score_low,
        score_high=score_high,
        score_confidence=score_confidence,
        fit_category=fit,
        criterion_scores=criterion_scores,
        missing_fields=missing_fields,
    )


def assign_tiers(scores: list[ICPScore]) -> list[ICPScore]:
    """
    Assign T1/T2/T3 tiers to a list of ICPScore objects.
    Call this after batch scoring is complete.
      T1 = top 20%
      T2 = next 30%
      T3 = remaining 50%
    """
    if not scores:
        return scores

    # Filter out insufficient scores, sort descending
    scored = [s for s in scores if s.final_score is not None and s.final_score > 0]
    unscored = [s for s in scores if s not in scored]

    scored.sort(key=lambda s: s.final_score or 0, reverse=True)
    n = len(scored)

    t1_cutoff = max(1, round(n * 0.20))
    t2_cutoff = max(t1_cutoff + 1, round(n * 0.50))

    for i, score in enumerate(scored):
        if i < t1_cutoff:
            score.tier = "T1"
        elif i < t2_cutoff:
            score.tier = "T2"
        else:
            score.tier = "T3"

    for score in unscored:
        score.tier = "T3"

    return scored + unscored
