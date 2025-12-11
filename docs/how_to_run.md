# How to Run Connectaflow

This guide explains how to run the Connectaflow application. You have two choices: **Docker** or **Local/Manual**.

## 🧠 Intuition: Which one should I choose?

### Choose [Docker](#option-1-docker-recommended) if:
*   ✅ You want it to "just work" without installing Python, Node.js, databases, etc.
*   ✅ You want to keep your computer clean (everything happens inside a "container").
*   ✅ You are not a developer and just want to use the app.

### Choose [Local / Manual](#option-2-manual-local-setup) if:
*   ✅ You are a developer and want to edit the code.
*   ✅ You want to debug specific issues.
*   ✅ You don't want to install Docker.
*   ✅ You are comfortable using the terminal and installing libraries.

---

## Prerequisites (For Both)

1.  **Get a Gemini API Key**:
    *   Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
    *   Create a key and copy it.
    *   Open `connectaflow/backend/.env` and paste it after `GEMINI_API_KEY=`.

---

## Option 1: Docker (Recommended)

**Prerequisite**: Install [Docker Desktop](https://www.docker.com/products/docker-desktop/).

1.  **Open Terminal** in the project folder (`connectaflow`).
2.  **Start**:
    ```bash
    docker-compose up --build
    ```
    *(Note: If `docker-compose` command is not found, try `docker compose up --build`)*.
3.  **Access**: Open `http://localhost:3000`.
4.  **Stop**: Press `Ctrl + C`. Clean up with `docker-compose down`.

---

## Option 2: Manual / Local Setup

**Prerequisites**:
*   **Python 3.9+** installed.
*   **Node.js 18+** installed.

### Step A: Run the Backend (The Brain)

1.  Open a terminal in `connectaflow/backend`.
2.  **Create Setup** (do this once):
    ```bash
    python3 -m venv venv
    source venv/bin/activate  # Windows: venv\Scripts\activate
    pip install -r requirements.txt
    ```
3.  **Start**:
    ```bash
    uvicorn main:app --reload
    ```
    It will say "Application startup complete".

### Step B: Run the Frontend (The Interface)

1.  Open a **new** terminal window in `connectaflow/frontend`.
2.  **Install** (do this once):
    ```bash
    npm install
    ```
3.  **Start**:
    ```bash
    npm run dev
    ```
4.  **Access**: Open `http://localhost:3000`.
