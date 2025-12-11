from typing import Optional, List, Dict
from sqlmodel import SQLModel, Field, Column, JSON
from datetime import datetime
import uuid

class CustomField(SQLModel, table=True):
    __tablename__ = "custom_fields"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(index=True)
    field_type: str # text, number, date, select
    entity_type: str = "lead" # lead, company, deal
    is_required: bool = False
    options: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))

class Lead(SQLModel, table=True):
    __tablename__ = "leads"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: str = Field(index=True, unique=True)
    company_id: Optional[uuid.UUID] = None
    status: str = Field(default="New")
    score: int = Field(default=0)
    enrichment_status: str = Field(default="pending") # pending, enriched, failed
    custom_data: Dict = Field(default={}, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class EnrichmentLog(SQLModel, table=True):
    __tablename__ = "enrichment_logs"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    lead_id: uuid.UUID
    source: str # crawl4ai, hunter
    status: str
    result: Dict = Field(default={}, sa_column=Column(JSON))
    timestamp: datetime = Field(default_factory=datetime.utcnow)
