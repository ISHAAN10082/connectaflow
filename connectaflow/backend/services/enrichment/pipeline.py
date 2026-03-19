"""
Pipeline orchestrator: the main enrichment flow.
CC first → live httpx fallback → extractors → cross-validate → LLM for gaps → quality gate.
"""
import asyncio
from datetime import datetime, timedelta
from typing import Optional, Callable
from loguru import logger

from models import DataPoint, CompanyProfile
from config import settings
from services.enrichment.fetcher import fetch_domain, DomainFetchResult
from services.enrichment.commoncrawl import cc_batch_lookup
from services.enrichment.extractors import extract_all_from_page
from services.enrichment.cross_validator import cross_validate_all, compute_quality_score, quality_tier
from services.enrichment.llm_extract import llm_extract
from services.signals.detector import detect_all_signals

try:
    import trafilatura
except ImportError:
    trafilatura = None


IMPORTANT_FIELDS = ["company_name", "employee_count", "industry", "business_model", "hq_location", "company_description"]


async def enrich_single(
    domain: str,
    cc_pages: Optional[dict[str, str]] = None,
    semaphore: Optional[asyncio.Semaphore] = None,
) -> tuple[CompanyProfile, dict[str, str]]:
    """
    Enrich a single company domain:
    1. Use CC pages if available, else live fetch
    2. Run all deterministic extractors
    3. Cross-validate across sources
    4. LLM for missing fields
    5. Quality gate
    """
    all_data_points: list[DataPoint] = []
    sources_used = []
    fetch_meta = {}

    # ── Step 1: Get page HTML ────────────────────────────
    pages_html: dict[str, str] = {}
    if cc_pages:
        # Common Crawl hit — use cached pages
        sources_used.append("commoncrawl")
        for path, html in cc_pages.items():
            points = extract_all_from_page(html, {}, f"https://{domain}{path}")
            # Tag as CC source
            for p in points:
                if p.source != "http_headers":
                    p.source = f"commoncrawl_{p.source}"
            all_data_points.extend(points)
            pages_html[path] = html
        fetch_meta["source"] = "commoncrawl"
        fetch_meta["pages_found"] = len(cc_pages)
        fetch_meta["page_statuses"] = {path or "/": 200 for path in cc_pages.keys()}
    else:
        # Live fetch via httpx
        sem = semaphore or asyncio.Semaphore(30)
        fetch_result = await fetch_domain(domain, sem)
        sources_used.append("httpx")
        fetch_meta["source"] = "httpx"
        fetch_meta["pages_found"] = sum(1 for p in fetch_result.pages.values() if p.html)
        fetch_meta["page_statuses"] = {path or "/": page.status for path, page in fetch_result.pages.items()}

        for path, page in fetch_result.pages.items():
            if page.html:
                points = extract_all_from_page(page.html, page.headers, page.url)
                all_data_points.extend(points)
                pages_html[path or "/"] = page.html
            if page.error:
                fetch_meta[f"error_{path}"] = page.error

        # DNS MX signal
        if fetch_result.dns_mx:
            all_data_points.append(DataPoint(
                value=fetch_result.dns_mx,
                confidence=0.90,
                source="dns_mx",
                source_url=f"dns://{domain}",
                evidence=f"MX record: {fetch_result.dns_mx}",
            ))
            sources_used.append("dns_mx")

    # ── Step 2: Cross-validate ────────────────────────────
    validated = cross_validate_all(all_data_points)
    sources_used.extend(list(set(p.source for p in validated.values())))

    # ── Step 3: LLM for missing fields ────────────────────
    missing = [f for f in IMPORTANT_FIELDS if f not in validated]
    if missing:
        # Get text for LLM from pages
        all_text = ""
        if cc_pages:
            for html in cc_pages.values():
                if trafilatura:
                    t = trafilatura.extract(html, include_comments=False) or ""
                    all_text += t + "\n"
        else:
            for html in pages_html.values():
                if trafilatura:
                    t = trafilatura.extract(html, include_comments=False) or ""
                else:
                    import re
                    t = re.sub(r"<[^>]+>", " ", html)
                all_text += (t or "") + "\n"

        if all_text.strip():
            llm_results = await llm_extract(all_text, missing, f"https://{domain}")
            for field_name, dp_dict in llm_results.items():
                if field_name not in validated:
                    validated[field_name] = DataPoint(**dp_dict)
                    sources_used.append("llm_synthesis")

    # ── Step 4: Quality gate ──────────────────────────────
    q_score = compute_quality_score(validated, IMPORTANT_FIELDS)
    q_tier = quality_tier(q_score)

    # ── Step 5: Build CompanyProfile ──────────────────────
    enriched_data = {}
    for field_name, dp in validated.items():
        enriched_data[field_name] = dp.model_dump()

    profile = CompanyProfile(
        domain=domain,
        name=validated.get("company_name", DataPoint(value=domain, confidence=0.50, source="domain")).value,
        enriched_data=enriched_data,
        quality_score=q_score,
        quality_tier=q_tier,
        sources_used=list(set(sources_used)),
        enriched_at=datetime.utcnow(),
        cache_expires_at=datetime.utcnow() + timedelta(days=settings.ENRICHMENT_CACHE_TTL_DAYS),
        fetch_metadata=fetch_meta,
    )

    return profile, pages_html


async def enrich_batch(
    domains: list[str],
    concurrency: int = None,
    on_progress: Optional[Callable] = None,
) -> list[tuple[CompanyProfile, dict[str, str]]]:
    """
    Enrich a batch of domains (up to 500 for MVP):
    1. Deduplicate
    2. Check Common Crawl for all domains (Tier 0 — free, fast)
    3. Live-fetch domains not in CC
    4. Run enrichment pipeline for all
    5. Stream progress via callback
    """
    concurrency = concurrency or settings.ENRICHMENT_CONCURRENCY

    # Deduplicate
    unique_domains = list(dict.fromkeys(d.strip().lower() for d in domains if d.strip()))
    total = len(unique_domains)
    logger.info(f"Starting batch enrichment: {total} domains")

    # ── Step 1: Common Crawl batch lookup ──────────────────
    if on_progress:
        await on_progress({"type": "phase", "phase": "commoncrawl_lookup", "total": total})

    cc_results = await cc_batch_lookup(unique_domains, concurrency=min(concurrency, 10))
    cc_hits = set(cc_results.keys())
    live_fetch_domains = [d for d in unique_domains if d not in cc_hits]

    logger.info(f"CC hits: {len(cc_hits)}/{total}. Live fetch needed: {len(live_fetch_domains)}")
    if on_progress:
        await on_progress({
            "type": "phase",
            "phase": "cc_complete",
            "cc_hits": len(cc_hits),
            "live_needed": len(live_fetch_domains),
        })

    # ── Step 2: Enrich all domains ─────────────────────────
    profiles = []
    semaphore = asyncio.Semaphore(concurrency)
    completed = 0

    async def _enrich_one(domain: str) -> Optional[tuple[CompanyProfile, dict[str, str]]]:
        nonlocal completed
        try:
            cc_pages = cc_results.get(domain)
            profile, pages_html = await enrich_single(domain, cc_pages=cc_pages, semaphore=semaphore)
            completed += 1
            if on_progress:
                await on_progress({
                    "type": "company_done",
                    "domain": domain,
                    "quality_score": profile.quality_score,
                    "quality_tier": profile.quality_tier,
                    "sources": profile.sources_used,
                    "completed": completed,
                    "total": total,
                })
            return profile, pages_html
        except Exception as e:
            completed += 1
            logger.error(f"Enrichment failed for {domain}: {e}")
            if on_progress:
                await on_progress({
                    "type": "company_failed",
                    "domain": domain,
                    "error": str(e)[:200],
                    "completed": completed,
                    "total": total,
                })
            return None

    # Process in chunks to avoid overwhelming
    CHUNK_SIZE = 30
    for i in range(0, len(unique_domains), CHUNK_SIZE):
        chunk = unique_domains[i:i + CHUNK_SIZE]
        chunk_results = await asyncio.gather(*[_enrich_one(d) for d in chunk])
        profiles.extend([p for p in chunk_results if p is not None])

    logger.info(f"Batch complete: {len(profiles)}/{total} succeeded")
    return profiles
