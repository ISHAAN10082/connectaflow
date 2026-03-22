# Connectaflow — GTM Intelligence Platform

> **Full-stack Go-To-Market intelligence engine.** Connectaflow combines multi-source company enrichment, AI-powered ICP generation, intent signal detection, playbook execution, and multi-channel outcomes analytics into a single operator workspace.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Architecture](#2-architecture)
3. [Module Reference](#3-module-reference)
   - [GTM Intelligence](#31-gtm-intelligence)
   - [Enrichment Engine](#32-enrichment-engine)
   - [ICP Scoring](#33-icp-scoring)
   - [Signal Queue](#34-signal-queue)
   - [Lead Management](#35-lead-management)
   - [Plays & Messaging Studio](#36-plays--messaging-studio)
   - [Playbook Engine](#37-playbook-engine)
   - [Replies Inbox](#38-replies-inbox)
   - [Outcomes Dashboard](#39-outcomes-dashboard)
   - [AI Copilot](#310-ai-copilot)
   - [Activities Log](#311-activities-log)
   - [Social Proof Assets](#312-social-proof-assets)
4. [Complete API Reference](#4-complete-api-reference)
5. [Data Models](#5-data-models)
6. [Intelligence Services](#6-intelligence-services)
7. [Integrations](#7-integrations)
8. [Data Flow](#8-data-flow)
9. [Implementation Status](#9-implementation-status)
10. [Setup & Configuration](#10-setup--configuration)
11. [Environment Variables](#11-environment-variables)
12. [Development Guide](#12-development-guide)
13. [Changelog](#13-changelog)

---

## 1. Product Overview

Connectaflow is an eight-module GTM platform designed around a single workflow: **find the right companies, understand them deeply, reach out at the right moment, and convert.**

```
┌─────────────┐   ┌────────────────┐   ┌──────────────┐   ┌──────────────┐
│  GTM Intel  │──▶│  Enrichment    │──▶│  ICP Score   │──▶│ Signal Queue │
│  (Strategy) │   │  (Deep Data)   │   │  (T1/T2/T3)  │   │  (Priority)  │
└─────────────┘   └────────────────┘   └──────────────┘   └──────────────┘
                                                                   │
┌─────────────┐   ┌────────────────┐   ┌──────────────┐           ▼
│  Outcomes   │◀──│ Replies Inbox  │◀──│  Playbooks   │◀──┌──────────────┐
│  Analytics  │   │  (AI Classify) │   │  + Studio    │   │  Lead Table  │
└─────────────┘   └────────────────┘   └──────────────┘   └──────────────┘
                                                │
                                         ┌──────┴──────┐
                                         │ AI Copilot  │
                                         └─────────────┘
```

**Optimal user journey:**

1. **GTM Intelligence** — Define your product, build personas, buying triggers, and strategic plays
2. **Enrichment Engine** — Upload a lead list (CSV/XLSX) to enrich company profiles from multiple sources
3. **ICP Scoring** — Score enriched companies against your ICP rubric to get T1/T2/T3 tier assignments
4. **Signal Queue** — Review warm accounts ranked by composite score (ICP × intent signals × recency)
5. **Lead Table** — Manage contacts with status tracking, cooldown logic, and meeting brief generation
6. **Plays & Messaging Studio** — Generate component-based, persona-aware outreach sequences
7. **Playbook Engine** — Enroll leads into structured multi-step plays, track progress
8. **Replies Inbox** — Classify incoming replies (interested/objection/neutral/OOO)
9. **Outcomes Dashboard** — Analyse performance across email, LinkedIn, and calls by tier, play, persona
10. **AI Copilot** — Ask natural language questions about your pipeline at any time

---

## 2. Architecture

### Stack

| Layer | Technology |
|-------|-----------|
| Backend API | FastAPI (Python 3.11+) |
| ORM / Validation | SQLModel + Pydantic v2 |
| Database | SQLite (default) / PostgreSQL |
| LLM Integration | litellm + instructor (Groq + Gemini) |
| Background Jobs | APScheduler |
| HTTP Client | httpx (async) |
| HTML Extraction | trafilatura |
| Frontend | Next.js 16 + React 19 |
| Styling | Tailwind CSS 4 |
| API Client | Axios |
| Data Tables | TanStack React Table 8 |
| Icons | Lucide React |
| Toasts | Sonner |

### Directory Structure

```
connectaflow/
├── backend/
│   ├── api/                    # Route handlers (one file per module)
│   │   ├── activities.py       # Outreach activity logging
│   │   ├── assets.py           # Social proof assets
│   │   ├── campaigns.py        # Campaign scaffolding
│   │   ├── copilot.py          # AI Copilot Q&A
│   │   ├── enrichment.py       # Enrichment pipeline + CSV import
│   │   ├── gtm.py              # GTM Intelligence strategy
│   │   ├── icp.py              # ICP generation + scoring
│   │   ├── leads.py            # Lead CRUD + cooldown + meeting brief
│   │   ├── outcomes.py         # Analytics + Smartlead sync
│   │   ├── playbooks.py        # Playbook/play/step/enrollment engine
│   │   ├── plays_messaging.py  # Messaging plays studio
│   │   ├── replies.py          # Replies inbox
│   │   └── signals.py          # Signal queue + external signals
│   ├── services/
│   │   ├── enrichment/         # Enrichment pipeline
│   │   │   ├── pipeline.py     # Orchestrator
│   │   │   ├── fetcher.py      # HTTP fetcher (async, with semaphore)
│   │   │   ├── commoncrawl.py  # CommonCrawl index lookup
│   │   │   ├── extractors.py   # Schema.org, meta, OpenGraph, etc.
│   │   │   ├── cross_validator.py  # Multi-source consensus + quality scoring
│   │   │   └── llm_extract.py  # LLM fallback for missing fields
│   │   ├── intelligence/
│   │   │   ├── icp_builder.py      # 3-pass Constitutional AI ICP generation
│   │   │   ├── scorer.py           # ICP scoring formula + tier assignment
│   │   │   ├── reply_classifier.py # AI reply classification + sentiment
│   │   │   ├── meeting_brief.py    # Meeting prep brief generation
│   │   │   ├── context_parser.py   # File → GTM context extraction
│   │   │   └── plays_generator.py  # Play sequence generation
│   │   ├── signals/
│   │   │   ├── detector.py         # Signal detection from enriched data
│   │   │   └── external_discovery.py  # Background job (every 6h)
│   │   └── integrations/
│   │       └── smartlead.py        # Smartlead API wrapper
│   ├── models.py               # All SQLModel table definitions
│   ├── config.py               # Settings (env vars)
│   ├── database.py             # DB session factory
│   └── main.py                 # App + router registration
├── frontend/
│   └── src/
│       ├── components/         # React components (one per module)
│       ├── services/
│       │   └── api.ts          # Axios wrapper + all API calls
│       └── lib/
│           ├── errors.ts       # getErrorMessage helper
│           ├── links.ts        # URL/tel validation
│           └── provenance.ts   # Evidence formatting
└── docker-compose.yml
```

---

## 3. Module Reference

### 3.1 GTM Intelligence

**Purpose:** Define the strategic foundation — product context, buyer personas, buying triggers, signal definitions, and plays — before any outreach begins.

**Frontend:** `GTMIntelligence.tsx`

**Key capabilities:**
- Create GTM **contexts** (missions) with deep product + market fields
- Build **personas** with full psychological profiles (decision role, buying style, trigger phrases, nightmare scenarios, evaluation criteria)
- Define **buying triggers** (events that create urgency: hiring, funding, strategic shifts)
- Create **signal definitions** (observable indicators linked to triggers)
- Generate **strategic plays** (ICP statement + angle + channel sequence + email subject lines + call talk track)
- **AI strategy generation** — one-click full GTM strategy from product description
- **Enrichment refinement** — update ICP/plays based on real enriched data
- **ICP suggestions** — 3-5 ICP options with rationale, priority (Primary/Secondary/Experimental), and list sourcing guidance
- **Context parsing** — upload PDFs, decks, docs to extract GTM context automatically

**Backend:** `api/gtm.py` → 24 endpoints

**Connected to:**
- Enrichment Engine (refine from real company data)
- ICP Scoring (ICPs from contexts feed scorer)
- Messaging Studio (personas feed play generation)
- Playbook Engine (strategic plays link to execution playbooks)

---

### 3.2 Enrichment Engine

**Purpose:** Build complete, source-attributed company profiles from domains.

**Frontend:** `EnrichmentDashboard.tsx`

**Key capabilities:**
- Batch domain enrichment (up to 500 at once) with real-time SSE progress stream
- CSV/XLSX lead import (email + name + domain → leads created, domains queued for enrichment)
- **Multi-source pipeline:** CommonCrawl index lookup → live httpx fetch → LLM fallback for missing critical fields
- Every field is a `DataPoint` object with `value`, `confidence` (0–1), `source`, `source_url`, and `evidence` string
- Cross-validation consensus — when multiple sources return the same field, confidence is averaged
- Quality scoring: `quality_score` (0–1) → `quality_tier` (gold/silver/bronze/unknown)
- Manual field overrides with provenance tracking (tagged as `manual_override`)
- Extracted fields: company_name, industry, business_model, hq_location, employee_count, pricing_model, funding_stage, company_description, tech_stack, linkedin_url, company_phone, founded_year, and more
- **ICP Criterion Score Breakdown** — when domain has been ICP scored, shows per-criterion progress bars in the expanded profile view
- **T1/T2/T3 tier badge** displayed alongside ICP fit score

**Backend:** `api/enrichment.py` → 7 endpoints
**Services:** `services/enrichment/pipeline.py`, `fetcher.py`, `commoncrawl.py`, `extractors.py`, `cross_validator.py`, `llm_extract.py`

**Connected to:**
- ICP Scoring (profiles feed the scorer)
- Signal Detection (signals extracted during enrichment)
- Lead Table (company profile shown in lead detail)
- GTM Intelligence (refinement uses enriched data)

---

### 3.3 ICP Scoring

**Purpose:** Score all enriched companies against your ICP rubric and assign tier labels.

**Frontend:** `EnrichmentDashboard.tsx` (score button), `LeadTable.tsx` (tier badge display)

**Key capabilities:**
- **3-pass Constitutional AI ICP generation:**
  1. Draft ICP from product description + customer examples
  2. Red-team critique (identify false positives, missing criteria)
  3. Machine-readable scoring rubric with per-criterion weights
- **Scoring formula:**
  ```
  icp_fit   = rubric criterion match (weighted average)  → 0–1
  intent    = blended signal strength                    → 0–1
  timing    = recency-decayed signal age (half-life 14d) → 0–1

  final_score = icp_fit × (0.7 × intent + 0.3 × timing) × 100
  ```
- **Tier assignment** (relative ranking across all scored companies):
  - **T1** — Top 20% by final score (highest-priority, route immediately)
  - **T2** — Next 30% (worth working soon)
  - **T3** — Bottom 50% (nurture or deprioritize)
- `fit_category`: high / medium / low (absolute threshold)
- `criterion_scores`: per-criterion breakdown (visible in Enrichment expanded view)
- `missing_fields`: fields the rubric wanted but weren't enriched

**Backend:** `api/icp.py` → 6 endpoints
**Services:** `services/intelligence/icp_builder.py`, `services/intelligence/scorer.py`

**Connected to:**
- Enrichment Engine (profiles are the input)
- Signal Queue (ICP score is 45% of composite score)
- Lead Table (tier badge shown per lead)
- Outcomes Dashboard (by-tier analytics)

---

### 3.4 Signal Queue

**Purpose:** Surface the warmest accounts to contact right now, ranked by a multi-factor composite score.

**Frontend:** `SignalQueue.tsx`

**Key capabilities:**
- Composite score: `(icp_score × 0.45) + (signal_score × 0.35) + (quality_score × 0.20)`
- Signal blending: top 3 signals per domain blended with weights `[1.0, 0.65, 0.4]`
- Recency decay: `signal_score = strength × e^(-age_days/14)` — signals lose half their power every 14 days
- Quality discount: companies below 35% quality_score have their composite score reduced
- **Priority bands:**
  - `act_now` — Composite ≥ 0.65 ("Route into execution now")
  - `work_soon` — Composite ≥ 0.40 ("Add to current sequence")
  - `review_first` — Below threshold ("Enrich further or wait")
- Signal types detected: `hiring_sdr`, `hiring_ae`, `hiring_vp_sales`, `hiring_engineering`, `hiring_ai_ml`, `job_posting`, `funding`, `news`, `web_update`, `not_hiring`
- **External signal discovery** (background job every 6h) — discovers new signals across enriched companies, queued for operator review (Add / Dismiss)
- Recommended action text generated per account

**Backend:** `api/signals.py` → 5 endpoints
**Services:** `services/signals/detector.py`, `services/signals/external_discovery.py`

**Connected to:**
- ICP Scoring (ICP score feeds composite)
- Lead Table (signals become action prompts)
- Playbook Engine (signal triggers auto-enrollment rules)
- AI Copilot (hot leads from signal queue surface in dashboard)

---

### 3.5 Lead Management

**Purpose:** Full lifecycle contact management with ICP context, cooldown automation, and meeting prep.

**Frontend:** `LeadTable.tsx`

**Key capabilities:**
- Searchable, filterable lead list (by status, enrichment, free text)
- Status progression: `Not Contacted → Contacted → Replied → Meeting Booked → Cool Down`
- Status badges colour-coded: Replied=purple, Contacted=cyan, Meeting Booked=emerald, Cool Down=blue
- **T1/T2/T3 ICP tier badge** shown per lead in Quality column (pulled from ICPScore on lead's domain)
- **ICP final score** shown in lead detail panel
- **Follow-up date**: settable per lead, displayed with amber highlight when overdue
- **Cool-down workflow:**
  - One-click "❄ Cool Down" button → calls `/leads/{id}/cooldown` (6-month cooldown)
  - "Lift Cool-Down" button clears cooldown, resets `contacts_without_reply`, sets status to `Not Contacted`
  - Cooldown auto-triggered after 3 unanswered contacts (via Activities log)
  - `cooldown_until` date displayed in the lead edit panel
- **Meeting Brief** (auto-generated when status → "Meeting Booked"):
  - 1-page AI prep document
  - Company overview, ICP tier + fit score, active signals, conversation history
  - Key talking points, likely objections, suggested questions
- Inline company profile panel with field-level provenance:
  - Confidence bar per field
  - Source label + source URL
  - Evidence classification (direct / indirect / inferred)
  - Manual field override with provenance tracking

**Backend:** `api/leads.py` → 12 endpoints
**Backend change:** `GET /leads/{id}` now joins `ICPScore` to return `icp_tier` and `icp_final_score`

**Connected to:**
- Enrichment Engine (company profile shown inline)
- ICP Scoring (tier badge, final score)
- Activities Log (auto-cooldown trigger)
- Playbook Engine (lead enrollment)
- Meeting Brief service

---

### 3.6 Plays & Messaging Studio

**Purpose:** Build component-based, persona-targeted outreach sequences with AI generation and tonal variations.

**Frontend:** `PlaysMessagingStudio.tsx`

**Key capabilities:**
- Component-based architecture — every email is composed from named components:
  `subject | greeting | opener | problem | value_prop | story | cta | closer | variables`
- Each component has multiple **tonal variations** (Assertive, Empathetic, Provocative, etc.)
- Per-component AI regeneration with specific instruction override
- **Email variant generation** — assembles full emails from selected component variations
- **Social Proof Library** — collapsible panel showing case studies, testimonials, and metrics
  - Filter by type: All / Case Study / Testimonial / Metric
  - AI uses selected assets during message generation
  - Empty state guidance to add assets in GTM Intelligence
- **Smartlead variant ID** — links email variants to Smartlead campaign A/B tests
- Global instruction field for play-wide tone guidance
- Mission (GTM context) + persona + ICP linkage per play

**Backend:** `api/plays_messaging.py` → 13 endpoints
**Services:** Groq/Gemini for component generation

**Connected to:**
- GTM Intelligence (missions and personas feed play generation)
- Assets (social proof assets surfaced in studio)
- Outcomes Dashboard (email variant performance via Smartlead sync)
- Playbook Engine (generated emails used as step content)

---

### 3.7 Playbook Engine

**Purpose:** Structured multi-step plays with enrollment tracking, auto-enrollment, and pre-built templates.

**Frontend:** `PlaybookManager.tsx`

**Key capabilities:**
- **Playbooks** → **Plays** → **Steps** (3-level hierarchy)
- Step types: `email` / `wait` / `task` / `condition`
- Step config is JSON — each type has its own schema
- `trigger_rules` per play: `{ fit_categories, min_score, signal_types, min_signals }`
- **Auto-enrollment:** matches leads/domains to plays by trigger rules
- **Enrollment tracking:**
  - `current_step` (1, 2, 3, ...)
  - `status`: active / paused / completed / exited
  - `step_history`: full audit trail with timestamp, action, outcome, notes
  - Actions: enrolled / advanced / paused / resumed / completed / exited
- **Template library** (3 pre-built templates):
  1. `inbound-high-intent` — Fast-follow play for warm inbound
  2. `outbound-signal-driven` — Hiring/funding signal-triggered outreach
  3. `product-led-expansion` — Expansion plays for existing customers
- Manual enrollment by lead ID list or domain list

**Backend:** `api/playbooks.py` → 19 endpoints

**Connected to:**
- Signal Queue (signal types feed trigger_rules)
- Lead Table (leads enrolled → status changes tracked)
- Messaging Studio (email step content from generated variants)
- Outcomes Dashboard (enrollment + conversion tracked)

---

### 3.8 Replies Inbox

**Purpose:** Classify, filter, and act on incoming replies across all channels.

**Frontend:** `RepliesInbox.tsx`

**Key capabilities:**
- AI classification on creation (background task): `interested` / `objection` / `neutral` / `ooo`
- Sentiment: `positive` / `negative` / `neutral`
- **Tier filter** — filter inbox by T1 / T2 / T3 lead tier
- Channel filter (email / LinkedIn / call)
- Classification filter
- **Mark Meeting Booked** directly from inbox (updates lead status + triggers meeting brief)
- **"Brief" button** — opens inline meeting brief panel in the drawer:
  - ICP fit bar, tier badge, company overview, active signals, key talking points
- **Insights panel** — AI extracts top 5 objections with frequency from all objection replies
- CSV bulk import (for Smartlead export files)
- Reply source tracking: `smartlead` / `manual_csv` / `manual_entry`

**Backend:** `api/replies.py` → 6 endpoints
**Services:** `services/intelligence/reply_classifier.py`

**Connected to:**
- Lead Table (reply → lead status update)
- Outcomes Dashboard (reply counts feed conversion rates)
- AI Copilot (reply data feeds pipeline snapshot)
- Meeting Brief (brief generation triggered from inbox)

---

### 3.9 Outcomes Dashboard

**Purpose:** Multi-channel performance analytics with tier, play, and persona breakdowns.

**Frontend:** `OutcomesDashboard.tsx`

**Tabs:**

| Tab | What It Shows |
|-----|--------------|
| Summary | Total leads, contacted, replied, meetings booked, funnel bar visualization |
| Email | Smartlead A/B campaign comparison, reply rate, open rate, meetings booked |
| LinkedIn | CSV-uploaded LinkedIn outreach stats |
| Calls | CSV-uploaded call activity stats |
| Tiers | T1/T2/T3 performance grid (reply rate, conversion rate, total contacted) |
| By Play | Reply rate and conversion per play, sorted, "Best" badge on winner |
| By Persona | Engagement score per persona with progress bar visualization |

**Key capabilities:**
- **Smartlead sync** — pulls campaigns, stats, and message threads from Smartlead API, creates Reply records automatically
- **Meeting Brief viewer** — click any meeting-booked lead to view full AI-generated prep brief
- **A/B comparison** — side-by-side email campaign stats with winner highlighted
- CSV upload for LinkedIn and calls with downloadable templates
- Last-synced timestamp shown per channel

**Backend:** `api/outcomes.py` → 10 endpoints
**Services:** `services/integrations/smartlead.py`

**Connected to:**
- Smartlead (campaign sync)
- Replies Inbox (reply data feeds rates)
- Lead Table (meeting-booked leads trigger brief)
- Signal Queue (plays performance feeds back to signal prioritization)

---

### 3.10 AI Copilot

**Purpose:** Natural language assistant with full pipeline awareness.

**Frontend:** `AICopilot.tsx`

**Two views:**

**Dashboard view (⚡ Pipeline Status):**
- **Pipeline Health card** — reply rate, conversion, meetings booked, contacted count + health assessment (green/amber/red)
- **Reply Activity card** — Interested count vs. needs-review count
- **Contact Today card** — Hot leads from signal queue with priority colour dots
- **Quick Insights** — 6 suggested queries as click-to-send buttons:
  - "Which T1 leads haven't been contacted yet?"
  - "What are the top objections this week?"
  - "Which play has the highest reply rate?"
  - "Which signals are driving the most meetings?"
  - "Who should I prioritize reaching out to today?"
  - "How are our T1 vs T2 accounts converting?"

**Chat view (💬 Ask Anything):**
- Natural language Q&A about the GTM system
- Context assembled from: missions, ICP scores, signals, leads, replies, Smartlead stats
- Groq prioritized (speed), Gemini as fallback

**Backend:** `api/copilot.py` → 1 endpoint
**Services:** Groq/Gemini via litellm

**Connected to:** All 8 modules (assembles context from all data sources)

---

### 3.11 Activities Log

**Purpose:** Track every outreach attempt for cooldown automation and reporting.

**Backend only** (no dedicated frontend; integrated into lead workflow)

**Key capabilities:**
- Log email / LinkedIn / call attempts per lead
- Increments `contacts_without_reply` counter per lead
- **Auto-cooldown trigger:** after 3 unanswered contacts, automatically sets lead to `Cool Down` (cooldown_until = now + 180 days)
- Filter by `lead_id`, `domain`, `channel`

**Backend:** `api/activities.py` → 4 endpoints

**Connected to:**
- Lead Management (cooldown state)
- Playbook Engine (step completion tracking)

---

### 3.12 Social Proof Assets

**Purpose:** Library of case studies, testimonials, and metrics used during AI message generation.

**Key capabilities:**
- Asset types: `case_study` / `testimonial` / `metric`
- Optional linkage to ICP or persona (targeted asset selection)
- `use_case_tags` for additional filtering
- Surfaced in Messaging Studio during play generation

**Backend:** `api/assets.py` → 5 CRUD endpoints

**Connected to:**
- Messaging Studio (assets used in generation context)
- GTM Intelligence (where assets are added)

---

## 4. Complete API Reference

### Base URL: `http://localhost:8000/api`

All endpoints require `X-Workspace-Id` header.

---

#### Leads

| Method | Path | Description |
|--------|------|-------------|
| GET | `/leads/` | List leads (pagination, search, status filter, enriched_only) |
| POST | `/leads/` | Create lead |
| GET | `/leads/{id}` | Get lead + company profile + **ICP tier** (joined from ICPScore) |
| PATCH | `/leads/{id}` | Update lead (status, follow_up_date, cooldown fields) |
| DELETE | `/leads/{id}` | Delete lead |
| POST | `/leads/{id}/cooldown` | Apply 6-month cooldown |
| DELETE | `/leads/{id}/cooldown` | Remove cooldown |
| POST | `/leads/{id}/meeting-brief` | Generate meeting prep brief |
| GET | `/leads/{id}/meeting-brief` | Get last generated brief |
| GET | `/leads/fields` | List custom fields |
| POST | `/leads/fields` | Create custom field |
| DELETE | `/leads/fields/{name}` | Delete custom field |

#### Enrichment

| Method | Path | Description |
|--------|------|-------------|
| POST | `/enrichment/batch` | Start batch enrichment job |
| GET | `/enrichment/status/{job_id}` | Poll job status |
| GET | `/enrichment/stream/{job_id}` | SSE real-time progress stream |
| POST | `/enrichment/import-csv` | Import CSV/XLSX (creates leads + enriches domains) |
| GET | `/enrichment/profiles` | List company profiles |
| GET | `/enrichment/profiles/{domain}` | Get full enrichment data for domain |
| PATCH | `/enrichment/profiles/{domain}` | Manual field override |

#### ICP

| Method | Path | Description |
|--------|------|-------------|
| POST | `/icp/generate` | 3-pass AI ICP generation (streaming) |
| POST | `/icp/generate-sync` | Synchronous ICP generation |
| GET | `/icp/` | List ICPs |
| GET | `/icp/{id}` | Get ICP with rubric |
| POST | `/icp/score` | Score companies against ICP (assigns T1/T2/T3) |
| DELETE | `/icp/{id}` | Delete ICP |

#### Signals

| Method | Path | Description |
|--------|------|-------------|
| GET | `/signals/queue` | Warm signal queue (ranked by composite score) |
| GET | `/signals/` | List all signals |
| GET | `/signals/external` | List external signals (background discovery) |
| PATCH | `/signals/external/{id}` | Update external signal status |
| GET | `/signals/external/download` | Download external signals CSV |

#### Playbooks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/playbooks/` | List playbooks |
| POST | `/playbooks/` | Create playbook |
| GET | `/playbooks/{id}` | Get playbook with plays + steps + enrollments |
| PATCH | `/playbooks/{id}` | Update playbook |
| DELETE | `/playbooks/{id}` | Delete playbook (cascades) |
| POST | `/playbooks/{id}/plays` | Create play |
| PATCH | `/playbooks/plays/{id}` | Update play |
| DELETE | `/playbooks/plays/{id}` | Delete play |
| POST | `/playbooks/plays/{id}/steps` | Create step |
| PATCH | `/playbooks/steps/{id}` | Update step |
| DELETE | `/playbooks/steps/{id}` | Delete step |
| POST | `/playbooks/plays/{id}/enroll` | Enroll leads/domains |
| GET | `/playbooks/plays/{id}/enrollments` | List enrollments |
| PATCH | `/playbooks/enrollments/{id}` | Update enrollment (advance/pause/complete/exit) |
| POST | `/playbooks/{id}/auto-enroll` | Auto-enroll by trigger rules |
| GET | `/playbooks/templates/library` | Get template library (3 templates) |
| POST | `/playbooks/templates/{id}/apply` | Apply template to playbook |

#### GTM Intelligence

| Method | Path | Description |
|--------|------|-------------|
| GET | `/gtm/` | List GTM contexts |
| POST | `/gtm/` | Create context |
| GET | `/gtm/{id}` | Get full context |
| PATCH | `/gtm/{id}` | Update context |
| DELETE | `/gtm/{id}` | Delete context |
| POST | `/gtm/{id}/personas` | Create persona |
| DELETE | `/gtm/personas/{id}` | Delete persona |
| POST | `/gtm/{id}/triggers` | Create buying trigger |
| DELETE | `/gtm/triggers/{id}` | Delete trigger |
| POST | `/gtm/{id}/signals` | Create signal definition |
| DELETE | `/gtm/signals/{id}` | Delete signal def |
| POST | `/gtm/{id}/plays` | Create strategic play |
| PATCH | `/gtm/plays/{id}` | Update play |
| DELETE | `/gtm/plays/{id}` | Delete play |
| POST | `/gtm/{id}/generate` | AI strategy generation |
| POST | `/gtm/{id}/refine-from-enrichment` | Refine strategy from enriched data |
| POST | `/gtm/{id}/icp-suggestions` | Generate ICP options |
| POST | `/gtm/{id}/sourcing-guide` | Generate list sourcing guidance |
| POST | `/gtm/context/parse` | Parse uploaded file for GTM context |
| GET | `/gtm/{id}/icps` | List ICPs under context |
| POST | `/gtm/{id}/icps` | Create ICP under context |
| PATCH | `/gtm/{id}/icps/{icp_id}` | Update context ICP |
| DELETE | `/gtm/{id}/icps/{icp_id}` | Delete context ICP |

#### Replies

| Method | Path | Description |
|--------|------|-------------|
| POST | `/replies/` | Create reply (auto-classify in background) |
| GET | `/replies/` | List replies (channel, classification, lead_id filters) |
| GET | `/replies/{id}` | Get reply |
| DELETE | `/replies/{id}` | Delete reply |
| GET | `/replies/insights/summary` | Top objections + sentiment split |
| POST | `/replies/upload-csv` | Bulk CSV import |

#### Outcomes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/outcomes/summary` | Top-level funnel metrics |
| GET | `/outcomes/by-channel` | Performance by channel |
| GET | `/outcomes/by-tier` | Performance by T1/T2/T3 |
| GET | `/outcomes/by-play` | Performance by play |
| GET | `/outcomes/by-persona` | Performance by persona |
| POST | `/outcomes/smartlead/sync` | Sync Smartlead campaigns + replies |
| GET | `/outcomes/smartlead/stats` | Get Smartlead campaign stats |
| POST | `/outcomes/upload/linkedin` | Upload LinkedIn activity CSV |
| POST | `/outcomes/upload/calls` | Upload calls activity CSV |
| GET | `/outcomes/templates/linkedin` | Download LinkedIn import template |
| GET | `/outcomes/templates/calls` | Download calls import template |

#### Messaging Studio

| Method | Path | Description |
|--------|------|-------------|
| GET | `/plays-messaging/` | List messaging plays |
| POST | `/plays-messaging/` | Create play |
| GET | `/plays-messaging/{id}` | Get play with components + variants |
| PATCH | `/plays-messaging/{id}` | Update play |
| DELETE | `/plays-messaging/{id}` | Delete play |
| POST | `/plays-messaging/{id}/generate-messaging` | AI generate message components |
| POST | `/plays-messaging/{id}/regenerate` | Regenerate with new instruction |
| POST | `/plays-messaging/{id}/generate-emails` | Generate email variants |
| PATCH | `/plays-messaging/variations/{id}` | Update variation |
| POST | `/plays-messaging/variations` | Add variation |
| DELETE | `/plays-messaging/variations/{id}` | Delete variation |
| GET | `/plays-messaging/{id}/email-variants` | List email variants |

#### Activities

| Method | Path | Description |
|--------|------|-------------|
| POST | `/activities/` | Log outreach activity |
| GET | `/activities/` | List activities |
| GET | `/activities/{id}` | Get activity |
| DELETE | `/activities/{id}` | Delete activity |

#### Assets

| Method | Path | Description |
|--------|------|-------------|
| GET | `/assets/` | List assets |
| POST | `/assets/` | Create asset |
| GET | `/assets/{id}` | Get asset |
| PATCH | `/assets/{id}` | Update asset |
| DELETE | `/assets/{id}` | Delete asset |

#### Copilot

| Method | Path | Description |
|--------|------|-------------|
| POST | `/copilot/query` | Natural language query about pipeline |

#### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server status + LLM provider availability |

---

## 5. Data Models

### Lead
```python
Lead:
  id:                   UUID (PK)
  workspace_id:         UUID (FK → Workspace)
  email:                str
  first_name:           str | null
  last_name:            str | null
  domain:               str | null
  status:               "Not Contacted" | "Contacted" | "Replied" |
                        "Meeting Booked" | "Cool Down"
  score:                float (0-1, enrichment quality proxy)
  enrichment_status:    "pending" | "enriching" | "enriched" | "failed"
  custom_data:          JSON (notes + any custom fields)
  follow_up_date:       datetime | null
  cooldown_until:       datetime | null
  contacts_without_reply: int (default 0, resets on reply/cooldown lift)
  created_at, updated_at
```

### CompanyProfile
```python
CompanyProfile:
  id:             UUID (PK)
  workspace_id:   UUID (FK)
  domain:         str (unique per workspace)
  name:           str | null
  enriched_data:  JSON → { field_name: DataPoint }
  quality_score:  float (0-1)
  quality_tier:   "gold" | "silver" | "bronze" | "unknown"
  sources_used:   list[str]
  enriched_at:    datetime | null
  cache_expires_at: datetime | null
  fetch_metadata: JSON

DataPoint (embedded in enriched_data):
  value:      any (str | int | list | null)
  confidence: float (0-1)
  source:     str ("commoncrawl_httpx" | "httpx_direct" | "manual_override" | "llm_extract" | ...)
  source_url: str | null
  evidence:   str | null
```

### ICPScore
```python
ICPScore:
  id:              UUID (PK)
  icp_id:          UUID (FK → ICPDefinition)
  workspace_id:    UUID
  domain:          str
  final_score:     float | null (0-100)
  score_low:       float | null (confidence interval lower)
  score_high:      float | null (confidence interval upper)
  fit_category:    "high" | "medium" | "low" | "insufficient"
  tier:            "T1" | "T2" | "T3" | null
  criterion_scores: JSON → { criterion_name: score_0_to_100 }
  missing_fields:  list[str]
```

### Signal
```python
Signal:
  id:           UUID (PK)
  workspace_id: UUID
  domain:       str
  signal_type:  "hiring_sdr" | "hiring_ae" | "hiring_vp_sales" |
                "hiring_engineering" | "hiring_ai_ml" | "job_posting" |
                "funding" | "news" | "web_update" | "not_hiring"
  strength:     float (0-1)
  source_url:   str | null
  evidence:     str | null
  detected_at:  datetime
```

### PlayEnrollment
```python
PlayEnrollment:
  id:           UUID (PK)
  play_id:      UUID (FK → Play)
  workspace_id: UUID
  lead_id:      UUID | null (FK → Lead)
  domain:       str | null
  current_step: int
  status:       "active" | "paused" | "completed" | "exited"
  step_history: JSON → [
    { timestamp, action, status, step, outcome, notes }
  ]
  enrolled_at:  datetime
  last_step_at: datetime | null
```

### MeetingBrief
```python
MeetingBrief:
  id:           UUID (PK)
  lead_id:      UUID (FK → Lead)
  workspace_id: UUID
  content_json: {
    company_overview:     str
    icp_fit_score:        float (0-100)
    icp_fit_reason:       str
    icp_tier:             "T1" | "T2" | "T3" | null
    active_signals:       list[str]
    conversation_history: str
    key_talking_points:   list[str]
    likely_objections:    list[str]
    suggested_questions:  list[str]
  }
  generated_at: datetime
```

### MessagingPlay
```python
MessagingPlay → PlayComponent → PlayVariation

MessagingPlay:
  mission_id, persona_id, icp_id (optional FKs)
  name, global_instruction, status

PlayComponent:
  component_type: "subject" | "greeting" | "opener" | "problem" |
                  "value_prop" | "story" | "cta" | "closer" | "variables"
  display_order:  int
  variations:     list[PlayVariation]

PlayVariation:
  content:      str
  tone:         str | null
  is_selected:  bool

EmailVariant:
  subject, body, style_label, smartlead_variant_id
```

---

## 6. Intelligence Services

### Enrichment Pipeline (`services/enrichment/`)

```
Domain Input
    │
    ├─► CommonCrawl Index (CC-MAIN-2025-08)
    │       └─► HTML pages with confidence
    ├─► Live httpx fetch (fallback or parallel)
    │       └─► DNS MX record extraction
    │
    ├─► Extractors (from HTML pages)
    │       ├─ JSON-LD structured data
    │       ├─ Meta tags (description, keywords, OG)
    │       ├─ Schema.org microdata
    │       ├─ Contact extraction (mailto:, tel:)
    │       ├─ Social links (LinkedIn, Twitter, etc.)
    │       └─ Tech stack hints
    │
    ├─► Cross-Validator
    │       ├─ Multi-source consensus
    │       ├─ Confidence weighting
    │       ├─ Duplicate deduplication
    │       └─ quality_score + quality_tier assignment
    │
    └─► LLM Fallback (Groq/Gemini)
            └─ Fill critical missing fields from page text
                Critical fields: industry, business_model,
                employee_count, pricing_model, company_description
```

### ICP Scoring Formula

```python
# Per-criterion match (returns 0-100)
def match_criterion(profile_value, criterion) -> float:
    # match_type: contains | range | exact | regex
    # weighted by criterion.weight

# ICP fit (0-1)
icp_fit = weighted_average(criterion_scores) / 100

# Signal blending (top 3 signals)
signal_strengths = [s.strength * exp(-s.age_days/14) for s in top_3_signals]
signal_score = sum(s * w for s, w in zip(signal_strengths, [1.0, 0.65, 0.4]))
signal_score = min(signal_score / sum([1.0, 0.65, 0.4]), 1.0)  # normalize

# Intent vs timing split
intent = signal_score          # strength of signals
timing = recency_decay(signals)  # how fresh they are

# Final composite
final_score = icp_fit * (0.7 * intent + 0.3 * timing) * 100
```

### Tier Assignment (relative ranking)

```python
def assign_tiers(scores: list[ICPScore]) -> list[ICPScore]:
    sorted_scores = sorted(scores, key=lambda s: s.final_score or 0, reverse=True)
    n = len(sorted_scores)
    t1_cutoff = int(n * 0.20)  # top 20%
    t2_cutoff = int(n * 0.50)  # next 30%

    for i, score in enumerate(sorted_scores):
        if i < t1_cutoff:
            score.tier = "T1"
        elif i < t2_cutoff:
            score.tier = "T2"
        else:
            score.tier = "T3"
    return sorted_scores
```

### Reply Classifier

```python
# AI classification (Groq/Gemini, async background task)
{
  "classification": "interested" | "objection" | "neutral" | "ooo",
  "sentiment": "positive" | "negative" | "neutral"
}

# Top objection extraction
extract_top_objections(objection_texts) → [
  { "text": "...", "frequency": 3 }
]
```

---

## 7. Integrations

### Smartlead

- **Config:** `SMARTLEAD_API_KEY`, `SMARTLEAD_BASE_URL`
- **Sync endpoint:** `POST /outcomes/smartlead/sync`
- **What syncs:**
  - Campaign list + stats (emails_sent, opens, replies, meetings_booked)
  - Lead message history → creates `Reply` records per conversation thread
- **Stats stored:** SmartleadStats table (per campaign, timestamped)
- **A/B support:** `smartlead_variant_id` links email variants to Smartlead A/B campaigns

### Groq + Gemini (LLMs)

- **Library:** litellm (provider abstraction)
- **Structured output:** instructor (forces schema compliance)
- **Used for:** ICP generation, enrichment fallback, reply classification, meeting brief, GTM strategy generation, copilot queries
- **Fallback order:** Groq first (faster/cheaper) → Gemini if Groq fails or unavailable
- **Config:** `GROQ_API_KEY`, `GEMINI_API_KEY`

### CommonCrawl

- **Index:** `CC-MAIN-2025-08` (configurable via `COMMONCRAWL_INDEX`)
- **Usage:** Primary enrichment source — avoids direct website fetching for common domains
- **Fallback:** Live httpx fetch if domain not in CommonCrawl

---

## 8. Data Flow

### Full Account Journey

```
1. CSV Upload (email, name, domain)
         │
         ▼
2. Leads Created (status=Not Contacted)
         │
         ▼
3. Batch Enrichment (CommonCrawl + live fetch + extractors + LLM)
         │
         ├─► CompanyProfile (enriched_data, quality_score, quality_tier)
         └─► Signals detected (hiring, funding, web_update, etc.)
         │
         ▼
4. ICP Scoring (against ICPDefinition rubric)
         │
         ├─► ICPScore (final_score, fit_category, criterion_scores)
         └─► Tier assignment (T1 top 20%, T2 next 30%, T3 50%)
         │
         ▼
5. Signal Queue (composite_score ranking)
         │
         composite = (icp_score × 0.45) + (signal_score × 0.35) + (quality × 0.20)
         priority_band = act_now | work_soon | review_first
         │
         ▼
6. Lead Table (act on prioritized leads)
         │
         ├─ T1/T2/T3 badge + ICP score visible
         ├─ Follow-up date setting
         └─ Cool Down workflow (3 no-reply → auto-cooldown)
         │
         ▼
7. Messaging Studio (generate outreach)
         │
         ├─ Mission + Persona context
         ├─ Social Proof Library (case studies, testimonials)
         └─ Component-based email generation + variants
         │
         ▼
8. Playbook (enroll + execute)
         │
         ├─ Steps: email → wait → task → condition
         ├─ Step history audit trail
         └─ Auto-enrollment by trigger_rules
         │
         ▼
9. Activities Logged (per-contact attempt)
         │
         └─ contacts_without_reply → 3 → auto-cooldown
         │
         ▼
10. Replies Inbox
         │
         ├─ AI classification (interested/objection/neutral/OOO)
         ├─ Tier filter (T1/T2/T3)
         └─ Mark Meeting Booked → Meeting Brief generated
         │
         ▼
11. Outcomes Dashboard
         │
         ├─ Smartlead sync (email stats)
         ├─ LinkedIn + calls CSV upload
         └─ By-tier, by-play, by-persona breakdowns
```

---

## 9. Implementation Status

### Production-Ready

| Feature | Notes |
|---------|-------|
| Enrichment Pipeline | Multi-source, cross-validated, LLM fallback, provenance tracking |
| ICP Generation | 3-pass Constitutional AI with structured rubric output |
| ICP Scoring | Spec-aligned formula with tier assignment |
| Signal Detection | Hiring, funding, news signals with strength scoring |
| Signal Queue | Recency decay, multi-factor blending, priority banding |
| Lead CRUD + Cooldown | Full lifecycle including cooldown automation |
| Meeting Brief | Context-aware AI prep document |
| Playbook Engine | CRUD, enrollment, auto-enroll, templates, step history |
| GTM Intelligence | Strategy generation, persona builder, enrichment refinement |
| Outcomes Analytics | Multi-channel aggregation with tier/play/persona breakdown |
| Smartlead Integration | Campaign sync, stats, reply import |
| Reply Classification | AI sentiment + objection extraction |

### Advanced (Feature-Rich)

| Feature | Notes |
|---------|-------|
| Messaging Studio | Component-based, social proof library, email variants |
| Playbook Templates | 3 pre-built templates with realistic play configurations |
| External Signal Discovery | Background job, pattern matching, review workflow |
| Activities + Auto-Cooldown | Per-contact logging, auto-trigger at 3 unanswered |
| AI Copilot | Dual-view dashboard + chat, GTM-specific suggested queries |
| Replies Inbox | Tier/channel filters, inline meeting brief panel |

### Functional (Working, Some Limitations)

| Feature | Notes |
|---------|-------|
| Assets (Social Proof) | CRUD complete; no rich discovery/tagging features |
| Campaigns | Basic CRUD; no execution or A/B logic |

### Planned / Skeleton

| Feature | Notes |
|---------|-------|
| Lists + Segments | Basic CRUD; no filtering or export logic |
| Messaging Sets | Schema exists; no execution |
| Workspace RBAC | Multi-workspace schema; no permission enforcement |
| Test Suite | No visible automated tests |

---

## 10. Setup & Configuration

### Prerequisites

- Python 3.11+
- Node.js 20+
- Groq API key (or Gemini)

### Backend Setup

```bash
cd backend
pip install -r requirements.txt

# Copy and configure environment
cp .env.example .env
# Set GROQ_API_KEY (minimum required)

# Start development server
uvicorn main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install

# Start development server
npm run dev
# Runs on http://localhost:3000
```

### Docker

```bash
docker-compose up --build
```

---

## 11. Environment Variables

```bash
# LLM Providers (at least one required)
GROQ_API_KEY=gsk_...
GEMINI_API_KEY=AIza...

# Database (SQLite by default)
DATABASE_URL=sqlite:///./connectaflow.db

# CORS (for frontend)
CORS_ORIGINS=http://localhost:3000

# Enrichment
ENRICHMENT_CONCURRENCY=30          # Max concurrent enrichment jobs
ENRICHMENT_CACHE_TTL_DAYS=30       # Profile cache lifetime in days
COMMONCRAWL_INDEX=CC-MAIN-2025-08  # CommonCrawl archive index

# LLM
LLM_MAX_RETRIES=3                  # Max retries for LLM calls

# Smartlead Integration (optional)
SMARTLEAD_API_KEY=...
SMARTLEAD_BASE_URL=https://server.smartlead.ai/api/v1

# Background Jobs
EXTERNAL_SIGNAL_DISCOVERY_INTERVAL_HOURS=6
```

---

## 12. Development Guide

### Key Conventions

**Axios pattern (frontend):** All API calls return `AxiosResponse<T>`. Always destructure `.data`:
```typescript
const { data } = await getLeads({ status: 'Not Contacted' });
setLeads(data.leads || []);
```

**Error handling:** Always use `getErrorMessage(err, 'fallback message')` — requires exactly 2 arguments.

**Rates are fractions (0–1) in the backend:** Frontend multiplies by 100 for display. Don't store percentages.

**Workspace isolation:** Every SQLModel query filters by `workspace_id`. The `X-Workspace-Id` header drives this — default workspace ID is `00000000-0000-0000-0000-000000000001`.

**Lead status flow:** `Not Contacted → Contacted → Replied → Meeting Booked → Cool Down`
Status change to `Meeting Booked` auto-triggers Meeting Brief generation.
Status change to `Cool Down` auto-sets `cooldown_until = now + 180 days`.

**ICP scores are fractions internally:** `scorer.py` returns `final_score` as 0–100. Do not multiply again.

**Signal recency decay:** Half-life is 14 days. Signals older than ~6 weeks have near-zero contribution.

### Adding a New Feature

1. Add model to `backend/models.py`
2. Create API file in `backend/api/new_feature.py`
3. Register router in `backend/main.py`: `app.include_router(router, prefix="/api")`
4. Add TypeScript interfaces + API functions to `frontend/src/services/api.ts`
5. Create React component in `frontend/src/components/`
6. Verify: `cd backend && python -c "import main; print('OK')"`
7. Verify: `cd frontend && npx tsc --noEmit`

---

## 13. Changelog

### V3 — GTM Platform Completion (Current)

**Backend additions:**
- `api/activities.py` — Activities logging with auto-cooldown trigger (3 unanswered → 6-month cooldown)
- `api/assets.py` — Social proof asset CRUD (case_study / testimonial / metric)
- `api/copilot.py` — AI Copilot natural language query endpoint
- `api/outcomes.py` — Full outcomes analytics: by-channel, by-tier, by-play, by-persona, Smartlead sync
- `api/plays_messaging.py` — Messaging plays studio: component generation, variations, email variants
- `api/replies.py` — Replies inbox: CRUD, AI classification background task, insights extraction
- `services/integrations/smartlead.py` — Smartlead API async wrapper
- `services/intelligence/meeting_brief.py` — Meeting prep brief generator
- `services/intelligence/reply_classifier.py` — AI reply classification (interested/objection/neutral/OOO)
- `services/intelligence/plays_generator.py` — Play sequence generation service
- `services/signals/external_discovery.py` — Background signal discovery job (every 6h)

**Backend changes:**
- `models.py` — Added `cooldown_until`, `contacts_without_reply`, `follow_up_date` to Lead; `tier` to ICPScore
- `leads.py` — Added `POST /cooldown` + `DELETE /cooldown` endpoints; `GET /{id}` now returns `icp_tier` + `icp_final_score` via ICPScore join; auto-cooldown on status → "Cool Down"; auto-clear on cooldown lift
- `outcomes.py` — Fixed `by_tier()` response shape: `{tiers: [...]}` with fractional rates; fixed `get_smartlead_stats()` to return `{stats: [...], total: N}` with `id` field
- `icp.py` — `score_batch` now includes `tier` in response items
- `scorer.py` — `assign_tiers()` stable (T1=top 20%, T2=next 30%, T3=50%)
- `main.py` — All new routers registered

**Frontend additions:**
- `OutcomesDashboard.tsx` — Complete rewrite: 7 tabs (Summary/Email/LinkedIn/Calls/Tiers/By Play/By Persona), A/B campaign comparison, funnel visualization, Meeting Brief modal viewer
- `AICopilot.tsx` — Complete rewrite: dual-view (Pipeline Status dashboard + Ask Anything chat), hot leads from signal queue, pipeline health assessment, 6 suggested GTM queries
- `RepliesInbox.tsx` — Added tier filter (All/T1/T2/T3), Meeting Brief inline panel in drawer, "Brief" button alongside "Mark Meeting Booked"
- `SignalQueue.tsx` — External signal "Add to System" action (previously dismiss-only)
- `PlaysMessagingStudio.tsx` — Social Proof Library panel (collapsible, filterable by type)

**Frontend changes:**
- `LeadTable.tsx` — T1/T2/T3 tier badge in Quality column; colour-coded status badges; follow-up date with amber "Due" highlight; "❄ Cool Down" button + "Lift Cool-Down" button; ICP tier + score in company profile panel; Follow-up Date date input in lead form
- `EnrichmentDashboard.tsx` — T1/T2/T3 badge alongside ICP fit score in profile list; ICP Criterion Score Breakdown panel in expanded view (per-criterion progress bars + missing fields)
- `services/api.ts` — Added `icp_tier`, `icp_final_score`, `follow_up_date`, `cooldown_until`, `contacts_without_reply` to Lead interface; `tier` to ICPScoreResult; `applyCooldown()` and `removeCooldown()` functions

### V2 — GTM Intelligence & Enrichment Pipeline

- 3-pass Constitutional AI ICP generation
- Multi-source enrichment pipeline (CommonCrawl + live fetch + LLM fallback)
- ICP scoring formula with tier assignment
- Signal queue with recency decay + composite scoring
- Playbook engine with enrollment tracking + templates
- GTM Intelligence module (personas, triggers, plays, strategy generation)
- UI overhaul — dark theme operator workspace

### V1 — Initial Platform

- Basic lead management
- Company analysis module
- Simple enrichment workflow

---

## License

Private. All rights reserved — Connectaflow / ISHAAN10082.
