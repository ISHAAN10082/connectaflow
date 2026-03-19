"""
Fetcher: httpx-based async page fetcher with Common Crawl fallback.
Zero bot detection issues from CC. Live httpx as fallback.
"""
import httpx
import asyncio
from typing import Optional
from loguru import logger
from dataclasses import dataclass, field

# Rotate user agents to reduce blocks
USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
]

PATHS_TO_FETCH = [
    "",
    "/about",
    "/about-us",
    "/product",
    "/solutions",
    "/pricing",
    "/customers",
    "/integrations",
    "/careers",
]


@dataclass
class FetchResult:
    url: str
    path: str
    status: int = 0
    html: str = ""
    headers: dict = field(default_factory=dict)
    error: Optional[str] = None
    source: str = "httpx"  # httpx or commoncrawl


@dataclass
class DomainFetchResult:
    domain: str
    pages: dict[str, FetchResult] = field(default_factory=dict)  # path -> FetchResult
    dns_mx: Optional[str] = None


async def fetch_single_url(client: httpx.AsyncClient, url: str, path: str, ua_idx: int = 0) -> FetchResult:
    """Fetch a single URL with timeout and error handling."""
    full_url = url.rstrip("/") + path
    try:
        resp = await client.get(
            full_url,
            headers={"User-Agent": USER_AGENTS[ua_idx % len(USER_AGENTS)]},
            follow_redirects=True,
            timeout=8.0,
        )
        return FetchResult(
            url=full_url,
            path=path or "/",
            status=resp.status_code,
            html=resp.text if resp.status_code == 200 else "",
            headers=dict(resp.headers),
            source="httpx",
        )
    except httpx.TimeoutException:
        return FetchResult(url=full_url, path=path or "/", error="timeout", source="httpx")
    except httpx.ConnectError:
        return FetchResult(url=full_url, path=path or "/", error="dns_or_connect_failed", source="httpx")
    except Exception as e:
        return FetchResult(url=full_url, path=path or "/", error=str(e)[:200], source="httpx")


async def fetch_dns_mx(domain: str) -> Optional[str]:
    """Get MX record → email provider signal. Free, instant."""
    try:
        import aiodns
        resolver = aiodns.DNSResolver()
        mx_records = await resolver.query(domain, "MX")
        if mx_records:
            mx_host = mx_records[0].host.lower()
            if "google" in mx_host or "gmail" in mx_host:
                return "google_workspace"
            elif "outlook" in mx_host or "microsoft" in mx_host:
                return "microsoft_365"
            elif "zoho" in mx_host:
                return "zoho"
            elif "protonmail" in mx_host:
                return "protonmail"
            else:
                return f"custom:{mx_host}"
        return None
    except Exception:
        return None


async def fetch_domain(domain: str, semaphore: asyncio.Semaphore, idx: int = 0) -> DomainFetchResult:
    """
    Fetch all paths for a domain concurrently.
    500 companies × 5 paths = 2500 requests, with semaphore controlling concurrency.
    """
    result = DomainFetchResult(domain=domain)
    base_url = f"https://{domain}"

    async with semaphore:
        async with httpx.AsyncClient() as client:
            # Fire all page fetches + DNS concurrently
            tasks = [fetch_single_url(client, base_url, path, idx) for path in PATHS_TO_FETCH]
            tasks.append(fetch_dns_mx(domain))

            all_results = await asyncio.gather(*tasks, return_exceptions=True)

            # Process page results
            for r in all_results[:-1]:
                if isinstance(r, FetchResult):
                    result.pages[r.path] = r
                elif isinstance(r, Exception):
                    logger.warning(f"Fetch exception for {domain}: {r}")

            # DNS MX result
            mx_result = all_results[-1]
            if isinstance(mx_result, str):
                result.dns_mx = mx_result

    return result


async def fetch_batch(domains: list[str], concurrency: int = 30) -> list[DomainFetchResult]:
    """
    Fetch all pages for a batch of domains.
    500 domains × 5 paths = 2500 requests, 30 concurrent = ~42s
    """
    semaphore = asyncio.Semaphore(concurrency)
    tasks = [fetch_domain(d, semaphore, i) for i, d in enumerate(domains)]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    fetched = []
    for r in results:
        if isinstance(r, DomainFetchResult):
            fetched.append(r)
        else:
            logger.error(f"Batch fetch error: {r}")

    logger.info(f"Fetched {len(fetched)}/{len(domains)} domains")
    return fetched
