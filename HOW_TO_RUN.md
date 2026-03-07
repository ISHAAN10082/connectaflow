# Connectaflow V2 — How to Run Guide

## Overview

Connectaflow is an AI-Powered GTM Intelligence Platform with two services:

| Service  | Technology | Default Port |
|----------|------------|--------------|
| Backend  | FastAPI (Python) | `8000` |
| Frontend | Next.js (TypeScript) | `3000` |

---

## Prerequisites

- Python 3.11+ (project uses 3.14)
- Node.js 18+ and npm
- A terminal in the project root: `connectaflow/` (the folder containing `.venv/`)

---

## Step 1 — API Keys

The backend requires at least one LLM provider key. Both can be set simultaneously.

### Where to store them

Create or edit the file at:

```
connectaflow/backend/.env
```

### What to put in it

```env
# Required: at least one of these two

# Google Gemini — get a free key at https://aistudio.google.com/app/apikey
GEMINI_API_KEY=your_gemini_api_key_here

# Groq — get a free key at https://console.groq.com/keys
GROQ_API_KEY=your_groq_api_key_here
```

### Optional settings (with defaults)

```env
# SQLite by default — no setup needed. For Postgres, provide a full URL.
DATABASE_URL=sqlite:///./connectaflow.db

# Comma-separated list of allowed frontend origins
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# How many enrichment requests run in parallel
ENRICHMENT_CONCURRENCY=30

# How long to cache enrichment results (days)
ENRICHMENT_CACHE_TTL_DAYS=30

# Max LLM retry attempts on failure
LLM_MAX_RETRIES=3
```

> **Note:** If neither `GEMINI_API_KEY` nor `GROQ_API_KEY` is set, the backend will start but log a warning and all AI-powered enrichment/analysis features will fail.

---

## Step 2 — Backend Setup

### 2a. Create the virtual environment (first time only)

```bash
# From the project root (the folder that contains connectaflow/ and .venv/)
python3 -m venv .venv
```

### 2b. Install backend dependencies (first time only)

```bash
.venv/bin/pip install -r connectaflow/backend/requirements.txt
```

### 2c. Start the backend

```bash
cd connectaflow/backend
/path/to/project/.venv/bin/uvicorn main:app --reload --port 8000
```

Or, if you activate the venv first:

```bash
source .venv/bin/activate          # from project root
cd connectaflow/backend
uvicorn main:app --reload --port 8000
```

### What a successful startup looks like

```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Started reloader process using StatReload
INFO:     Started server process
INFO:     Waiting for application startup.
INFO     | Starting Connectaflow V2...
INFO     | LLM providers: Groq, Gemini
INFO     | CORS origins: ['http://localhost:3000', 'http://127.0.0.1:3000']
INFO:     Application startup complete.
```

---

## Step 3 — Frontend Setup

### 3a. Install dependencies (first time only)

```bash
cd connectaflow/frontend
npm install
```

### 3b. Start the frontend

```bash
cd connectaflow/frontend
npm run dev
```

### What a successful startup looks like

```
  ▲ Next.js 16.0.7
   - Local:   http://localhost:3000
   - Network: http://192.168.x.x:3000
 ✓ Ready in ~900ms
```

> If you want to try Turbopack for faster rebuilds, use `npm run dev:turbo`. If you hit HMR issues, switch back to `npm run dev`.

---

## Step 4 — Verify Everything is Working

### Health check (backend)

Open in browser or run in terminal:

```bash
curl http://localhost:8000/api/health
```

Expected response:

```json
{
  "status": "ok",
  "version": "2.0.0",
  "providers": {
    "groq": true,
    "gemini": true
  }
}
```

If `groq` or `gemini` is `false`, the corresponding key is missing from `.env`.

### Interactive API docs (backend)

FastAPI auto-generates documentation you can use to test every endpoint directly:

- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

### Frontend

Open http://localhost:3000 in your browser. The app should load and connect to the backend automatically.

> **Demo data:** If your SQLite database is empty on first run, the backend auto-seeds a demo dataset so you can explore the UI without filling long forms.

---

## Available API Endpoints

| Prefix | Description |
|--------|-------------|
| `/api/leads` | Create, list, update, delete leads |
| `/api/enrichment` | AI-powered company/contact enrichment |
| `/api/icp` | Ideal Customer Profile builder |
| `/api/signals` | Buying signal detection |
| `/api/playbooks` | Sales playbook management |
| `/api/gtm` | GTM intelligence features |
| `/api/workspaces` | Workspace management |
| `/api/lists` | Lead list management |
| `/api/segments` | Audience segmentation |
| `/api/messaging` | Message generation |
| `/api/campaigns` | Campaign management |
| `/api/health` | Health + provider status check |

All endpoints are explorable at http://localhost:8000/docs.

---

## Troubleshooting

### `ModuleNotFoundError: No module named 'fastapi'` (or similar)

You are not using the venv's Python. Make sure you run uvicorn via `.venv/bin/uvicorn`, not a system-installed one.

### `[Errno 48] Address already in use`

Something is already on port 8000. Kill it:

```bash
lsof -ti :8000 | xargs kill -9
```

Or start on a different port:

```bash
uvicorn main:app --reload --port 8001
```

If you change the backend port, update the frontend to match by setting `NEXT_PUBLIC_API_URL` in `connectaflow/frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8001/api
```

### Backend starts but AI features don't work

Check the health endpoint — if `groq` and `gemini` are both `false`, the `.env` file is missing or in the wrong location. It must be at `connectaflow/backend/.env`.

### Database errors on first run

The SQLite database (`connectaflow.db`) is created automatically on first startup inside `connectaflow/backend/`. No manual setup needed. If you see errors, delete `connectaflow.db` and restart the backend to recreate it fresh.

### Frontend can't reach backend (CORS errors in browser console)

Ensure `CORS_ORIGINS` in `.env` includes the exact origin your frontend is running on (default: `http://localhost:3000`). Trailing slashes matter.

---

## Project Structure Reference

```
connectaflow/                  ← project root
├── .venv/                     ← Python virtual environment
├── connectaflow/
│   ├── backend/
│   │   ├── .env               ← API keys go here
│   │   ├── main.py            ← FastAPI app entry point
│   │   ├── config.py          ← All env var definitions
│   │   ├── database.py        ← DB setup
│   │   ├── models.py          ← SQLModel table definitions
│   │   ├── requirements.txt   ← Python dependencies
│   │   ├── api/               ← Route handlers
│   │   └── services/          ← Business logic (enrichment, signals, etc.)
│   └── frontend/
│       ├── src/
│       │   ├── app/           ← Next.js pages
│       │   ├── components/    ← UI components
│       │   └── services/
│       │       └── api.ts     ← All backend API calls
│       └── package.json
└── HOW_TO_RUN.md              ← this file
```
