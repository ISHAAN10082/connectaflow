"""
External Signal Discovery — runs every 6 hours via APScheduler.
Discovers companies matching ICPs that have active buying signals.
Does NOT auto-add them to the system; users review and add manually.
"""
import asyncio
import uuid
from datetime import datetime
from loguru import logger
from sqlmodel import Session, select

from models import ICP, GTMContext, ExternalSignal, Signal, DEFAULT_WORKSPACE_ID
from database import engine


async def run_external_discovery():
    """
    Main discovery job.
    Called by APScheduler every N hours.
    """
    logger.info("External signal discovery job started")
    try:
        with Session(engine) as session:
            await _discover_for_workspace(DEFAULT_WORKSPACE_ID, session)
    except Exception as e:
        logger.error(f"External signal discovery failed: {e}")
    logger.info("External signal discovery job completed")


async def _discover_for_workspace(workspace_id: uuid.UUID, session: Session):
    """Discover external signals for all active missions in a workspace."""
    # Get all ICPs for this workspace
    icps = session.exec(
        select(ICP).where(ICP.workspace_id == workspace_id)
    ).all()

    if not icps:
        logger.info("No ICPs found for external discovery")
        return

    total_found = 0
    for icp in icps:
        found = await _discover_for_icp(icp, workspace_id, session)
        total_found += found

    session.commit()
    logger.info(f"External discovery: {total_found} new signals found across {len(icps)} ICPs")


async def _discover_for_icp(icp: ICP, workspace_id: uuid.UUID, session: Session) -> int:
    """
    Discover companies matching a specific ICP.
    Uses Common Crawl + existing signal detection.
    """
    from services.enrichment.commoncrawl import cc_batch_lookup
    from services.signals.detector import detect_all_signals

    # Build search query from ICP criteria
    industries = icp.industry[:3] if icp.industry else []
    geographies = icp.geography[:2] if icp.geography else []

    if not industries:
        return 0

    # Get already-known domains to avoid duplicates
    existing_domains = set()
    existing_ext = session.exec(
        select(ExternalSignal.domain).where(ExternalSignal.workspace_id == workspace_id)
    ).all()
    existing_domains.update(existing_ext)

    existing_internal = session.exec(
        select(Signal.domain).where(Signal.workspace_id == workspace_id)
    ).all()
    existing_domains.update(existing_internal)

    # Use Common Crawl to find domains matching industry keywords
    # Build a list of target domains using CC index
    target_domains = await _find_candidate_domains(industries, geographies, existing_domains)

    if not target_domains:
        return 0

    # Cap at 20 domains per ICP per run
    target_domains = target_domains[:20]

    # Fetch and check signals
    logger.info(f"Checking {len(target_domains)} candidate domains for ICP '{icp.name}'")
    cc_pages = await cc_batch_lookup(target_domains, concurrency=5)

    found_count = 0
    for domain in target_domains:
        pages = cc_pages.get(domain, {})
        if not pages:
            continue

        try:
            signals = detect_all_signals(pages, {}, domain)
        except Exception as e:
            logger.debug(f"Signal detection failed for {domain}: {e}")
            continue

        # Only keep strong hiring signals
        strong_signals = [s for s in signals if s.strength >= 0.6 and not s.signal_type.startswith("not_") and not s.signal_type == "early_stage"]

        if not strong_signals:
            continue

        # Check if already stored
        already = session.exec(
            select(ExternalSignal)
            .where(ExternalSignal.domain == domain)
            .where(ExternalSignal.workspace_id == workspace_id)
        ).first()
        if already:
            continue

        # Store top signal
        top_signal = max(strong_signals, key=lambda s: s.strength)
        ext_signal = ExternalSignal(
            workspace_id=workspace_id,
            domain=domain,
            signal_type=top_signal.signal_type,
            strength=top_signal.strength,
            relevance=_compute_relevance(icp, top_signal.signal_type),
            confidence=top_signal.strength * 0.8,
            evidence=top_signal.evidence,
            source_url=top_signal.source_url,
            matched_icp_id=icp.id,
            status="new",
        )
        session.add(ext_signal)
        found_count += 1

        if found_count >= 50:  # global cap per run
            break

    return found_count


async def _find_candidate_domains(
    industries: list[str],
    geographies: list[str],
    exclude_domains: set,
    max_results: int = 30,
) -> list[str]:
    """
    Find candidate domains using CC index queries based on industry keywords.
    This is a best-effort search — results may be approximate.
    """
    from services.enrichment.commoncrawl import query_cc_index, get_recent_cc_indices

    try:
        indices = await get_recent_cc_indices(max_indices=1)
        if not indices:
            return []

        index_id = indices[0]
        found = set()

        # Use industry as search terms to find matching domains
        for industry in industries[:2]:
            industry_term = industry.lower().replace(" ", "+")
            try:
                # Query CC for pages mentioning this industry
                entries = await query_cc_index(
                    query=industry_term,
                    cc_index=index_id,
                    max_results=50,
                )
                for entry in entries:
                    domain = _extract_domain(entry.get("url", ""))
                    if domain and domain not in exclude_domains and len(domain) > 4:
                        found.add(domain)
                        if len(found) >= max_results:
                            break
            except Exception as e:
                logger.debug(f"CC query failed for '{industry}': {e}")
                continue

            if len(found) >= max_results:
                break

        return list(found)[:max_results]

    except Exception as e:
        logger.warning(f"Candidate domain discovery failed: {e}")
        return []


def _extract_domain(url: str) -> str:
    """Extract bare domain from URL."""
    try:
        url = url.replace("https://", "").replace("http://", "").replace("www.", "")
        domain = url.split("/")[0].split("?")[0].strip()
        if "." in domain and len(domain) > 3:
            return domain
    except Exception:
        pass
    return ""


def _compute_relevance(icp: ICP, signal_type: str) -> float:
    """Compute how relevant a signal type is to this ICP."""
    # Sales-related ICPs: hiring SDR/AE is highly relevant
    industries = [i.lower() for i in (icp.industry or [])]
    is_saas = any("saas" in i or "software" in i or "tech" in i for i in industries)

    if signal_type in ("hiring_sdr", "hiring_ae", "hiring_vp_sales"):
        return 0.9 if is_saas else 0.7
    if signal_type in ("hiring_ai_ml", "hiring_engineering"):
        return 0.8
    if signal_type in ("hiring_marketing",):
        return 0.6
    if signal_type == "enterprise_pricing":
        return 0.7
    return 0.5
