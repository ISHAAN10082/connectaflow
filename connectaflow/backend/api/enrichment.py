"""
Enrichment API: batch enrichment with progress streaming via SSE.
"""
import io
import asyncio
import uuid
import orjson
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, UploadFile, File, BackgroundTasks, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select
from pydantic import BaseModel

from database import get_session
from models import CompanyProfile, EnrichmentJob, Signal, Lead
from services.enrichment.pipeline import enrich_batch, enrich_single
from services.signals.detector import detect_all_signals

router = APIRouter(prefix="/enrichment", tags=["enrichment"])

# In-memory job tracking (good enough for single-worker MVP)
_active_jobs: dict[str, dict] = {}


class BatchEnrichRequest(BaseModel):
    domains: list[str]
    icp_id: Optional[str] = None


class DomainListRequest(BaseModel):
    domains: list[str]


# ─────────────────────────────────────────────────────────────
# Batch enrichment with SSE streaming
# ─────────────────────────────────────────────────────────────

@router.post("/batch")
async def start_batch_enrichment(
    req: BatchEnrichRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    """Start batch enrichment. Returns job_id for progress tracking."""
    if len(req.domains) > 500:
        raise HTTPException(400, "Maximum 500 domains per batch")

    job_id = str(uuid.uuid4())
    job = EnrichmentJob(
        id=uuid.UUID(job_id),
        status="queued",
        total_domains=len(req.domains),
    )
    session.add(job)
    session.commit()

    _active_jobs[job_id] = {
        "status": "queued",
        "total": len(req.domains),
        "completed": 0,
        "failed": 0,
        "results": [],
        "events": [],
    }

    background_tasks.add_task(_run_enrichment, job_id, req.domains, req.icp_id)
    return {"job_id": job_id, "total": len(req.domains), "status": "queued"}


async def _run_enrichment(job_id: str, domains: list[str], icp_id: Optional[str]):
    """Background enrichment task with progress tracking."""
    from database import engine
    from sqlmodel import Session as SyncSession

    job_state = _active_jobs.get(job_id)
    if not job_state:
        return

    job_state["status"] = "running"

    async def on_progress(event: dict):
        job_state["events"].append(event)
        if event.get("type") == "company_done":
            job_state["completed"] = event.get("completed", 0)
            job_state["results"].append({
                "domain": event["domain"],
                "quality_score": event.get("quality_score", 0),
                "quality_tier": event.get("quality_tier", "unknown"),
                "sources": event.get("sources", []),
            })
        elif event.get("type") == "company_failed":
            job_state["failed"] += 1
            job_state["completed"] = event.get("completed", 0)

    try:
        profiles_with_pages = await enrich_batch(domains, on_progress=on_progress)

        # Persist profiles and signals
        with SyncSession(engine) as session:
            for profile, pages_html in profiles_with_pages:
                # Upsert company profile
                existing = session.get(CompanyProfile, profile.domain)
                if existing:
                    existing.enriched_data = profile.enriched_data
                    existing.quality_score = profile.quality_score
                    existing.quality_tier = profile.quality_tier
                    existing.sources_used = profile.sources_used
                    existing.enriched_at = profile.enriched_at
                    existing.fetch_metadata = profile.fetch_metadata
                    existing.name = profile.name
                else:
                    session.add(profile)

                # Detect and store signals using captured HTML (CC or live)
                try:
                    signals = detect_all_signals(pages_html, profile.fetch_metadata, profile.domain)
                    for sig in signals:
                        session.add(Signal(
                            domain=sig.domain,
                            signal_type=sig.signal_type,
                            strength=sig.strength,
                            source_url=sig.source_url,
                            evidence=sig.evidence,
                            detected_at=sig.detected_at,
                        ))
                except Exception as e:
                    logger.warning(f"Signal detection failed for {profile.domain}: {e}")

            session.commit()

        job_state["status"] = "completed"

        # Update job record
        with SyncSession(engine) as session:
            job = session.get(EnrichmentJob, uuid.UUID(job_id))
            if job:
                job.status = "completed"
                job.completed_domains = len(profiles_with_pages)
                job.failed_domains = job_state["failed"]
                job.completed_at = datetime.utcnow()
                session.commit()

    except Exception as e:
        job_state["status"] = "failed"
        job_state["error"] = str(e)


@router.get("/status/{job_id}")
async def get_job_status(job_id: str):
    """Poll job status and get latest results."""
    job_state = _active_jobs.get(job_id)
    if not job_state:
        raise HTTPException(404, "Job not found")

    return {
        "job_id": job_id,
        "status": job_state["status"],
        "total": job_state["total"],
        "completed": job_state["completed"],
        "failed": job_state["failed"],
        "results": job_state["results"][-50:],  # last 50 results
        "progress_pct": round(job_state["completed"] / max(job_state["total"], 1) * 100, 1),
    }


@router.get("/stream/{job_id}")
async def stream_job(job_id: str):
    """SSE stream for real-time enrichment progress."""
    job_state = _active_jobs.get(job_id)
    if not job_state:
        raise HTTPException(404, "Job not found")

    async def event_generator():
        last_idx = 0
        while True:
            events = job_state["events"][last_idx:]
            for event in events:
                yield f"data: {orjson.dumps(event).decode()}\n\n"
                last_idx += 1

            if job_state["status"] in ("completed", "failed"):
                yield f"data: {orjson.dumps({'type': 'job_complete', 'status': job_state['status']}).decode()}\n\n"
                break

            await asyncio.sleep(0.5)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ─────────────────────────────────────────────────────────────
# CSV import + enrich
# ─────────────────────────────────────────────────────────────

@router.post("/import-csv")
async def import_csv_and_enrich(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    session: Session = Depends(get_session),
):
    """Import a CSV of domains and start enrichment."""
    import polars as pl

    content = await file.read()
    try:
        df = pl.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(400, f"Failed to parse CSV: {e}")

    # Find domain column
    domain_col = None
    for col in df.columns:
        if col.lower() in ("domain", "website", "url", "company_domain", "domains"):
            domain_col = col
            break

    if not domain_col:
        # Try first column
        domain_col = df.columns[0]

    domains = df[domain_col].drop_nulls().to_list()

    # Clean domains
    cleaned = []
    for d in domains:
        d = str(d).strip().lower()
        d = d.replace("https://", "").replace("http://", "").replace("www.", "").rstrip("/")
        if d and "." in d:
            cleaned.append(d)

    if not cleaned:
        raise HTTPException(400, "No valid domains found in CSV")

    if len(cleaned) > 500:
        cleaned = cleaned[:500]

    # Create leads for imported domains
    for domain in cleaned:
        existing = session.exec(select(Lead).where(Lead.domain == domain)).first()
        if not existing:
            lead = Lead(email=f"imported@{domain}", domain=domain)
            session.add(lead)
    session.commit()

    # Start enrichment
    job_id = str(uuid.uuid4())
    job = EnrichmentJob(
        id=uuid.UUID(job_id),
        status="queued",
        total_domains=len(cleaned),
    )
    session.add(job)
    session.commit()

    _active_jobs[job_id] = {
        "status": "queued",
        "total": len(cleaned),
        "completed": 0,
        "failed": 0,
        "results": [],
        "events": [],
    }

    background_tasks.add_task(_run_enrichment, job_id, cleaned, None)
    return {
        "job_id": job_id,
        "domains_imported": len(cleaned),
        "status": "enrichment_started",
    }


# ─────────────────────────────────────────────────────────────
# Get enriched company profiles
# ─────────────────────────────────────────────────────────────

@router.get("/profiles")
async def get_profiles(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    quality_tier: Optional[str] = None,
    session: Session = Depends(get_session),
):
    """Get enriched company profiles with pagination."""
    query = select(CompanyProfile)
    if quality_tier:
        query = query.where(CompanyProfile.quality_tier == quality_tier)
    query = query.offset(skip).limit(limit)
    profiles = session.exec(query).all()
    total = session.exec(select(CompanyProfile)).all()
    return {"profiles": profiles, "total": len(total), "skip": skip, "limit": limit}


@router.get("/profiles/{domain}")
async def get_profile(domain: str, session: Session = Depends(get_session)):
    """Get a single company profile with all enrichment data."""
    profile = session.get(CompanyProfile, domain)
    if not profile:
        raise HTTPException(404, "Profile not found")
    return profile
