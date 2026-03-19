"""
Signal Detector: deterministic signal extraction from already-fetched HTML.
Zero network cost, zero LLM calls. Pure regex on careers/pricing/about pages.
"""
import re
from datetime import datetime
from models import Signal
from services.enrichment.fetcher import DomainFetchResult
from loguru import logger


# ─────────────────────────────────────────────────────────────
# Hiring signals — regex on /careers page HTML
# ─────────────────────────────────────────────────────────────

HIRING_PATTERNS = {
    "hiring_sdr": {
        "pattern": re.compile(r'\b(?:SDR|Sales\s+Development\s+Rep|Business\s+Development\s+Rep|BDR)\b', re.IGNORECASE),
        "strength": 0.90,
        "label": "Hiring SDR/BDR",
    },
    "hiring_ae": {
        "pattern": re.compile(r'\b(?:Account\s+Executive|AE\b|Sales\s+Executive)\b', re.IGNORECASE),
        "strength": 0.85,
        "label": "Hiring Account Executive",
    },
    "hiring_vp_sales": {
        "pattern": re.compile(r'\b(?:VP\s+(?:of\s+)?Sales|Chief\s+Revenue|CRO|Head\s+of\s+Sales|Sales\s+Director)\b', re.IGNORECASE),
        "strength": 0.92,
        "label": "Hiring VP Sales / CRO",
    },
    "hiring_ai_ml": {
        "pattern": re.compile(r'\b(?:Machine\s+Learning|AI\s+Engineer|ML\s+Engineer|LLM|GenAI|Data\s+Scientist)\b', re.IGNORECASE),
        "strength": 0.80,
        "label": "Hiring AI/ML Engineers",
    },
    "hiring_engineering": {
        "pattern": re.compile(r'\b(?:Senior\s+(?:Software|Backend|Frontend)|Staff\s+Engineer|Engineering\s+Manager|Tech\s+Lead)\b', re.IGNORECASE),
        "strength": 0.70,
        "label": "Hiring Senior Engineers",
    },
    "hiring_marketing": {
        "pattern": re.compile(r'\b(?:Growth\s+(?:Manager|Lead)|Marketing\s+(?:Manager|Director)|Head\s+of\s+Marketing|CMO)\b', re.IGNORECASE),
        "strength": 0.75,
        "label": "Hiring Marketing Leadership",
    },
}


def detect_hiring_signals(careers_html: str, domain: str) -> list[Signal]:
    """Detect hiring signals from /careers page. Zero cost, pure regex."""
    signals = []
    if not careers_html:
        return signals

    for signal_type, config in HIRING_PATTERNS.items():
        matches = config["pattern"].findall(careers_html)
        if matches:
            signals.append(Signal(
                domain=domain,
                signal_type=signal_type,
                strength=config["strength"],
                source_url=f"https://{domain}/careers",
                evidence=f"Found: {', '.join(set(matches[:3]))}",
                detected_at=datetime.utcnow(),
            ))

    return signals


# ─────────────────────────────────────────────────────────────
# Negative space signals — what's ABSENT is data
# ─────────────────────────────────────────────────────────────

def detect_negative_space(fetch_results: dict[str, any], domain: str) -> list[Signal]:
    """
    Detect signals from page absence:
    - No /pricing → enterprise pricing (custom deals, larger ACV)
    - No /careers → not actively hiring (stable or very small)
    - No /about → very early-stage or landing page only
    """
    signals = []

    page_statuses = fetch_results.get("page_statuses")
    if isinstance(page_statuses, dict) and page_statuses:
        items = page_statuses.items()
    else:
        # Backward-compatible fallback for older metadata shapes.
        items = (
            (path, meta)
            for path, meta in fetch_results.items()
            if isinstance(path, str) and path.startswith("/")
        )

    # Check each path's status
    for path, meta in items:
        status = 0
        if hasattr(meta, 'status'):
            status = meta.status
        elif isinstance(meta, dict):
            status = meta.get('status', 0)

        if path in ("/pricing", "/pricing/") and (status == 404 or status == 0):
            signals.append(Signal(
                domain=domain,
                signal_type="enterprise_pricing",
                strength=0.70,
                source_url=f"https://{domain}/pricing",
                evidence="No public pricing page — likely enterprise/custom pricing model",
                detected_at=datetime.utcnow(),
            ))
        elif path in ("/careers", "/careers/") and (status == 404 or status == 0):
            signals.append(Signal(
                domain=domain,
                signal_type="not_hiring",
                strength=0.65,
                source_url=f"https://{domain}/careers",
                evidence="No careers page found — not actively hiring or very small team",
                detected_at=datetime.utcnow(),
            ))
        elif path in ("/about", "/about-us", "/about/") and (status == 404 or status == 0):
            signals.append(Signal(
                domain=domain,
                signal_type="early_stage",
                strength=0.55,
                source_url=f"https://{domain}/about",
                evidence="No about page — potentially very early stage",
                detected_at=datetime.utcnow(),
            ))

    return signals


# ─────────────────────────────────────────────────────────────
# Master detector: combine all signal sources
# ─────────────────────────────────────────────────────────────

def detect_all_signals(
    pages: dict[str, str],  # path → HTML
    fetch_meta: dict,
    domain: str,
) -> list[Signal]:
    """Run all signal detectors on already-fetched content. Zero extra cost."""
    signals = []

    # Hiring signals from careers page
    careers_html = pages.get("/careers", "") or pages.get("/careers/", "")
    if careers_html:
        signals.extend(detect_hiring_signals(careers_html, domain))

    # Negative space signals
    signals.extend(detect_negative_space(fetch_meta, domain))

    deduped: dict[str, Signal] = {}
    for signal in signals:
        current = deduped.get(signal.signal_type)
        if current is None or signal.strength > current.strength:
            deduped[signal.signal_type] = signal

    if any(signal_type.startswith("hiring_") for signal_type in deduped):
        deduped.pop("not_hiring", None)

    signals = list(deduped.values())

    logger.debug(f"{domain}: detected {len(signals)} signals")
    return signals
