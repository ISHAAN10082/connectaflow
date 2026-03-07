"""
ICP API: generate, list, and score against ICP definitions.
"""
import uuid
import asyncio
import orjson
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select
from pydantic import BaseModel

from api.deps import get_workspace_id
from database import get_session
from models import ICPDefinition, ICPScore, CompanyProfile, ICPRubric
from services.intelligence.icp_builder import generate_icp
from services.intelligence.scorer import score_company

router = APIRouter(prefix="/icp", tags=["icp"])


class ICPGenerateRequest(BaseModel):
    name: str = "Default ICP"
    product_description: str
    customer_examples: list[str]


class ICPScoreBatchRequest(BaseModel):
    icp_id: str
    domains: list[str] = []  # empty = score all enriched


@router.post("/generate")
async def generate_icp_endpoint(
    req: ICPGenerateRequest,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """
    Generate ICP via 3-pass Constitutional AI.
    Returns SSE stream of generation progress.
    """
    events = []

    async def on_stream(event: dict):
        events.append(event)

    async def event_generator():
        # Run ICP generation
        task = asyncio.create_task(generate_icp(
            product_description=req.product_description,
            customer_examples=req.customer_examples,
            name=req.name,
            on_stream=on_stream,
        ))

        sent = 0
        while not task.done():
            new_events = events[sent:]
            for e in new_events:
                yield f"data: {orjson.dumps(e).decode()}\n\n"
                sent += 1
            await asyncio.sleep(0.3)

        # Get result
        try:
            icp = task.result()
            # Persist
            icp.workspace_id = workspace_id
            session.add(icp)
            session.commit()
            session.refresh(icp)

            yield f"data: {orjson.dumps({'type': 'complete', 'icp_id': str(icp.id), 'name': icp.name}).decode()}\n\n"

            # Send remaining events
            for e in events[sent:]:
                yield f"data: {orjson.dumps(e).decode()}\n\n"
        except Exception as e:
            yield f"data: {orjson.dumps({'type': 'error', 'message': str(e)}).decode()}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/generate-sync")
async def generate_icp_sync(
    req: ICPGenerateRequest,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Generate ICP synchronously (non-streaming). Simpler for debugging."""
    try:
        icp = await generate_icp(
            product_description=req.product_description,
            customer_examples=req.customer_examples,
            name=req.name,
        )
        icp.workspace_id = workspace_id
        session.add(icp)
        session.commit()
        session.refresh(icp)
        return {"icp_id": str(icp.id), "name": icp.name, "rubric": icp.rubric, "status": "created"}
    except Exception as e:
        raise HTTPException(500, f"ICP generation failed: {str(e)}")


@router.get("/")
async def list_icps(
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """List all saved ICP definitions."""
    icps = session.exec(select(ICPDefinition).where(ICPDefinition.workspace_id == workspace_id)).all()
    return {"icps": [{"id": str(i.id), "name": i.name, "created_at": str(i.created_at), "rubric": i.rubric} for i in icps]}


@router.get("/{icp_id}")
async def get_icp(
    icp_id: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Get a single ICP with full details."""
    icp = session.get(ICPDefinition, uuid.UUID(icp_id))
    if not icp or icp.workspace_id != workspace_id:
        raise HTTPException(404, "ICP not found")
    return icp


@router.post("/score")
async def score_batch(
    req: ICPScoreBatchRequest,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Score companies against an ICP."""
    icp = session.get(ICPDefinition, uuid.UUID(req.icp_id))
    if not icp or icp.workspace_id != workspace_id:
        raise HTTPException(404, "ICP not found")

    rubric = ICPRubric(**icp.rubric)

    # Get domains to score
    if req.domains:
        profiles = [session.get(CompanyProfile, d) for d in req.domains]
        profiles = [p for p in profiles if p]
    else:
        profiles = session.exec(select(CompanyProfile).where(CompanyProfile.workspace_id == workspace_id)).all()

    scores = []
    for profile in profiles:
        # Get signals for this domain
        from models import Signal
        signals = session.exec(
            select(Signal)
            .where(Signal.domain == profile.domain)
            .where(Signal.workspace_id == workspace_id)
        ).all()

        icp_score = score_company(
            profile=profile,
            rubric=rubric,
            signals=signals,
            pos_centroid=icp.pos_centroid,
            neg_centroid=icp.neg_centroid,
        )
        icp_score.icp_id = icp.id
        icp_score.workspace_id = workspace_id

        # Upsert score
        existing = session.exec(
            select(ICPScore)
            .where(ICPScore.domain == profile.domain)
            .where(ICPScore.icp_id == icp.id)
        ).first()

        if existing:
            for key, val in icp_score.model_dump(exclude_unset=True, exclude={"id"}).items():
                setattr(existing, key, val)
        else:
            session.add(icp_score)

        scores.append({
            "domain": profile.domain,
            "name": profile.name,
            "final_score": icp_score.final_score,
            "score_low": icp_score.score_low,
            "score_high": icp_score.score_high,
            "fit_category": icp_score.fit_category,
            "quality_score": profile.quality_score,
            "criterion_scores": icp_score.criterion_scores,
            "missing_fields": icp_score.missing_fields,
        })

    session.commit()

    # Sort by score descending
    scores.sort(key=lambda s: s.get("final_score") or 0, reverse=True)
    return {"scores": scores, "total": len(scores), "icp_name": icp.name}


@router.delete("/{icp_id}")
async def delete_icp(
    icp_id: str,
    session: Session = Depends(get_session),
    workspace_id: uuid.UUID = Depends(get_workspace_id),
):
    """Delete an ICP definition."""
    icp = session.get(ICPDefinition, uuid.UUID(icp_id))
    if not icp or icp.workspace_id != workspace_id:
        raise HTTPException(404, "ICP not found")
    session.delete(icp)
    session.commit()
    return {"status": "deleted"}
