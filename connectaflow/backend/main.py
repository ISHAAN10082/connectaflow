from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

from contextlib import asynccontextmanager
from database import create_db_and_tables

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield

app = FastAPI(title="Connectaflow API", version="0.1.0", lifespan=lifespan)

from api import leads, enrichment
app.include_router(leads.router)
app.include_router(enrichment.router)

# CORS Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://172.20.10.2:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Connectaflow Backend is running"}

@app.get("/health")
def health_check():
    return {"status": "ok"}
