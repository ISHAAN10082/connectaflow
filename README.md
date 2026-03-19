# Connectaflow

Connectaflow is an AI-assisted GTM intelligence workspace. It combines strategy setup, account enrichment, signal detection, play execution, lead record management, and workspace-level navigation in one product shell.

The current app is split into:

- `connectaflow/backend`: FastAPI + SQLModel backend, enrichment pipeline, signal scoring, playbook APIs, workspace-aware persistence
- `connectaflow/frontend`: Next.js operator interface
- `assets`: local sample spreadsheets and test files
- `docs`: supporting documentation

## What The Product Does

At a high level, Connectaflow is trying to support this operator loop:

1. Define the GTM thesis and ICP.
2. Import or discover target accounts.
3. Enrich those accounts from public web evidence.
4. Detect urgency / buying signals.
5. Route the best accounts into plays.
6. Maintain editable account and contact records.
7. Review pipeline health and outcomes.

## Architecture

- `Frontend`: Next.js 16 + React 19
- `Backend`: FastAPI
- `Persistence`: SQLModel with SQLite by default
- `AI providers`: Groq or Gemini for GTM generation / parsing flows
- `Public-web enrichment`: HTTP fetches, metadata extraction, structured page parsing, Common Crawl fallback, rules-based extraction

## Clone And Run Locally

### Prerequisites

- `git`
- `Python 3.11+` recommended
- `Node.js 20+` recommended
- `npm`

### 1. Clone The Repository

```bash
git clone https://github.com/ISHAAN10082/connectaflow.git
cd connectaflow
```

### 2. Configure The Backend Environment

Copy the example env file:

```bash
cp connectaflow/backend/.env.example connectaflow/backend/.env
```

Minimum variables:

- `GROQ_API_KEY` or `GEMINI_API_KEY`
  - At least one is strongly recommended for the AI-driven GTM flows.
  - The backend can boot without them, but strategy generation, context parsing, and refinement flows will be limited or fail.
- `DATABASE_URL`
  - Optional. Defaults to local SQLite.

Free key sources:

- `GEMINI_API_KEY`: [Google AI Studio](https://aistudio.google.com/app/apikey)
- `GROQ_API_KEY`: [Groq Console](https://console.groq.com/keys)

### 3. Start The Backend

```bash
cd connectaflow/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

Backend URLs:

- API root: `http://127.0.0.1:8000`
- Health check: `http://127.0.0.1:8000/api/health`

Notes:

- The app auto-creates tables on startup.
- The default SQLite database lives wherever you start the backend from. With the command above, that will be `connectaflow/backend/connectaflow.db`.
- A default workspace is also created automatically.

### 4. Configure The Frontend

In a second terminal:

```bash
cd connectaflow/frontend
cp .env.local.example .env.local
npm install
```

If you are running the backend on the default local URL, the default frontend env file is already correct.

### 5. Start The Frontend

```bash
cd connectaflow/frontend
npm run dev
```

Frontend URL:

- App: `http://127.0.0.1:3000`

### 6. Verify The App Is Healthy

Backend health check:

```bash
curl http://127.0.0.1:8000/api/health
```

Expected shape:

```json
{
  "status": "ok",
  "version": "2.0.0",
  "providers": {
    "groq": true,
    "gemini": false
  }
}
```

Interactive backend docs:

- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`

## Run With Docker

If you prefer containers:

1. Create `connectaflow/backend/.env` from the example file.
2. Set at least one AI provider key.
3. Run:

```bash
docker compose up --build
```

The compose file starts:

- backend on `http://localhost:8000`
- frontend on `http://localhost:3000`

## Required And Optional Environment Variables

### Backend: `connectaflow/backend/.env`

| Variable | Required | Purpose |
| --- | --- | --- |
| `GROQ_API_KEY` | One of `GROQ_API_KEY` or `GEMINI_API_KEY` is recommended | Enables LLM-backed GTM generation / parsing |
| `GEMINI_API_KEY` | One of `GROQ_API_KEY` or `GEMINI_API_KEY` is recommended | Enables LLM-backed GTM generation / parsing |
| `DATABASE_URL` | No | Database connection string. Defaults to SQLite |
| `CORS_ORIGINS` | No | Allowed frontend origins |
| `ENRICHMENT_CONCURRENCY` | No | Parallelism for enrichment jobs |
| `ENRICHMENT_CACHE_TTL_DAYS` | No | Cache retention for enrichment results |
| `LLM_MAX_RETRIES` | No | Retry budget for LLM-backed extraction/generation |
| `COMMONCRAWL_INDEX` | No | Common Crawl index to query |

### Frontend: `connectaflow/frontend/.env.local`

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | No | Backend API base URL. Defaults to `http://localhost:8000/api` |

## Core Features And Where They Live

### 1. Mission Setup / GTM Intelligence

What it does:

- Create and edit GTM contexts
- Generate GTM strategy
- Manage personas, triggers, signals, and plays
- Refine strategy from enriched accounts
- Parse uploaded source documents into context notes

Where it is:

- Frontend: `connectaflow/frontend/src/components/GTMIntelligence.tsx`
- Extracted GTM detail sections: `connectaflow/frontend/src/components/gtm/GTMContextSections.tsx`
- Backend: `connectaflow/backend/api/gtm.py`
- ICP scoring/generation: `connectaflow/backend/api/icp.py`

### 2. Accounts / Enrichment

What it does:

- Batch enrich domains
- Import CSV / XLSX lead files
- Infer domains from business emails
- Persist account profiles with field-level provenance
- Show confidence, source, and evidence per field
- Support manual field overrides

Where it is:

- Frontend: `connectaflow/frontend/src/components/EnrichmentDashboard.tsx`
- Backend API: `connectaflow/backend/api/enrichment.py`
- Extraction services: `connectaflow/backend/services/enrichment/`

### 3. Queue / Signals

What it does:

- Rank accounts by composite priority
- Group queue items into urgency bands
- Surface the evidence behind signals
- Send you from a queue item into the records view

Where it is:

- Frontend: `connectaflow/frontend/src/components/SignalQueue.tsx`
- Backend: `connectaflow/backend/api/signals.py`
- Detection logic: `connectaflow/backend/services/signals/detector.py`

### 4. Plays / Playbooks

What it does:

- Create playbooks
- Apply playbook templates
- Create plays and steps
- Auto-enroll leads
- Advance, pause, resume, complete, or exit enrollments

Where it is:

- Frontend: `connectaflow/frontend/src/components/PlaybookManager.tsx`
- Backend: `connectaflow/backend/api/playbooks.py`

### 5. Records / Leads

What it does:

- Search and filter leads
- Edit contact-level fields
- Edit company-level enrichment overrides
- Inspect field provenance and source URLs

Where it is:

- Frontend: `connectaflow/frontend/src/components/LeadTable.tsx`
- Backend: `connectaflow/backend/api/leads.py`

### 6. Outcomes / Command Center

What it does:

- Surface top-level platform health
- Show enrichment, signals, and provider status
- Provide a summary dashboard for the current workspace

Where it is:

- Frontend: `connectaflow/frontend/src/components/KPIDashboard.tsx`
- Backend health endpoint: `connectaflow/backend/main.py`

### 7. Operator Shell / Navigation

What it does:

- Provides the main sidebar
- Handles workspace switching
- Frames the app as a mission flow
- Seeds the demo workflow
- Connects modules through a shared shell

Where it is:

- Frontend shell: `connectaflow/frontend/src/components/ControlPanel.tsx`
- API client: `connectaflow/frontend/src/services/api.ts`
- Workspace endpoints: `connectaflow/backend/api/workspaces.py`

## How To Traverse The Site

The primary UI flow is:

1. `Mission Setup`
   - Create a GTM context or use `Seed Demo Workflow`.
   - Generate strategy so the workspace has personas, triggers, and plays.
2. `Accounts`
   - Paste domains or upload a CSV/XLSX file.
   - Wait for enrichment to finish.
   - Inspect profile quality, evidence, and provenance.
3. `Queue`
   - Review ranked signal candidates.
   - Use the action handoffs to move into records or play execution.
4. `Plays`
   - Review playbooks.
   - Auto-enroll leads or advance existing enrollments.
5. `Records`
   - Search accounts / leads.
   - Inspect and edit contact/company data.
6. `Outcomes`
   - Review workspace health and system summaries.

If you want a quick product walkthrough locally:

1. Open the app.
2. Choose the default workspace.
3. Click `Seed Demo Workflow`.
4. Go to `Accounts` and click `Load Demo Domains`, or upload a spreadsheet.
5. Wait for enrichment to finish.
6. Go to `Queue` to review ranked accounts.
7. Go to `Plays` to test auto-enrollment and execution.
8. Go to `Records` to inspect editable lead/company data.

## Backend APIs Present In The Repo

The backend currently exposes routes for:

- `gtm`
- `icp`
- `enrichment`
- `signals`
- `playbooks`
- `leads`
- `workspaces`
- `lists`
- `segments`
- `messaging`
- `campaigns`

The main operator UI currently focuses most heavily on:

- GTM intelligence
- enrichment
- signals
- playbooks
- leads
- analytics / health

Some backend modules such as `lists`, `segments`, `messaging`, and `campaigns` are present in the API surface but are not yet as central to the main navigation flow.

## Troubleshooting

### Backend boots but AI features do not work

Check:

```bash
curl http://127.0.0.1:8000/api/health
```

If both `groq` and `gemini` are `false`, your backend env file is missing or the keys are unset. The file must be at:

```text
connectaflow/backend/.env
```

### `ModuleNotFoundError` or missing Python packages

You are likely not using the project virtual environment. Recreate it and install dependencies:

```bash
cd connectaflow/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Frontend cannot reach the backend

Make sure the backend is running on `127.0.0.1:8000`, or set:

```text
connectaflow/frontend/.env.local
```

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

If you change the backend port, update `NEXT_PUBLIC_API_URL` to match.

### Port already in use

Use a different port or stop the existing process. Common local checks:

```bash
lsof -i :8000
lsof -i :3000
```

### Database seems broken in local SQLite mode

The database is created automatically from `DATABASE_URL`. In local SQLite mode, a corrupt local test DB can be removed and recreated if needed. Be careful: deleting it removes local data.

### Browser UI looks stale after frontend changes

Do a hard refresh once. The Next dev server can occasionally hold stale client state during rapid UI iteration.

## Useful Local Verification Commands

### Frontend

```bash
cd connectaflow/frontend
npx tsc --noEmit
npm run lint
```

### Backend

```bash
cd connectaflow
./.venv/bin/python -m py_compile connectaflow/backend/api/*.py connectaflow/backend/services/enrichment/*.py connectaflow/backend/services/signals/*.py connectaflow/backend/models.py
```

### Basic Health Check

```bash
curl http://127.0.0.1:8000/api/health
```

## Important Current Notes

- Connectaflow can boot without an AI provider key, but the AI-driven GTM generation flows are meant to run with either Groq or Gemini configured.
- The current default storage path is SQLite, which is fine for local development and demos.
- The workspace id is carried by the frontend in local storage and sent to the backend as `X-Workspace-Id`.
- The product shell is centered around six UI modules: mission setup, accounts, queue, plays, records, and outcomes.

## Project Structure Reference

```text
connectaflow/
├── README.md
├── docs/
│   └── github_guide.md
├── assets/
├── connectaflow/
│   ├── backend/
│   │   ├── .env.example
│   │   ├── api/
│   │   ├── services/
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── main.py
│   │   ├── models.py
│   │   └── requirements.txt
│   └── frontend/
│       ├── .env.local.example
│       ├── src/
│       │   ├── app/
│       │   ├── components/
│       │   ├── lib/
│       │   └── services/
│       └── package.json
└── docker-compose.yml
```

## Additional Doc

- Git usage notes: `docs/github_guide.md`
