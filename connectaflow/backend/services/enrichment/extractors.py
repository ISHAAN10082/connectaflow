"""
Extractors: deterministic data extraction from already-fetched HTML.
All run locally, zero network cost, zero API calls.
"""
import re
import json
from typing import Optional
from models import DataPoint
from loguru import logger

try:
    import trafilatura
except ImportError:
    trafilatura = None

try:
    from selectolax.parser import HTMLParser
except ImportError:
    HTMLParser = None


# ─────────────────────────────────────────────────────────────
# Schema.org JSON-LD extraction (Tier 1 — company's own structured data)
# ─────────────────────────────────────────────────────────────

def extract_schema_org(html: str, source_url: str) -> list[DataPoint]:
    """Parse <script type="application/ld+json"> blocks for structured company data."""
    points = []
    pattern = re.compile(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', re.DOTALL | re.IGNORECASE)

    for match in pattern.finditer(html):
        try:
            data = json.loads(match.group(1).strip())
            items = data if isinstance(data, list) else [data]
            for item in items:
                _type = item.get("@type", "")
                if _type in ("Organization", "Corporation", "LocalBusiness", "Company"):
                    if name := item.get("name"):
                        points.append(DataPoint(value=name, confidence=0.95, source="schema_org", source_url=source_url, evidence=f"schema.org @type={_type}"))
                    if emp := item.get("numberOfEmployees"):
                        val = emp.get("value") if isinstance(emp, dict) else emp
                        if val:
                            points.append(DataPoint(value=str(val), confidence=0.90, source="schema_org", source_url=source_url, evidence=f"numberOfEmployees={val}"))
                    if loc := item.get("address"):
                        if isinstance(loc, dict):
                            addr = loc.get("addressLocality", "") + ", " + loc.get("addressCountry", "")
                            points.append(DataPoint(value=addr.strip(", "), confidence=0.90, source="schema_org", source_url=source_url, evidence=f"address={addr}"))
                        elif isinstance(loc, str):
                            points.append(DataPoint(value=loc, confidence=0.85, source="schema_org", source_url=source_url, evidence=f"address={loc}"))
                    if founded := item.get("foundingDate"):
                        points.append(DataPoint(value=str(founded)[:4], confidence=0.92, source="schema_org", source_url=source_url, evidence=f"foundingDate={founded}"))
                    if industry := item.get("industry"):
                        points.append(DataPoint(value=industry, confidence=0.85, source="schema_org", source_url=source_url, evidence=f"industry={industry}"))
                    if desc := item.get("description"):
                        points.append(DataPoint(value=desc[:500], confidence=0.85, source="schema_org", source_url=source_url, evidence="schema.org description"))
        except (json.JSONDecodeError, TypeError, AttributeError):
            continue

    return points


# ─────────────────────────────────────────────────────────────
# Meta tag extraction (Tier 2 — OpenGraph and HTML meta)
# ─────────────────────────────────────────────────────────────

def extract_meta_tags(html: str, source_url: str) -> list[DataPoint]:
    """Extract company info from <meta> tags."""
    points = []

    og_desc = re.search(r'<meta[^>]*property=["\']og:description["\'][^>]*content=["\']([^"\']*)["\']', html, re.IGNORECASE)
    if og_desc and len(og_desc.group(1)) > 20:
        points.append(DataPoint(value=og_desc.group(1)[:500], confidence=0.75, source="meta_og", source_url=source_url, evidence="og:description"))

    og_title = re.search(r'<meta[^>]*property=["\']og:site_name["\'][^>]*content=["\']([^"\']*)["\']', html, re.IGNORECASE)
    if og_title:
        points.append(DataPoint(value=og_title.group(1), confidence=0.80, source="meta_og", source_url=source_url, evidence="og:site_name"))

    meta_desc = re.search(r'<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']*)["\']', html, re.IGNORECASE)
    if meta_desc and len(meta_desc.group(1)) > 20:
        points.append(DataPoint(value=meta_desc.group(1)[:500], confidence=0.70, source="meta_html", source_url=source_url, evidence="meta description"))

    return points


# ─────────────────────────────────────────────────────────────
# Text pattern extraction (Tier 3 — regex on page text)
# ─────────────────────────────────────────────────────────────

EMPLOYEE_PATTERNS = [
    (re.compile(r'(\d[\d,]+)\s*(?:\+\s*)?employees', re.IGNORECASE), "employees_text"),
    (re.compile(r'team\s+of\s+(\d[\d,]+)', re.IGNORECASE), "team_of_text"),
    (re.compile(r'(\d[\d,]+)\s*(?:\+\s*)?team\s+members', re.IGNORECASE), "team_members_text"),
    (re.compile(r'over\s+(\d[\d,]+)\s+(?:people|staff|professionals)', re.IGNORECASE), "over_people_text"),
]

FOUNDED_PATTERNS = [
    (re.compile(r'(?:founded|established|since|started)\s+(?:in\s+)?(\d{4})', re.IGNORECASE), "founded_text"),
]

BUSINESS_MODEL_SIGNALS = {
    "B2B SaaS": re.compile(r'(?:SaaS|software as a service|cloud.?based\s+(?:platform|solution)|subscription)', re.IGNORECASE),
    "B2B": re.compile(r'(?:enterprise|business(?:es)?|companies|organizations)\s+(?:use|trust|choose|rely)', re.IGNORECASE),
    "B2C": re.compile(r'(?:consumers?|individuals?|personal\s+use|download\s+(?:the\s+)?app)', re.IGNORECASE),
    "Marketplace": re.compile(r'(?:marketplace|connect\s+(?:buyers?|sellers?)|two.?sided)', re.IGNORECASE),
}

CUSTOMER_COUNT_PATTERNS = [
    (re.compile(r'(\d[\d,]+)\+?\s+(?:customers|businesses|brands)\b', re.IGNORECASE), "customer_count"),
    (re.compile(r'trusted\s+by\s+(\d[\d,]+)\+?\s+(?:customers|companies|teams)\b', re.IGNORECASE), "trusted_by"),
]

FUNDING_STAGE_PATTERNS = [
    (re.compile(r'\b(series\s+[a-f])\b', re.IGNORECASE), "funding_stage"),
    (re.compile(r'\b(seed|pre-seed|series\s+seed)\b', re.IGNORECASE), "funding_stage"),
    (re.compile(r'\b(raised|announced)\s+\$?(\d[\d,.]+)\s*(m|million|b|billion)?\b', re.IGNORECASE), "funding_amount"),
]

PRICING_MODEL_PATTERNS = {
    "usage_based": re.compile(r'(usage-based|pay as you go|per api call|per event|consumption based)', re.IGNORECASE),
    "per_seat": re.compile(r'(per seat|per user|per teammate|per rep)', re.IGNORECASE),
    "flat_rate": re.compile(r'(flat monthly|flat annual|fixed price)', re.IGNORECASE),
    "custom_enterprise": re.compile(r'(contact sales|custom pricing|talk to sales|enterprise pricing)', re.IGNORECASE),
    "freemium": re.compile(r'(free plan|get started free|forever free|free tier)', re.IGNORECASE),
}

TECH_SCRIPT_PATTERNS = {
    "hubspot": re.compile(r'hs-scripts|hubspot', re.IGNORECASE),
    "segment": re.compile(r'segment\.com|cdn\.segment', re.IGNORECASE),
    "intercom": re.compile(r'intercom', re.IGNORECASE),
    "drift": re.compile(r'drift', re.IGNORECASE),
    "marketo": re.compile(r'marketo', re.IGNORECASE),
    "salesforce": re.compile(r'salesforce|pardot', re.IGNORECASE),
    "clearbit": re.compile(r'clearbit', re.IGNORECASE),
    "6sense": re.compile(r'6sense', re.IGNORECASE),
    "mixpanel": re.compile(r'mixpanel', re.IGNORECASE),
    "hotjar": re.compile(r'hotjar', re.IGNORECASE),
    "google_analytics": re.compile(r'googletagmanager|google-analytics|gtag', re.IGNORECASE),
    "shopify": re.compile(r'cdn\.shopify|shopify', re.IGNORECASE),
}


def extract_from_text(html: str, source_url: str) -> list[DataPoint]:
    """Extract structured data using regex patterns on page text."""
    points = []

    # Get clean text
    if trafilatura:
        text = trafilatura.extract(html, include_comments=False, include_tables=False) or ""
    else:
        text = re.sub(r'<[^>]+>', ' ', html)
        text = re.sub(r'\s+', ' ', text)

    # Employee count
    for pattern, evidence_tag in EMPLOYEE_PATTERNS:
        m = pattern.search(text)
        if m:
            val = m.group(1).replace(",", "")
            try:
                num = int(val)
                if 1 <= num <= 500000:
                    points.append(DataPoint(value=num, confidence=0.65, source="text_pattern", source_url=source_url, evidence=f"{evidence_tag}: {m.group(0)[:100]}"))
                    break
            except ValueError:
                pass

    # Founded year
    for pattern, evidence_tag in FOUNDED_PATTERNS:
        m = pattern.search(text)
        if m:
            year = int(m.group(1))
            if 1900 <= year <= 2026:
                points.append(DataPoint(value=year, confidence=0.70, source="text_pattern", source_url=source_url, evidence=f"{evidence_tag}: {m.group(0)[:100]}"))
                break

    # Business model detection
    for model_name, pattern in BUSINESS_MODEL_SIGNALS.items():
        if pattern.search(text):
            points.append(DataPoint(value=model_name, confidence=0.60, source="text_pattern", source_url=source_url, evidence=f"business_model signal: {model_name}"))
            break

    for pattern, evidence_tag in CUSTOMER_COUNT_PATTERNS:
        m = pattern.search(text)
        if m:
            try:
                customers = int(m.group(1).replace(",", ""))
            except ValueError:
                continue
            if 1 <= customers <= 10_000_000:
                points.append(DataPoint(value=customers, confidence=0.62, source="text_pattern", source_url=source_url, evidence=f"{evidence_tag}: {m.group(0)[:120]}"))
                break

    for pattern, evidence_tag in FUNDING_STAGE_PATTERNS:
        m = pattern.search(text)
        if not m:
            continue
        if evidence_tag == "funding_stage":
            points.append(DataPoint(value=m.group(1).title(), confidence=0.68, source="text_pattern", source_url=source_url, evidence=f"funding_stage: {m.group(0)[:120]}"))
            break
        amount = " ".join(part for part in m.groups()[1:] if part).strip()
        if amount:
            points.append(DataPoint(value=amount, confidence=0.58, source="text_pattern", source_url=source_url, evidence=f"funding_amount: {m.group(0)[:120]}"))
            break

    for pricing_model, pattern in PRICING_MODEL_PATTERNS.items():
        if pattern.search(text):
            points.append(DataPoint(value=pricing_model, confidence=0.64, source="text_pattern", source_url=source_url, evidence=f"pricing_model: {pricing_model}"))
            break

    return points


# ─────────────────────────────────────────────────────────────
# HTTP Header tech stack extraction (Tier 2 — from already-fetched headers)
# ─────────────────────────────────────────────────────────────

TECH_HEADER_MAP = {
    "x-powered-by": "tech_framework",
    "server": "tech_server",
    "x-vercel-id": "vercel",
    "x-amz-cf-id": "aws_cloudfront",
    "cf-ray": "cloudflare",
    "x-shopify-stage": "shopify",
    "x-wix-request-id": "wix",
    "x-wordpress": "wordpress",
}


def extract_tech_from_headers(headers: dict, source_url: str) -> list[DataPoint]:
    """Extract tech stack signals from HTTP response headers."""
    points = []
    detected = []

    for header_key, signal_name in TECH_HEADER_MAP.items():
        val = headers.get(header_key)
        if val:
            if signal_name in ("tech_framework", "tech_server"):
                detected.append(val)
            else:
                detected.append(signal_name)

    if detected:
        points.append(DataPoint(
            value=detected,
            confidence=0.80,
            source="http_headers",
            source_url=source_url,
            evidence=f"headers: {', '.join(detected)}"
        ))

    return points


def extract_tech_from_scripts(html: str, source_url: str) -> list[DataPoint]:
    """Infer website tooling from embedded script URLs and inline vendor tags."""
    detected = []
    for tech_name, pattern in TECH_SCRIPT_PATTERNS.items():
        if pattern.search(html):
            detected.append(tech_name)

    if not detected:
        return []

    return [
        DataPoint(
            value=sorted(set(detected)),
            confidence=0.72,
            source="html_scripts",
            source_url=source_url,
            evidence=f"script tech: {', '.join(sorted(set(detected)))}",
        )
    ]


# ─────────────────────────────────────────────────────────────
# Master extractor: runs all deterministic extractors on a page
# ─────────────────────────────────────────────────────────────

def extract_all_from_page(html: str, headers: dict, source_url: str) -> list[DataPoint]:
    """Run all deterministic extractors on a single page. ~50ms total, CPU only."""
    points = []
    points.extend(extract_schema_org(html, source_url))
    points.extend(extract_meta_tags(html, source_url))
    points.extend(extract_from_text(html, source_url))
    points.extend(extract_tech_from_headers(headers, source_url))
    points.extend(extract_tech_from_scripts(html, source_url))
    return points
