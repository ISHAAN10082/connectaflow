from fastapi import APIRouter, UploadFile, File, BackgroundTasks, HTTPException, Depends
from sqlmodel import Session, select
from database import get_session
from models import Lead
from data_processing import read_csv_buffer
from enrichment import EnrichmentService
from typing import List, Dict
import asyncio
import polars as pl
from io import BytesIO
from loguru import logger
from pydantic import BaseModel

router = APIRouter(prefix="/api/enrichment", tags=["enrichment"])
enrichment_service = EnrichmentService()

@router.post("/upload")
async def upload_leads(
    file: UploadFile = File(...), 
    session: Session = Depends(get_session)
):
    logger.info(f"Received file upload: {file.filename}")
    if not (file.filename.endswith('.csv') or file.filename.endswith('.xlsx')):
        raise HTTPException(status_code=400, detail="Only CSV and Excel files are allowed")
    
    content = await file.read()
    try:
        if file.filename.endswith('.xlsx'):
             df = pl.read_excel(BytesIO(content))
        else:
             df = read_csv_buffer(content)
        
        logger.info(f"Parsed DataFrame with shape: {df.shape}")

        # Basic Mapping: Try to find 'email', 'first_name', 'last_name', 'company', 'url'
        # Normalize columns to lower case for matching
        df.columns = [c.lower().strip() for c in df.columns]
        
        leads_to_create = []
        seen_emails = set()
        
        # Pre-fetch existing emails to minimize DB queries (performance optimization for bulk)
        existing_emails_result = session.exec(select(Lead.email)).all()
        existing_emails_db = set(existing_emails_result)

        for row in df.to_dicts():
            # Basic validation: Skip if no email is found
            email = row.get('email')
            if not email:
                continue 
            
            # Normalize email
            email = email.lower().strip()

            # Check duplication within file OR within Database
            if email in seen_emails or email in existing_emails_db:
                continue
            
            seen_emails.add(email)

            lead = Lead(
                email=email,
                first_name=row.get('first_name') or row.get('name') or row.get('full_name'),
                last_name=row.get('last_name'),
                company_id=None,
                status="New",
                enrichment_status="pending",
                custom_data=row # Store all raw data for reference
            )
            leads_to_create.append(lead)
        
        if leads_to_create:
            session.add_all(leads_to_create)
            session.commit()
            logger.success(f"Successfully imported {len(leads_to_create)} leads")
            
        return {
            "total_rows": len(df), 
            "imported_count": len(leads_to_create), 
            "message": f"Successfully processed {len(df)} rows. Imported {len(leads_to_create)} new leads."
        }
    except Exception as e:
        logger.error(f"Import failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


class TestEnrichRequest(BaseModel):
    url: str

@router.post("/test-enrich")
async def test_enrichment(request: TestEnrichRequest):
    logger.info(f"Testing enrichment for URL: {request.url}")
    result = await enrichment_service.extract_company_info(request.url)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result

class BatchEnrichRequest(BaseModel):
    lead_ids: List[str]
    target_columns: List[str]
    context_columns: List[str] = ["company"]
    instruction: str = None

@router.post("/batch-enrich")
async def batch_enrich_leads(
    request: BatchEnrichRequest, 
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session)
):
    """
    Trigger batch enrichment for selected leads.
    """
    # Verify leads exist
    # Fix: Convert string IDs to UUID objects to satisfy SQLAlchemy/SQLModel UUID type
    import uuid
    try:
        lead_uuids = [uuid.UUID(lid) for lid in request.lead_ids]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid UUID format in lead_ids")

    stmt = select(Lead).where(Lead.id.in_(lead_uuids))
    leads = session.exec(stmt).all()
    
    if not leads:
        raise HTTPException(status_code=404, detail="No leads found with provided IDs")

    
    # We must pass IDs (strings/UUIDs) to background task and create a FRESH session there.
    # Passing the request-scoped 'session' object to a background task is Unsafe/Wrong 
    # because the session closes when the request ends.
    
    lead_uuids_str = [str(uid) for uid in lead_uuids]

    async def process_batch_enrichment_task(lead_ids: List[str], targets: List[str], context: List[str], instruction: str):
        # Create a detailed new session for the background job
        logger.info(f"Starting async batch job for {len(lead_ids)} leads.")
        
        # We need to manually create session here because we are out of request context
        from database import engine
        from sqlmodel import Session
        import uuid

        with Session(engine) as bg_session:
             for lid in lead_ids:
                try:
                    lead = bg_session.get(Lead, uuid.UUID(lid))
                    if not lead:
                        continue
                        
                    logger.info(f"Enriching Lead: {lead.email}")
                    
                    # Prepare lead data
                    lead_data = lead.model_dump()
                    lead_data.update(lead.custom_data or {})
                    
                    # Enrich (Slow network op)
                    result = await enrichment_service.enrich_lead(lead_data, targets, context, instruction)
                    
                    if result and "error" not in result:
                        # Refresh lead to be safe
                        lead = bg_session.get(Lead, uuid.UUID(lid))
                        
                        # Merge Dicts
                        current_custom = dict(lead.custom_data or {})
                        current_custom.update(result)
                        
                        lead.custom_data = current_custom
                        lead.enrichment_status = "enriched"
                        bg_session.add(lead)
                        bg_session.commit()
                        logger.success(f"Enriched {lead.email} successfully. Added keys: {list(result.keys())}")
                        logger.debug(f"New Custom Data: {current_custom}")
                    else:
                         logger.warning(f"Failed to enrich {lead.email}: {result}")
                except Exception as e:
                    logger.error(f"Error processing lead {lid}: {e}")

    # Run in background
    background_tasks.add_task(process_batch_enrichment_task, lead_uuids_str, request.target_columns, request.context_columns, request.instruction)

    return {"message": f"Batch enrichment started for {len(leads)} leads", "job_id": "async-job"}
async def trigger_enrichment(urls: List[str], extraction_prompt: str, background_tasks: BackgroundTasks):
    # This would be an async background task
    # For now, just a stub
    return {"message": "Enrichment started", "job_id": "job_123"}
