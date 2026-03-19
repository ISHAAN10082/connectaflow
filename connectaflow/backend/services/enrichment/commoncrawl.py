"""
Common Crawl source: Tier 0 — query monthly indices before live fetching.
Uses official Common Crawl index discovery plus focused WARC range reads.
"""
import asyncio
import gzip
import json
from typing import Optional
from urllib.parse import urlparse

import httpx
from loguru import logger

from config import settings


CC_INDEX_URL = "https://index.commoncrawl.org/{index}-index"
CC_DATA_URL = "https://data.commoncrawl.org/{filename}"
CC_COLLINFO_URL = "https://index.commoncrawl.org/collinfo.json"

MAX_CC_INDEXES = 3
MAX_CC_INDEX_ENTRIES = 30
MAX_CC_PAGES = 8

PRIORITY_PATHS = {
    "/": 100,
    "/about": 90,
    "/about-us": 90,
    "/product": 88,
    "/solutions": 86,
    "/pricing": 85,
    "/customers": 82,
    "/customer-stories": 82,
    "/case-studies": 82,
    "/integrations": 80,
    "/careers": 78,
    "/jobs": 78,
    "/team": 75,
    "/security": 74,
    "/trust": 74,
    "/docs": 72,
    "/api": 72,
}

_cached_indices: Optional[list[str]] = None


def _build_cc_client() -> httpx.AsyncClient:
    """
    Prefer HTTP/2 for Common Crawl range requests, but degrade cleanly when
    the optional h2 dependency is not installed in local/dev environments.
    """
    try:
        return httpx.AsyncClient(http2=True)
    except ImportError:
        logger.warning("Common Crawl HTTP/2 support unavailable; falling back to HTTP/1.1 because 'h2' is not installed.")
        return httpx.AsyncClient()


async def get_recent_cc_indices(client: httpx.AsyncClient) -> list[str]:
    """Discover current CC indices from the official collinfo endpoint."""
    global _cached_indices
    if _cached_indices:
        return _cached_indices

    try:
        resp = await client.get(CC_COLLINFO_URL, timeout=10.0)
        resp.raise_for_status()
        payload = resp.json()
        indices = []
        for item in payload:
            ident = item.get("id")
            if ident and ident.startswith("CC-MAIN-"):
                indices.append(ident)
        if indices:
            ordered = list(dict.fromkeys([settings.COMMONCRAWL_INDEX, *indices]))
            _cached_indices = ordered[:MAX_CC_INDEXES]
            return _cached_indices
    except Exception as exc:
        logger.debug(f"Failed to load Common Crawl indices from collinfo: {exc}")

    _cached_indices = [settings.COMMONCRAWL_INDEX]
    return _cached_indices


def _score_entry(entry: dict) -> int:
    url = entry.get("url", "")
    parsed = urlparse(url)
    path = parsed.path.rstrip("/") or "/"
    score = PRIORITY_PATHS.get(path, 0)
    if parsed.query:
        score -= 10
    if parsed.fragment:
        score -= 5
    if path.count("/") > 2:
        score -= 8
    return score


async def query_cc_index(domain: str, client: httpx.AsyncClient, indices: list[str]) -> list[dict]:
    """
    Query one or more Common Crawl indices for HTML pages for a domain.
    Returns the first non-empty set of entries from the newest available indices.
    """
    for index_name in indices:
        index_url = CC_INDEX_URL.format(index=index_name)
        try:
            resp = await client.get(
                index_url,
                params={
                    "url": f"{domain}/*",
                    "output": "json",
                    "limit": MAX_CC_INDEX_ENTRIES,
                    "filter": ["status:200", "mime:text/html"],
                    "fl": "url,timestamp,status,mime,offset,length,filename",
                },
                timeout=10.0,
            )
            if resp.status_code != 200 or not resp.text.strip():
                continue

            entries = []
            for line in resp.text.strip().splitlines():
                if not line.strip():
                    continue
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError:
                    continue
                payload["cc_index"] = index_name
                entries.append(payload)

            if entries:
                entries.sort(key=_score_entry, reverse=True)
                return entries
        except Exception as exc:
            logger.debug(f"CC index query failed for {domain} on {index_name}: {exc}")

    return []


async def fetch_warc_record(entry: dict, client: httpx.AsyncClient) -> Optional[str]:
    """
    Fetch the HTML body for a single Common Crawl WARC entry using range reads.
    """
    try:
        filename = entry.get("filename")
        offset = int(entry.get("offset", 0))
        length = int(entry.get("length", 0))
        if not filename or not length:
            return None

        resp = await client.get(
            CC_DATA_URL.format(filename=filename),
            headers={"Range": f"bytes={offset}-{offset + length - 1}"},
            timeout=20.0,
        )
        if resp.status_code not in (200, 206):
            return None

        try:
            text = gzip.decompress(resp.content).decode("utf-8", errors="replace")
        except Exception:
            text = resp.text

        parts = text.split("\r\n\r\n", 2)
        if len(parts) >= 3:
            return parts[2]
        if len(parts) >= 2:
            return parts[1]
        return text
    except Exception as exc:
        logger.debug(f"WARC fetch failed: {exc}")
        return None


async def get_cc_pages(domain: str, client: httpx.AsyncClient) -> dict[str, str]:
    """
    Return a prioritized set of useful pages for a domain from Common Crawl.
    """
    indices = await get_recent_cc_indices(client)
    entries = await query_cc_index(domain, client, indices)
    if not entries:
        return {}

    pages: dict[str, str] = {}
    for entry in entries:
        parsed = urlparse(entry.get("url", ""))
        path = parsed.path.rstrip("/") or "/"
        if path in pages:
            continue
        if _score_entry(entry) <= 0 and len(pages) >= 2:
            continue

        html = await fetch_warc_record(entry, client)
        if html and len(html) > 200:
            pages[path] = html

        if len(pages) >= MAX_CC_PAGES:
            break

    logger.info(f"CC returned {len(pages)} pages for {domain}")
    return pages


async def cc_batch_lookup(domains: list[str], concurrency: int = 10) -> dict[str, dict[str, str]]:
    """
    Batch lookup for domains using one shared AsyncClient and bounded concurrency.
    """
    results: dict[str, dict[str, str]] = {}
    semaphore = asyncio.Semaphore(concurrency)

    async with _build_cc_client() as client:
        async def _lookup(domain: str):
            async with semaphore:
                pages = await get_cc_pages(domain, client)
                if pages:
                    results[domain] = pages

        await asyncio.gather(*[_lookup(domain) for domain in domains], return_exceptions=True)

    logger.info(f"CC batch: {len(results)}/{len(domains)} domains found in Common Crawl")
    return results
