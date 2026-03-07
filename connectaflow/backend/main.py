"""
Connectaflow V2 — Main application entry point.
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from config import settings
from database import create_db_and_tables
from services.bootstrap import ensure_default_workspace


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Connectaflow V2...")
    create_db_and_tables()
    ensure_default_workspace()

    if not settings.has_any_llm_provider():
        logger.warning("No LLM providers configured! Set GROQ_API_KEY or GEMINI_API_KEY in .env")
    else:
        providers = []
        if settings.GROQ_API_KEY:
            providers.append("Groq")
        if settings.GEMINI_API_KEY:
            providers.append("Gemini")
        logger.info(f"LLM providers: {', '.join(providers)}")

    logger.info(f"CORS origins: {settings.cors_origins_list}")
    yield
    logger.info("Shutting down Connectaflow V2")


app = FastAPI(
    title="Connectaflow",
    description="AI-Powered GTM Intelligence Platform",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS from environment
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
from api.leads import router as leads_router
from api.enrichment import router as enrichment_router
from api.icp import router as icp_router
from api.signals import router as signals_router
from api.playbooks import router as playbooks_router
from api.gtm import router as gtm_router
from api.workspaces import router as workspaces_router
from api.lists import router as lists_router
from api.segments import router as segments_router
from api.messaging import router as messaging_router
from api.campaigns import router as campaigns_router

app.include_router(leads_router, prefix="/api")
app.include_router(enrichment_router, prefix="/api")
app.include_router(icp_router, prefix="/api")
app.include_router(signals_router, prefix="/api")
app.include_router(playbooks_router, prefix="/api")
app.include_router(gtm_router, prefix="/api")
app.include_router(workspaces_router, prefix="/api")
app.include_router(lists_router, prefix="/api")
app.include_router(segments_router, prefix="/api")
app.include_router(messaging_router, prefix="/api")
app.include_router(campaigns_router, prefix="/api")


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "version": "2.0.0",
        "providers": {
            "groq": bool(settings.GROQ_API_KEY),
            "gemini": bool(settings.GEMINI_API_KEY),
        },
    }
