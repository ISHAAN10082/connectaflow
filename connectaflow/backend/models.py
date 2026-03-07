from typing import Optional, List, Dict, Any
from sqlmodel import SQLModel, Field, Column, JSON
from pydantic import BaseModel
from datetime import datetime
import uuid


# ─────────────────────────────────────────────────────────────
# Workspace + ID defaults
# ─────────────────────────────────────────────────────────────

DEFAULT_WORKSPACE_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


class Workspace(SQLModel, table=True):
    __tablename__ = "workspaces"
    id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, primary_key=True)
    name: str = Field(default="Default Workspace")
    settings: Dict = Field(default={}, sa_column=Column(JSON))


class WorkspaceMember(SQLModel, table=True):
    __tablename__ = "workspace_members"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(foreign_key="workspaces.id", index=True)
    email: str = Field(index=True)
    role: str = Field(default="Admin")  # Admin | Strategist | Analyst | Viewer
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ─────────────────────────────────────────────────────────────
# Quality Architecture: DataPoint — every value carries provenance
# ─────────────────────────────────────────────────────────────

class DataPoint(BaseModel):
    """Every extracted value carries source, confidence, and evidence."""
    value: Any
    confidence: float = 0.0
    source: str = "unknown"
    source_url: Optional[str] = None
    evidence: Optional[str] = None


# ─────────────────────────────────────────────────────────────
# Company Profile — enriched data with quality tracking
# ─────────────────────────────────────────────────────────────

class CompanyProfile(SQLModel, table=True):
    __tablename__ = "company_profiles"
    domain: str = Field(primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    name: Optional[str] = None
    enriched_data: Dict = Field(default={}, sa_column=Column(JSON))
    quality_score: float = Field(default=0.0)
    quality_tier: str = Field(default="pending")
    sources_used: List[str] = Field(default=[], sa_column=Column(JSON))
    enriched_at: Optional[datetime] = None
    cache_expires_at: Optional[datetime] = None
    fetch_metadata: Dict = Field(default={}, sa_column=Column(JSON))


# ─────────────────────────────────────────────────────────────
# ICP (Ideal Customer Profile)
# ─────────────────────────────────────────────────────────────

class ICPCriterion(BaseModel):
    field_name: str
    label: str
    weight: float
    match_type: str
    match_value: Any
    null_handling: str = "skip"


class ICPRubric(BaseModel):
    criteria: List[ICPCriterion] = []
    required_fields: List[str] = []
    description: str = ""
    exclusions: List[str] = []
    synthetic_negatives: List[str] = []


class ICPDefinition(SQLModel, table=True):
    __tablename__ = "icp_definitions"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    name: str
    product_description: str = ""
    customer_examples: List[str] = Field(default=[], sa_column=Column(JSON))
    rubric: Dict = Field(default={}, sa_column=Column(JSON))
    pos_centroid: Optional[List[float]] = Field(default=None, sa_column=Column(JSON))
    neg_centroid: Optional[List[float]] = Field(default=None, sa_column=Column(JSON))
    draft_text: Optional[str] = None
    redteam_text: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ICPScore(SQLModel, table=True):
    __tablename__ = "icp_scores"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    domain: str = Field(index=True)
    icp_id: uuid.UUID = Field(index=True)
    structured_score: Optional[float] = None
    semantic_score: Optional[float] = None
    signal_score: Optional[float] = None
    final_score: Optional[float] = None
    score_low: Optional[float] = None
    score_high: Optional[float] = None
    score_confidence: float = 0.0
    fit_category: str = "unscored"
    criterion_scores: Dict = Field(default={}, sa_column=Column(JSON))
    missing_fields: List[str] = Field(default=[], sa_column=Column(JSON))
    reasoning: Optional[str] = None
    scored_at: datetime = Field(default_factory=datetime.utcnow)


# ─────────────────────────────────────────────────────────────
# Signals
# ─────────────────────────────────────────────────────────────

class Signal(SQLModel, table=True):
    __tablename__ = "signals"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    domain: str = Field(index=True)
    signal_type: str
    strength: float = 0.0
    source_url: Optional[str] = None
    evidence: Optional[str] = None
    detected_at: datetime = Field(default_factory=datetime.utcnow)


# ─────────────────────────────────────────────────────────────
# Leads
# ─────────────────────────────────────────────────────────────

class Lead(SQLModel, table=True):
    __tablename__ = "leads"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: str = Field(index=True, unique=True)
    domain: Optional[str] = Field(default=None, index=True)
    company_id: Optional[uuid.UUID] = None
    status: str = Field(default="New")
    score: int = Field(default=0)
    enrichment_status: str = Field(default="pending")
    custom_data: Dict = Field(default={}, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class LeadCreate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: str
    domain: Optional[str] = None
    status: str = "New"
    custom_data: Dict = {}


class LeadUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    domain: Optional[str] = None
    status: Optional[str] = None
    score: Optional[int] = None
    enrichment_status: Optional[str] = None
    custom_data: Optional[Dict] = None


# ─────────────────────────────────────────────────────────────
# Enrichment Job tracking
# ─────────────────────────────────────────────────────────────

class EnrichmentJob(SQLModel, table=True):
    __tablename__ = "enrichment_jobs"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    status: str = "queued"
    total_domains: int = 0
    completed_domains: int = 0
    failed_domains: int = 0
    icp_id: Optional[uuid.UUID] = None
    results_summary: Dict = Field(default={}, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None


# ─────────────────────────────────────────────────────────────
# Backward compat — keep existing models
# ─────────────────────────────────────────────────────────────

class CustomField(SQLModel, table=True):
    __tablename__ = "custom_fields"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    name: str = Field(index=True)
    field_type: str
    entity_type: str = "lead"
    is_required: bool = False
    options: Optional[List[str]] = Field(default=None, sa_column=Column(JSON))


class EnrichmentLog(SQLModel, table=True):
    __tablename__ = "enrichment_logs"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    lead_id: Optional[uuid.UUID] = None
    domain: Optional[str] = None
    source: str
    status: str
    result: Dict = Field(default={}, sa_column=Column(JSON))
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class Campaign(SQLModel, table=True):
    __tablename__ = "campaigns"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    name: str
    status: str = "draft"
    template_subject: str = Field(default="")
    template_body: str = Field(default="")
    daily_limit: int = 50
    schedule_enabled: bool = True
    # Spec-aligned campaign metadata
    hypothesis: str = Field(default="")
    icp_id: Optional[uuid.UUID] = Field(default=None, index=True)
    segment_id: Optional[uuid.UUID] = Field(default=None, index=True)
    messaging_id: Optional[uuid.UUID] = Field(default=None, index=True)
    sequence_id: Optional[uuid.UUID] = Field(default=None, index=True)
    az_test_id: Optional[uuid.UUID] = Field(default=None, index=True)
    smartlead_id: Optional[str] = None
    volume_warn_threshold: int = 200
    volume_block_threshold: int = 50
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class CampaignVariableDef(SQLModel, table=True):
    __tablename__ = "campaign_variable_defs"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    campaign_id: uuid.UUID = Field(foreign_key="campaigns.id")
    name: str
    variable_key: str
    note: Optional[str] = None


class VariableOption(SQLModel, table=True):
    __tablename__ = "variable_options"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    variable_def_id: uuid.UUID = Field(foreign_key="campaign_variable_defs.id")
    content: str
    name: str


class CampaignVariant(SQLModel, table=True):
    __tablename__ = "campaign_variants"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    campaign_id: uuid.UUID = Field(foreign_key="campaigns.id")
    combination_hash: str
    sent_count: int = 0
    open_count: int = 0
    reply_count: int = 0
    meeting_booked_count: int = 0


class ActivityLog(SQLModel, table=True):
    __tablename__ = "activity_logs"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    lead_id: uuid.UUID = Field(foreign_key="leads.id")
    campaign_id: Optional[uuid.UUID] = Field(default=None, foreign_key="campaigns.id")
    variant_id: Optional[uuid.UUID] = Field(default=None, foreign_key="campaign_variants.id")
    type: str
    status: str
    meta_data: Dict = Field(default={}, sa_column=Column(JSON))
    occurred_at: datetime = Field(default_factory=datetime.utcnow)


# ─────────────────────────────────────────────────────────────
# Playbooks & Plays — persona-driven engagement sequences
# ─────────────────────────────────────────────────────────────

class Playbook(SQLModel, table=True):
    __tablename__ = "playbooks"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    name: str
    description: str = ""
    icp_id: Optional[uuid.UUID] = Field(default=None, index=True)
    status: str = Field(default="draft")  # draft | active | paused | archived
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Play(SQLModel, table=True):
    __tablename__ = "plays"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    playbook_id: uuid.UUID = Field(foreign_key="playbooks.id", index=True)
    name: str
    description: str = ""
    trigger_rules: Dict = Field(default={}, sa_column=Column(JSON))
    # trigger_rules schema:
    # {
    #   "fit_categories": ["high", "medium"],
    #   "min_score": 60,
    #   "signal_types": ["hiring_sdr", "hiring_ae"],
    #   "min_signals": 1
    # }
    priority: int = Field(default=0)  # higher = checked first
    status: str = Field(default="active")  # active | paused
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PlayStep(SQLModel, table=True):
    __tablename__ = "play_steps"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    play_id: uuid.UUID = Field(foreign_key="plays.id", index=True)
    step_number: int = Field(default=1)
    step_type: str  # email | wait | task | condition
    config: Dict = Field(default={}, sa_column=Column(JSON))
    # email: { subject, body }
    # wait:  { days: 3 }
    # task:  { title, description }
    # condition: { check: "email_opened", yes_step: 4, no_step: 3 }
    created_at: datetime = Field(default_factory=datetime.utcnow)


class PlayEnrollment(SQLModel, table=True):
    __tablename__ = "play_enrollments"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    play_id: uuid.UUID = Field(foreign_key="plays.id", index=True)
    lead_id: Optional[uuid.UUID] = Field(default=None, foreign_key="leads.id", index=True)
    domain: Optional[str] = Field(default=None, index=True)
    current_step: int = Field(default=1)
    status: str = Field(default="active")  # active | paused | completed | exited
    enrolled_at: datetime = Field(default_factory=datetime.utcnow)
    last_step_at: Optional[datetime] = None
    step_history: List = Field(default=[], sa_column=Column(JSON))


# ─────────────────────────────────────────────────────────────
# List Ingestion + Segments
# ─────────────────────────────────────────────────────────────

class CompanyList(SQLModel, table=True):
    __tablename__ = "company_lists"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    icp_id: Optional[uuid.UUID] = Field(default=None, index=True)
    name: str = Field(default="Untitled List")
    source: str = Field(default="csv")  # csv | api | manual
    status: str = Field(default="ingested")  # ingested | enriching | complete | failed
    raw_columns: Dict = Field(default={}, sa_column=Column(JSON))
    row_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ListItem(SQLModel, table=True):
    __tablename__ = "list_items"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    list_id: uuid.UUID = Field(foreign_key="company_lists.id", index=True)
    domain: str = Field(index=True)
    company_name: Optional[str] = None
    contact_name: Optional[str] = None
    contact_email: Optional[str] = Field(default=None, index=True)
    contact_title: Optional[str] = None
    raw_data: Dict = Field(default={}, sa_column=Column(JSON))
    dedupe_status: str = Field(default="new")  # new | merged | skipped | overwritten
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Segment(SQLModel, table=True):
    __tablename__ = "segments"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    list_id: uuid.UUID = Field(foreign_key="company_lists.id", index=True)
    name: str
    filters: Dict = Field(default={}, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ─────────────────────────────────────────────────────────────
# Motion Intent + Messaging Studio
# ─────────────────────────────────────────────────────────────

class MotionIntent(SQLModel, table=True):
    __tablename__ = "motion_intents"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    icp_id: Optional[uuid.UUID] = Field(default=None, index=True)
    persona_id: Optional[uuid.UUID] = Field(default=None, index=True)
    name: str
    motion_type: str = Field(default="cold")  # cold | trigger | competitive | re-engagement
    primary_angle: str = Field(default="pain-led")
    tone: str = Field(default="consultative")
    cta_intent: str = Field(default="meeting")
    notes: str = Field(default="")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class MessagingSet(SQLModel, table=True):
    __tablename__ = "messaging_sets"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    icp_id: Optional[uuid.UUID] = Field(default=None, index=True)
    persona_id: Optional[uuid.UUID] = Field(default=None, index=True)
    motion_intent_id: Optional[uuid.UUID] = Field(default=None, index=True)
    name: str = Field(default="Messaging Set")
    status: str = Field(default="draft")  # draft | in_review | approved | archived
    version: int = 1
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class MessagingSequence(SQLModel, table=True):
    __tablename__ = "messaging_sequences"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    messaging_id: uuid.UUID = Field(foreign_key="messaging_sets.id", index=True)
    step_count: int = Field(default=5)
    cadence_config: Dict = Field(default={}, sa_column=Column(JSON))  # day offsets, send windows
    created_at: datetime = Field(default_factory=datetime.utcnow)


class MessagingStep(SQLModel, table=True):
    __tablename__ = "messaging_steps"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    sequence_id: uuid.UUID = Field(foreign_key="messaging_sequences.id", index=True)
    step_number: int = Field(default=1)
    label: str = Field(default="Step")
    day_offset: int = Field(default=0)
    tone: str = Field(default="neutral")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class MessagingVariant(SQLModel, table=True):
    __tablename__ = "messaging_variants"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    messaging_id: uuid.UUID = Field(foreign_key="messaging_sets.id", index=True)
    step_number: int = Field(default=1)
    component: str = Field(default="Subject")  # Subject | Opener | Problem | ValueProp | Story | CTA | Greeting | Closer | OptOut | AliasName
    label: str = Field(default="A")
    content: str = Field(default="")
    is_active: bool = True
    is_winner: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AZTest(SQLModel, table=True):
    __tablename__ = "az_tests"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    campaign_id: uuid.UUID = Field(foreign_key="campaigns.id", index=True)
    test_variable: str = Field(default="Subject")  # single variable per spec
    confidence_threshold: float = 0.95
    status: str = Field(default="running")  # running | complete | inconclusive
    winner_variant_id: Optional[uuid.UUID] = Field(default=None, index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ─── Pydantic schemas for Playbook API ───────────────────────

class PlaybookCreate(BaseModel):
    name: str
    description: str = ""
    icp_id: Optional[str] = None

class PlaybookUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None

class PlayCreate(BaseModel):
    name: str
    description: str = ""
    trigger_rules: Dict = {}
    priority: int = 0

class PlayUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    trigger_rules: Optional[Dict] = None
    priority: Optional[int] = None
    status: Optional[str] = None

class PlayStepCreate(BaseModel):
    step_number: int = 1
    step_type: str
    config: Dict = {}

class PlayStepUpdate(BaseModel):
    step_number: Optional[int] = None
    step_type: Optional[str] = None
    config: Optional[Dict] = None

class EnrollRequest(BaseModel):
    lead_ids: List[str] = []
    domains: List[str] = []


# ─────────────────────────────────────────────────────────────
# GTM Intelligence — Personas, Buying Triggers, Signal Defs, Plays
# ─────────────────────────────────────────────────────────────

class GTMContext(SQLModel, table=True):
    """Top-level GTM strategy container — one per campaign thesis."""
    __tablename__ = "gtm_contexts"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    # Section A — Company context
    company_name: str = ""
    website_url: str = ""
    core_problem: str = ""
    product_category: str = ""
    context_notes: str = ""
    name: str
    product_description: str = ""
    target_industries: List[str] = Field(default=[], sa_column=Column(JSON))
    customer_examples: List[str] = Field(default=[], sa_column=Column(JSON))
    value_proposition: str = ""
    competitors: List[str] = Field(default=[], sa_column=Column(JSON))
    geographic_focus: str = ""
    icp_id: Optional[uuid.UUID] = Field(default=None, index=True)
    status: str = Field(default="draft")  # draft | active | archived
    # ── Deep discovery fields ─────────────────────────────
    avg_deal_size: str = ""              # e.g. "$25k-$80k ARR"
    sales_cycle_days: str = ""           # e.g. "30-60 days"
    decision_process: str = ""           # e.g. "VP evaluates → CFO signs → IT security review"
    key_integrations: List[str] = Field(default=[], sa_column=Column(JSON))  # tech stack that matters
    why_customers_buy: str = ""          # actual reasons from closed-won deals
    why_customers_churn: str = ""        # actual reasons from churned accounts
    common_objections: List[str] = Field(default=[], sa_column=Column(JSON))  # top 3-5 sales objections
    market_maturity: str = ""            # emerging | growing | mature | disrupted
    pricing_model: str = ""              # per-seat | usage | flat | custom enterprise
    # ── ICP fields (single ICP per context for now) ─────────────────
    icp_name: str = ""
    icp_statement: str = ""
    icp_priority: str = "Primary"        # Primary | Secondary | Experimental
    firmographic_range: Dict = Field(default={}, sa_column=Column(JSON))
    icp_rationale: str = ""
    list_sourcing_guidance: str = ""
    # ── Enrichment-derived insights ───────────────────────
    enrichment_patterns: Dict = Field(default={}, sa_column=Column(JSON))  # auto-populated from enriched data
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class Persona(SQLModel, table=True):
    __tablename__ = "personas"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    gtm_context_id: uuid.UUID = Field(index=True)
    name: str                           # e.g. "The Revenue Leader"
    department: str = ""                # Sales, Marketing, Engineering, etc.
    seniority: str = ""                 # VP, Director, Manager, IC
    job_titles: List[str] = Field(default=[], sa_column=Column(JSON))
    responsibilities: List[str] = Field(default=[], sa_column=Column(JSON))
    kpis: List[str] = Field(default=[], sa_column=Column(JSON))
    pain_points: List[str] = Field(default=[], sa_column=Column(JSON))
    decision_role: str = ""             # Decision Maker | Influencer | Champion | Blocker
    # ── Deep buyer psychology ─────────────────────────────
    buying_style: str = ""              # analytical | relationship | consensus | visionary
    information_diet: List[str] = Field(default=[], sa_column=Column(JSON))  # where they learn: podcasts, linkedin, gartner, peers
    objections: List[str] = Field(default=[], sa_column=Column(JSON))         # what they push back on during sales
    internal_politics: str = ""         # who they need to convince, org dynamics
    trigger_phrases: List[str] = Field(default=[], sa_column=Column(JSON))    # things they say that signal buying intent
    day_in_life: str = ""               # what their actual day looks like
    success_looks_like: str = ""        # what outcome they'd present to their boss
    nightmare_scenario: str = ""        # what failure looks like — drives urgency
    evaluation_criteria: List[str] = Field(default=[], sa_column=Column(JSON))  # how they evaluate vendors
    messaging_do: List[str] = Field(default=[], sa_column=Column(JSON))        # messaging that resonates
    messaging_dont: List[str] = Field(default=[], sa_column=Column(JSON))      # messaging that kills deals
    created_at: datetime = Field(default_factory=datetime.utcnow)


class BuyingTrigger(SQLModel, table=True):
    __tablename__ = "buying_triggers"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    gtm_context_id: uuid.UUID = Field(index=True)
    name: str                           # e.g. "SDR Hiring Expansion"
    description: str = ""
    category: str = ""                  # hiring | growth | leadership | technology | market
    # ── Depth fields ─────────────────────────────────────
    urgency_level: str = ""             # immediate | short_term | long_term
    why_it_matters: str = ""            # why this trigger creates buying intent for YOUR product
    ideal_timing: str = ""              # when to reach out relative to trigger (during | 30d after | etc)
    qualifying_questions: List[str] = Field(default=[], sa_column=Column(JSON))  # questions that confirm this trigger is real
    created_at: datetime = Field(default_factory=datetime.utcnow)


class SignalDefinition(SQLModel, table=True):
    """Observable indicator that a trigger is happening. Linked to a trigger."""
    __tablename__ = "signal_definitions"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    gtm_context_id: uuid.UUID = Field(index=True)
    trigger_id: Optional[uuid.UUID] = Field(default=None, index=True)
    name: str                           # e.g. "LinkedIn SDR job postings"
    description: str = ""
    source: str = ""                    # linkedin | website | news | funding_db | tech_stack
    detection_method: str = ""          # keyword / regex / api / manual
    # ── Depth fields ─────────────────────────────────────
    keywords: List[str] = Field(default=[], sa_column=Column(JSON))    # actual search terms / regex patterns
    strength_score: float = Field(default=0.5)                         # 0-1 how strong this signal is
    false_positive_notes: str = ""      # when this signal is misleading
    enrichment_fields_used: List[str] = Field(default=[], sa_column=Column(JSON))  # which enriched fields feed this
    created_at: datetime = Field(default_factory=datetime.utcnow)


class GTMPlay(SQLModel, table=True):
    """
    A Play connects ICP + Trigger + Signal + Persona + Messaging Angle.
    This is the strategic layer; PlaybookManager handles execution sequences.
    """
    __tablename__ = "gtm_plays"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workspace_id: uuid.UUID = Field(default=DEFAULT_WORKSPACE_ID, foreign_key="workspaces.id", index=True)
    gtm_context_id: uuid.UUID = Field(index=True)
    name: str
    icp_statement: str = ""             # "US SaaS 50-200 emp hiring SDRs"
    trigger_id: Optional[uuid.UUID] = Field(default=None, index=True)
    signal_id: Optional[uuid.UUID] = Field(default=None, index=True)
    persona_id: Optional[uuid.UUID] = Field(default=None, index=True)
    messaging_angle: str = ""
    status: str = Field(default="draft")  # draft | active | paused
    playbook_id: Optional[uuid.UUID] = Field(default=None, index=True)  # link to execution playbook
    # ── Tactical depth ────────────────────────────────────
    channel_sequence: List[str] = Field(default=[], sa_column=Column(JSON))    # ["email", "linkedin", "phone", "email"]
    timing_rationale: str = ""          # why this sequence and cadence
    opening_hook: str = ""              # first-touch hook (the actual line)
    objection_handling: Dict = Field(default={}, sa_column=Column(JSON))       # {"too expensive": "response", "already have solution": "response"}
    competitive_positioning: str = ""   # how to position vs. specific competitor for this play
    success_criteria: str = ""          # what "working" looks like (e.g. "15% reply rate, 3% meeting book")
    email_subject_lines: List[str] = Field(default=[], sa_column=Column(JSON)) # 3-5 tested subject line variants
    call_talk_track: str = ""           # 30-second phone pitch for this play
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ─── Pydantic schemas for GTM API ────────────────────────────

class GTMContextCreate(BaseModel):
    company_name: str = ""
    website_url: str = ""
    core_problem: str = ""
    product_category: str = ""
    context_notes: str = ""
    name: str
    product_description: str = ""
    target_industries: List[str] = []
    customer_examples: List[str] = []
    value_proposition: str = ""
    competitors: List[str] = []
    geographic_focus: str = ""
    avg_deal_size: str = ""
    sales_cycle_days: str = ""
    decision_process: str = ""
    key_integrations: List[str] = []
    why_customers_buy: str = ""
    why_customers_churn: str = ""
    common_objections: List[str] = []
    market_maturity: str = ""
    pricing_model: str = ""
    icp_name: str = ""
    icp_statement: str = ""
    icp_priority: str = "Primary"
    firmographic_range: Dict = {}
    icp_rationale: str = ""
    list_sourcing_guidance: str = ""

class GTMContextUpdate(BaseModel):
    company_name: Optional[str] = None
    website_url: Optional[str] = None
    core_problem: Optional[str] = None
    product_category: Optional[str] = None
    context_notes: Optional[str] = None
    name: Optional[str] = None
    product_description: Optional[str] = None
    target_industries: Optional[List[str]] = None
    customer_examples: Optional[List[str]] = None
    value_proposition: Optional[str] = None
    competitors: Optional[List[str]] = None
    geographic_focus: Optional[str] = None
    status: Optional[str] = None
    icp_id: Optional[str] = None
    avg_deal_size: Optional[str] = None
    sales_cycle_days: Optional[str] = None
    decision_process: Optional[str] = None
    key_integrations: Optional[List[str]] = None
    why_customers_buy: Optional[str] = None
    why_customers_churn: Optional[str] = None
    common_objections: Optional[List[str]] = None
    market_maturity: Optional[str] = None
    pricing_model: Optional[str] = None
    enrichment_patterns: Optional[Dict] = None
    icp_name: Optional[str] = None
    icp_statement: Optional[str] = None
    icp_priority: Optional[str] = None
    firmographic_range: Optional[Dict] = None
    icp_rationale: Optional[str] = None
    list_sourcing_guidance: Optional[str] = None

class PersonaCreate(BaseModel):
    name: str
    department: str = ""
    seniority: str = ""
    job_titles: List[str] = []
    responsibilities: List[str] = []
    kpis: List[str] = []
    pain_points: List[str] = []
    decision_role: str = ""
    buying_style: str = ""
    information_diet: List[str] = []
    objections: List[str] = []
    internal_politics: str = ""
    trigger_phrases: List[str] = []
    day_in_life: str = ""
    success_looks_like: str = ""
    nightmare_scenario: str = ""
    evaluation_criteria: List[str] = []
    messaging_do: List[str] = []
    messaging_dont: List[str] = []

class BuyingTriggerCreate(BaseModel):
    name: str
    description: str = ""
    category: str = ""
    urgency_level: str = ""
    why_it_matters: str = ""
    ideal_timing: str = ""
    qualifying_questions: List[str] = []

class SignalDefinitionCreate(BaseModel):
    name: str
    description: str = ""
    trigger_id: Optional[str] = None
    source: str = ""
    detection_method: str = ""
    keywords: List[str] = []
    strength_score: float = 0.5
    false_positive_notes: str = ""
    enrichment_fields_used: List[str] = []

class GTMPlayCreate(BaseModel):
    name: str
    icp_statement: str = ""
    trigger_id: Optional[str] = None
    signal_id: Optional[str] = None
    persona_id: Optional[str] = None
    messaging_angle: str = ""
    playbook_id: Optional[str] = None
    channel_sequence: List[str] = []
    timing_rationale: str = ""
    opening_hook: str = ""
    objection_handling: Dict = {}
    competitive_positioning: str = ""
    success_criteria: str = ""
    email_subject_lines: List[str] = []
    call_talk_track: str = ""
