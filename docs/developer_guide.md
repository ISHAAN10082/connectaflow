# Developer Guide

## Architecture Overview

Connectaflow follows a decoupled client-server architecture:

*   **Backend**: Python FastAPI application (`connectaflow/backend`).
*   **Frontend**: TypeScript Next.js application (`connectaflow/frontend`).
*   **Database**: SQLite (default) or PostgreSQL.
*   **AI Service**: Google Gemini via `google-generativeai`.

## Backend (`connectaflow/backend`)

### Key Files
*   `main.py`: Entry point for the FastAPI application.
*   `models.py`: SQLModel definitions for database tables (Leads, etc.).
*   `database.py`: Database connection and session management.
*   `api/`: Directory containing API route definitions.
    *   `leads.py`: Endpoints for CRUD operations on leads.
    *   `enrichment.py`: Logic for enriching lead data using external APIs/AI.

### Setup (Local Development without Docker)
1.  Navigate to `connectaflow/backend`.
2.  Create virtual environment: `python -m venv venv`
3.  Activate it: `source venv/bin/activate` (Mac/Linux) or `venv\Scripts\activate` (Win).
4.  Install deps: `pip install -r requirements.txt`.
5.  Run: `uvicorn main:app --reload`.

## Frontend (`connectaflow/frontend`)

### Key Files
*   `src/app/page.tsx`: Main dashboard page.
*   `src/components/`: Reusable UI components (shadcn/ui based).
*   `src/lib/`: Utility functions and API clients.

### Setup (Local Development without Docker)
1.  Navigate to `connectaflow/frontend`.
2.  Install deps: `npm install`.
3.  Run: `npm run dev`.
