"""
Enrichment API: batch enrichment with progress streaming via SSE.
"""
import io
import asyncio
import math
import re
import uuid
import orjson
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, UploadFile, File, BackgroundTasks, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select
from sqlalchemy import func
from pydantic import BaseModel
from loguru import logger

from api.deps import get_workspace_id
from database import get_session
from models import CompanyProfile, EnrichmentJob, Signal, Lead, DataPoint
from services.enrichment.pipeline import IMPORTANT_FIELDS, enrich_batch, enrich_single
from services.enrichment.cross_validator import compute_quality_score, quality_tier
from services.signals.detector import detect_all_signals

router = APIRouter(prefix="/enrichment", tags=["enrichment"])

# In-memory job tracking (good enough for single-worker MVP)
_active_jobs: dict[str, dict] = {}


class BatchEnrichRequest(BaseModel):
    domains: list[str]
    icp_id: Optional[str] = None
    requested_fields: list[str] = []


class DomainListRequest(BaseModel):
    domains: list[str]


class ProfileFieldPatch(BaseModel):
    field_name: str
    value: object | None
    confidence: Optional[float] = 0.98
    evidence: Optional[str] = "Manual override"
    source: Optional[str] = "manual_override"


class ProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    fields: list[ProfileFieldPatch] = []


FREE_EMAIL_DOMAINS = {
    "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "yahoo.co.uk",
    "hotmail.com", "outlook.com", "live.com", "msn.com", "icloud.com",
    "me.com", "aol.com", "mail.com", "gmx.com", "protonmail.com", "proton.me",
    "yandex.com",
}


def normalize_domain(raw: str) -> str:
    d = str(raw).strip().lower()
    d = d.replace("mailto:", "")
    parts = [part for part in re.split(r"[\s,;|]+", d) if part]
    if parts:
        d = parts[0]
    if "@" in d and not d.startswith("http"):
        d = d.split("@", 1)[1]
    d = d.replace("https://", "").replace("http://", "").replace("www.", "")
    d = d.split("/", 1)[0].split("?", 1)[0].split("#", 1)[0].strip(" <>.,;:/")
    return d


def _is_missing(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, float) and math.isnan(value):
        return True
    return str(value).strip() == ""


def _safe_text(value: object) -> Optional[str]:
    if _is_missing(value):
        return None
    return str(value).strip()


def _normalized_header(header: object) -> str:
    text = _safe_text(header) or ""
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def _find_column(columns: list[str], aliases: tuple[str, ...]) -> Optional[str]:
    alias_set = set(aliases)
    for col in columns:
        if _normalized_header(col) in alias_set:
            return col
    return None


def _split_name(full_name: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    if not full_name:
        return None, None
    parts = [part for part in full_name.strip().split() if part]
    if not parts:
        return None, None
    if len(parts) == 1:
        return parts[0], None
    return parts[0], " ".join(parts[1:])


def _persist_job_state(
    session: Session,
    job_id: str,
    *,
    status: Optional[str] = None,
    completed_domains: Optional[int] = None,
    failed_domains: Optional[int] = None,
    results_summary: Optional[dict] = None,
    completed_at: Optional[datetime] = None,
) -> None:
    job = session.get(EnrichmentJob, uuid.UUID(job_id))
    if not job:
        return

    if status is not None:
        job.status = status
    if completed_domains is not None:
        job.completed_domains = completed_domains
    if failed_domains is not None:
        job.failed_domains = failed_domains
    if results_summary is not None:
        job.results_summary = results_summary
    if completed_at is not None:
        job.completed_at = completed_at

    session.add(job)
    session.commit()


# ─────────────────────────────────────────────────────────────
# Batch enrichment with SSE streaming
# ─────────────────────────────────────────────────────────────

@router.post("/batch")
async def start_batch_enrichment(
    req: BatchEnrichRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Start batch enrichment. Returns job_id for progress tracking."""
    cleaned_domains = []
    for d in req.domains:
        normalized = normalize_domain(d)
        if normalized:
            cleaned_domains.append(normalized)
    unique_domains = list(dict.fromkeys(d for d in cleaned_domains if "." in d))

    if len(unique_domains) > 500:
        raise HTTPException(400, "Maximum 500 domains per batch")
    if not unique_domains:
        raise HTTPException(400, "No valid domains provided")

    job_id = str(uuid.uuid4())
    job = EnrichmentJob(
        id=uuid.UUID(job_id),
        status="queued",
        total_domains=len(unique_domains),
        workspace_id=workspace_id,
    )
    session.add(job)
    session.commit()

    _active_jobs[job_id] = {
        "status": "queued",
        "phase": "queued",
        "total": len(unique_domains),
        "completed": 0,
        "failed": 0,
        "results": [],
        "events": [],
    }

    background_tasks.add_task(_run_enrichment, job_id, unique_domains, req.icp_id, workspace_id)
    return {"job_id": job_id, "total": len(unique_domains), "status": "queued"}


async def _run_enrichment(job_id: str, domains: list[str], icp_id: Optional[str], workspace_id: uuid.UUID):
    """Background enrichment task with progress tracking."""
    from database import engine
    from sqlmodel import Session as SyncSession

    job_state = _active_jobs.get(job_id)
    if not job_state:
        return

    job_state["status"] = "running"
    job_state["phase"] = "loading_cache"

    cached_profiles: dict[str, CompanyProfile] = {}
    with SyncSession(engine) as session:
        if domains:
            now = datetime.utcnow()
            cached = session.exec(
                select(CompanyProfile)
                .where(CompanyProfile.workspace_id == workspace_id)
                .where(CompanyProfile.domain.in_(domains))
            ).all()
            for profile in cached:
                if profile.cache_expires_at and profile.cache_expires_at > now:
                    cached_profiles[profile.domain] = profile

    cached_offset = len(cached_profiles)

    def record_cached(profile: CompanyProfile, completed: int) -> None:
        sources = list({*(profile.sources_used or []), "cache"})
        event = {
            "type": "company_cached",
            "domain": profile.domain,
            "quality_score": profile.quality_score,
            "quality_tier": profile.quality_tier,
            "sources": sources,
            "completed": completed,
            "total": job_state["total"],
        }
        job_state["events"].append(event)
        job_state["completed"] = completed
        job_state["results"].append({
            "domain": profile.domain,
            "quality_score": profile.quality_score,
            "quality_tier": profile.quality_tier,
            "sources": sources,
        })

    for idx, profile in enumerate(cached_profiles.values(), start=1):
        record_cached(profile, idx)

    if cached_offset and cached_offset >= job_state["total"]:
        job_state["status"] = "completed"
        with SyncSession(engine) as session:
            job = session.get(EnrichmentJob, uuid.UUID(job_id))
            if job:
                job.status = "completed"
                job.completed_domains = cached_offset
                job.failed_domains = 0
                job.completed_at = datetime.utcnow()
                session.commit()
        return

    domains_to_enrich = [d for d in domains if d not in cached_profiles]

    async def on_progress(event: dict):
        if event.get("type") in ("company_done", "company_failed"):
            event = {
                **event,
                "completed": cached_offset + event.get("completed", 0),
                "total": job_state["total"],
            }

        job_state["events"].append(event)

        if event.get("type") == "phase":
            job_state["phase"] = event.get("phase", job_state.get("phase"))

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
        profiles_with_pages = await enrich_batch(domains_to_enrich, on_progress=on_progress)

        # Persist profiles and signals
        with SyncSession(engine) as session:
            for profile, pages_html in profiles_with_pages:
                # Upsert company profile
                existing = session.exec(
                    select(CompanyProfile)
                    .where(CompanyProfile.domain == profile.domain)
                    .where(CompanyProfile.workspace_id == workspace_id)
                ).first()
                if existing:
                    existing.enriched_data = profile.enriched_data
                    existing.quality_score = profile.quality_score
                    existing.quality_tier = profile.quality_tier
                    existing.sources_used = profile.sources_used
                    existing.enriched_at = profile.enriched_at
                    existing.cache_expires_at = profile.cache_expires_at
                    existing.fetch_metadata = profile.fetch_metadata
                    existing.name = profile.name
                else:
                    profile.workspace_id = workspace_id
                    session.add(profile)

                # Detect and store signals using captured HTML (CC or live)
                try:
                    profile.fetch_metadata.setdefault(
                        "page_statuses",
                        {path: 200 for path, html in pages_html.items() if html},
                    )
                    signals = detect_all_signals(pages_html, profile.fetch_metadata, profile.domain)
                    for sig in signals:
                        session.add(Signal(
                            domain=sig.domain,
                            workspace_id=workspace_id,
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
            _persist_job_state(
                session,
                job_id,
                status="completed",
                completed_domains=cached_offset + len(profiles_with_pages),
                failed_domains=job_state["failed"],
                results_summary={
                    "phase": "completed",
                    "results": len(profiles_with_pages),
                    "failed": job_state["failed"],
                },
                completed_at=datetime.utcnow(),
            )

    except Exception as e:
        logger.exception(f"Enrichment job {job_id} failed")
        job_state["status"] = "failed"
        job_state["error"] = str(e)
        with SyncSession(engine) as session:
            _persist_job_state(
                session,
                job_id,
                status="failed",
                completed_domains=job_state.get("completed", 0),
                failed_domains=max(job_state.get("failed", 0), job_state["total"] - job_state.get("completed", 0)),
                results_summary={"phase": job_state.get("phase"), "error": str(e)},
                completed_at=datetime.utcnow(),
            )


@router.get("/status/{job_id}")
async def get_job_status(
    job_id: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Poll job status and get latest results."""
    job_state = _active_jobs.get(job_id)
    if not job_state:
        try:
            job_uuid = uuid.UUID(job_id)
        except Exception:
            raise HTTPException(404, "Job not found")

        job = session.get(EnrichmentJob, job_uuid)
        if not job or job.workspace_id != workspace_id:
            raise HTTPException(404, "Job not found")
        return {
            "job_id": job_id,
            "status": job.status,
            "phase": (job.results_summary or {}).get("phase"),
            "total": job.total_domains,
            "completed": job.completed_domains,
            "failed": job.failed_domains,
            "results": [],
            "error": (job.results_summary or {}).get("error"),
            "progress_pct": round(job.completed_domains / max(job.total_domains, 1) * 100, 1),
        }

    return {
        "job_id": job_id,
        "status": job_state["status"],
        "phase": job_state.get("phase"),
        "total": job_state["total"],
        "completed": job_state["completed"],
        "failed": job_state["failed"],
        "results": job_state["results"][-50:],  # last 50 results
        "error": job_state.get("error"),
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
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Import a CSV/XLSX of leads or domains and start enrichment where possible."""
    import pandas as pd

    content = await file.read()
    filename = (file.filename or "upload").lower()
    try:
        if filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content), dtype=str)
        else:
            try:
                df = pd.read_csv(io.BytesIO(content), dtype=str)
            except UnicodeDecodeError:
                df = pd.read_csv(io.BytesIO(content), dtype=str, encoding="latin-1")
    except Exception as e:
        raise HTTPException(400, f"Failed to parse uploaded file: {e}")

    if df.empty:
        raise HTTPException(400, "The uploaded file is empty")

    df = df.where(pd.notna(df), None)
    records = df.to_dict(orient="records")
    if not records:
        raise HTTPException(400, "The uploaded file has no usable rows")

    columns = list(df.columns)
    domain_col = _find_column(columns, ("domain", "website", "url", "company_domain", "domains", "website_url", "company_website"))
    email_col = _find_column(columns, ("email", "email_address", "work_email", "business_email", "contact_email", "official_email"))
    name_col = _find_column(columns, ("name", "full_name", "contact_name", "lead_name", "prospect_name", "person_name"))
    first_name_col = _find_column(columns, ("first_name", "firstname", "given_name"))
    last_name_col = _find_column(columns, ("last_name", "lastname", "surname", "family_name"))
    company_col = _find_column(columns, ("company", "company_name", "organization", "organisation", "account", "institution"))
    title_col = _find_column(columns, ("designation", "title", "job_title", "role", "position"))
    phone_col = _find_column(columns, ("phone", "phone_number", "mobile", "telephone", "contact_number"))

    if not domain_col and not email_col:
        raise HTTPException(400, "No domain, website, or email column found in the uploaded file")

    cleaned_domains: list[str] = []
    created_leads = 0
    updated_leads = 0
    skipped_rows = 0

    reserved_columns = {col for col in (
        domain_col, email_col, name_col, first_name_col, last_name_col, company_col, title_col, phone_col
    ) if col}

    for row in records:
        explicit_domain = normalize_domain(row.get(domain_col)) if domain_col and _safe_text(row.get(domain_col)) else None
        email = (_safe_text(row.get(email_col)) or "").lower() if email_col else ""
        inferred_domain = normalize_domain(email) if email else None
        domain = explicit_domain or inferred_domain

        if domain in FREE_EMAIL_DOMAINS and not explicit_domain:
            domain = None

        full_name = _safe_text(row.get(name_col)) if name_col else None
        first_name = _safe_text(row.get(first_name_col)) if first_name_col else None
        last_name = _safe_text(row.get(last_name_col)) if last_name_col else None
        if not first_name and not last_name:
            first_name, last_name = _split_name(full_name)

        if not email:
            if domain:
                email = f"imported@{domain}"
            else:
                skipped_rows += 1
                continue

        custom_data = {
            "source_file": file.filename,
            "company": _safe_text(row.get(company_col)) if company_col else None,
            "designation": _safe_text(row.get(title_col)) if title_col else None,
            "phone": _safe_text(row.get(phone_col)) if phone_col else None,
        }
        for col, value in row.items():
            if col in reserved_columns:
                continue
            safe_value = _safe_text(value)
            if safe_value is not None:
                custom_data[_normalized_header(col) or str(col)] = safe_value
        custom_data = {key: value for key, value in custom_data.items() if value is not None}

        existing = session.exec(select(Lead).where(Lead.email == email)).first()
        if existing:
            changed = False
            if existing.workspace_id == workspace_id:
                if not existing.domain and domain:
                    existing.domain = domain
                    changed = True
                if not existing.first_name and first_name:
                    existing.first_name = first_name
                    changed = True
                if not existing.last_name and last_name:
                    existing.last_name = last_name
                    changed = True
                if custom_data:
                    existing.custom_data = {**(existing.custom_data or {}), **custom_data}
                    changed = True
                if changed:
                    existing.updated_at = datetime.utcnow()
                    session.add(existing)
                    updated_leads += 1
            if domain and "." in domain:
                cleaned_domains.append(domain)
            continue

        lead = Lead(
            email=email,
            first_name=first_name,
            last_name=last_name,
            domain=domain,
            workspace_id=workspace_id,
            custom_data=custom_data,
        )
        session.add(lead)
        created_leads += 1
        if domain and "." in domain:
            cleaned_domains.append(domain)

    session.commit()

    cleaned = list(dict.fromkeys(cleaned_domains))
    domains_truncated = max(len(cleaned) - 500, 0)
    if len(cleaned) > 500:
        cleaned = cleaned[:500]

    if not created_leads and not updated_leads and not cleaned:
        raise HTTPException(400, "No valid leads or enrichable domains found in the uploaded file")

    if not cleaned:
        return {
            "job_id": None,
            "domains_imported": 0,
            "leads_imported": created_leads,
            "leads_updated": updated_leads,
            "rows_processed": len(records),
            "rows_skipped": skipped_rows,
            "domains_truncated": 0,
            "status": "leads_imported",
        }

    # Start enrichment
    job_id = str(uuid.uuid4())
    job = EnrichmentJob(
        id=uuid.UUID(job_id),
        status="queued",
        total_domains=len(cleaned),
        workspace_id=workspace_id,
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

    background_tasks.add_task(_run_enrichment, job_id, cleaned, None, workspace_id)
    return {
        "job_id": job_id,
        "domains_imported": len(cleaned),
        "leads_imported": created_leads,
        "leads_updated": updated_leads,
        "rows_processed": len(records),
        "rows_skipped": skipped_rows,
        "domains_truncated": domains_truncated,
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
    q: Optional[str] = None,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Get enriched company profiles with pagination."""
    query = select(CompanyProfile)
    query = query.where(CompanyProfile.workspace_id == workspace_id)
    if quality_tier:
        query = query.where(CompanyProfile.quality_tier == quality_tier)
    if q:
        pattern = f"%{q.strip().lower()}%"
        query = query.where(
            func.lower(func.coalesce(CompanyProfile.domain, "")).like(pattern) |
            func.lower(func.coalesce(CompanyProfile.name, "")).like(pattern)
        )
    query = query.order_by(CompanyProfile.enriched_at.desc().nullslast(), CompanyProfile.domain.asc())
    query = query.offset(skip).limit(limit)
    profiles = session.exec(query).all()
    total_query = select(func.count()).select_from(CompanyProfile).where(CompanyProfile.workspace_id == workspace_id)
    if quality_tier:
        total_query = total_query.where(CompanyProfile.quality_tier == quality_tier)
    if q:
        pattern = f"%{q.strip().lower()}%"
        total_query = total_query.where(
            func.lower(func.coalesce(CompanyProfile.domain, "")).like(pattern) |
            func.lower(func.coalesce(CompanyProfile.name, "")).like(pattern)
        )
    total = session.exec(total_query).one()
    return {"profiles": profiles, "total": total, "skip": skip, "limit": limit}


@router.get("/profiles/{domain}")
async def get_profile(
    domain: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Get a single company profile with all enrichment data."""
    profile = session.exec(
        select(CompanyProfile)
        .where(CompanyProfile.domain == domain)
        .where(CompanyProfile.workspace_id == workspace_id)
    ).first()
    if not profile:
        raise HTTPException(404, "Profile not found")
    return profile


@router.patch("/profiles/{domain}")
async def update_profile(
    domain: str,
    update: ProfileUpdateRequest,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Allow operators to maintain enriched profile fields with explicit manual provenance."""
    profile = session.exec(
        select(CompanyProfile)
        .where(CompanyProfile.domain == domain)
        .where(CompanyProfile.workspace_id == workspace_id)
    ).first()
    if not profile:
        raise HTTPException(404, "Profile not found")

    enriched_data = dict(profile.enriched_data or {})
    for field_update in update.fields:
        field_name = field_update.field_name.strip()
        if not field_name:
            continue
        if field_update.value is None:
            enriched_data.pop(field_name, None)
            continue
        enriched_data[field_name] = DataPoint(
            value=field_update.value,
            confidence=max(0.0, min(field_update.confidence or 0.98, 1.0)),
            source=field_update.source or "manual_override",
            source_url=f"operator://workspace/{workspace_id}",
            evidence=field_update.evidence or "Manual override",
        ).model_dump()
        if field_name == "company_name" and isinstance(field_update.value, str) and field_update.value.strip():
            profile.name = field_update.value.strip()

    if update.name is not None:
        profile.name = update.name.strip() or profile.name

    validated_points = {}
    for field_name, payload in enriched_data.items():
        if not isinstance(payload, dict):
            continue
        try:
            validated_points[field_name] = DataPoint(**payload)
        except Exception:
            continue

    profile.enriched_data = enriched_data
    profile.quality_score = compute_quality_score(validated_points, IMPORTANT_FIELDS)
    profile.quality_tier = quality_tier(profile.quality_score)
    profile.enriched_at = datetime.utcnow()
    profile.sources_used = list(dict.fromkeys([*(profile.sources_used or []), "manual_override"]))

    fetch_metadata = dict(profile.fetch_metadata or {})
    manual_edits = list(fetch_metadata.get("manual_edits") or [])
    manual_edits.append({
        "edited_at": datetime.utcnow().isoformat(),
        "fields": [field.field_name for field in update.fields if field.field_name.strip()],
    })
    fetch_metadata["manual_edits"] = manual_edits[-25:]
    profile.fetch_metadata = fetch_metadata

    session.add(profile)
    session.commit()
    session.refresh(profile)
    return profile
