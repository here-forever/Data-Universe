# Project Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the repository infrastructure needed to start backend and frontend development without requiring Docker or WSL.

**Architecture:** This milestone only creates project-level structure, documentation, environment examples, ignore rules, and placeholder directories. It does not scaffold FastAPI or React yet; those are separate milestones so dependency installation and generated files stay isolated.

**Tech Stack:** Git, Markdown, PowerShell-compatible local development notes, future Python/FastAPI backend, future React/TypeScript frontend.

---

## Scope

This plan implements Milestone 1 from `docs/MVP_ROADMAP.md`: Project Infrastructure.

It creates the base repository structure:

```text
frontend/
backend/
docker/
docs/
examples/
scripts/
README.md
.env.example
.gitignore
```

Docker/WSL are not required for this milestone. Docker Compose files are intentionally deferred until Docker is installed or until the dedicated Docker milestone begins.

## File Structure

- Create: `README.md` — project overview, current status, local development direction, milestone map.
- Create: `.env.example` — future environment variables for backend, frontend, database, Redis, and storage.
- Create: `.gitignore` — excludes Python, Node, environment, editor, logs, local data, and generated files.
- Create: `backend/.gitkeep` — reserves backend module directory.
- Create: `frontend/.gitkeep` — reserves frontend module directory.
- Create: `docker/.gitkeep` — reserves Docker configuration directory for later.
- Create: `examples/.gitkeep` — reserves sample data directory.
- Create: `scripts/.gitkeep` — reserves utility script directory.
- Create: `docs/DEVELOPMENT_SETUP.md` — local setup notes for the current no-Docker/no-WSL stage.

## Task 1: Add Repository Ignore Rules

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Create `.gitignore`**

Write this exact content:

```gitignore
# Python
__pycache__/
*.py[cod]
*.pyo
*.pyd
.pytest_cache/
.mypy_cache/
.ruff_cache/
.coverage
htmlcov/
.venv/
venv/
ENV/

# Node
node_modules/
dist/
build/
.vite/
coverage/
.npm/

# Environment
.env
.env.*
!.env.example

# IDE / OS
.vscode/
.idea/
.DS_Store
Thumbs.db

# Logs
*.log
logs/

# Local data and generated runtime files
storage/
uploads/
tmp/
temp/
*.sqlite
*.sqlite3

# Worktrees
.worktrees/
worktrees/
```

- [ ] **Step 2: Verify ignore rules exist**

Run:

```powershell
Get-Content .gitignore
```

Expected: output includes `.env`, `node_modules/`, `.venv/`, `storage/`, and `.worktrees/`.

## Task 2: Add Environment Example

**Files:**
- Create: `.env.example`

- [ ] **Step 1: Create `.env.example`**

Write this exact content:

```dotenv
# Application
APP_NAME="Data Analysis System"
APP_ENV=development
APP_DEBUG=true
APP_SECRET_KEY=change-me-in-local-env

# Backend
BACKEND_HOST=127.0.0.1
BACKEND_PORT=8000
BACKEND_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# Frontend
VITE_API_BASE_URL=http://127.0.0.1:8000/api

# PostgreSQL - local or future Docker Compose
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_DB=data_analysis_system
POSTGRES_USER=data_analysis_user
POSTGRES_PASSWORD=data_analysis_password
DATABASE_URL=postgresql+psycopg://data_analysis_user:data_analysis_password@127.0.0.1:5432/data_analysis_system

# Redis - reserved for task center/cache
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_URL=redis://127.0.0.1:6379/0

# Local file storage
LOCAL_STORAGE_ROOT=./storage
UPLOAD_STORAGE_ROOT=./storage/uploads

# Security defaults
ACCESS_TOKEN_EXPIRE_MINUTES=1440
PASSWORD_HASH_SCHEME=bcrypt
```

- [ ] **Step 2: Verify `.env.example` exists**

Run:

```powershell
Get-Content .env.example
```

Expected: output includes `DATABASE_URL`, `VITE_API_BASE_URL`, and `LOCAL_STORAGE_ROOT`.

## Task 3: Add Base Directories

**Files:**
- Create: `backend/.gitkeep`
- Create: `frontend/.gitkeep`
- Create: `docker/.gitkeep`
- Create: `examples/.gitkeep`
- Create: `scripts/.gitkeep`

- [ ] **Step 1: Create directories and `.gitkeep` files**

Create these directories and files:

```text
backend/.gitkeep
frontend/.gitkeep
docker/.gitkeep
examples/.gitkeep
scripts/.gitkeep
```

Each `.gitkeep` file should be empty.

- [ ] **Step 2: Verify directory structure**

Run:

```powershell
Get-ChildItem -Force
Get-ChildItem -Force backend,frontend,docker,examples,scripts
```

Expected: root output includes `backend`, `frontend`, `docker`, `examples`, and `scripts`; each directory contains `.gitkeep`.

## Task 4: Add Development Setup Notes

**Files:**
- Create: `docs/DEVELOPMENT_SETUP.md`

- [ ] **Step 1: Create `docs/DEVELOPMENT_SETUP.md`**

Write this exact content:

```markdown
# Development Setup

Last updated: 2026-07-04

## Current Environment Status

This project can begin local-first development before Docker and WSL are installed.

Verified on the current machine:

- Git is available.
- Python 3.13.9 is available.
- Node.js v24.14.0 is available.
- `npm.cmd` works.

Known missing or limited tools:

- Docker is not currently available on PATH.
- WSL is not currently available.
- PowerShell blocks `npm.ps1`; use `npm.cmd` on Windows until execution policy is adjusted.

## Local Development Strategy Before Docker

Until Docker/WSL are installed, develop in this order:

1. Repository structure.
2. Backend FastAPI skeleton using a local Python virtual environment.
3. Frontend React skeleton using `npm.cmd`.
4. SQLite or local PostgreSQL can be considered only if needed for early backend checks.
5. Docker Compose is added later when Docker Desktop and WSL2 are available.

## Required Commands To Check Later

```powershell
git --version
python --version
node --version
npm.cmd --version
docker --version
docker compose version
wsl --version
```

## Git Rule

All meaningful milestones should be committed. Do not mix unrelated refactors with feature work.
```

- [ ] **Step 2: Verify setup notes**

Run:

```powershell
Get-Content docs\DEVELOPMENT_SETUP.md
```

Expected: output documents current Docker/WSL limitations and `npm.cmd` usage.

## Task 5: Add Project README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

Write this exact content:

```markdown
# Data Analysis System

A professional, usable, and extensible data analysis workspace that will gradually evolve into an enterprise-grade data platform.

## Current Status

The project is in early implementation planning and infrastructure setup.

Completed documentation milestones:

- `docs/PROJECT_MEMORY.md` — project memory and long-term constraints.
- `docs/MVP_ROADMAP.md` — MVP module, page, database, and milestone roadmap.
- `docs/DEVELOPMENT_SETUP.md` — local setup notes.

## Product Direction

The core workflow is:

```text
data source -> dataset -> cleaning recipe or SQL -> data view -> chart -> dashboard/report
```

The first stage focuses on a lightweight project-collaboration data analysis workspace, not a full enterprise SaaS platform.

## Planned Tech Stack

Backend:

- Python
- FastAPI
- PostgreSQL
- SQLAlchemy
- Alembic
- Pydantic
- Pandas / Polars

Frontend:

- React
- TypeScript
- Vite
- TanStack Query
- Zustand
- ECharts
- Monaco Editor
- Tailwind CSS

Deployment direction:

- Local development first.
- Docker Compose after Docker/WSL are installed.

## MVP Scope

See `docs/MVP_ROADMAP.md` for the full MVP roadmap.

## Development Notes

See `docs/DEVELOPMENT_SETUP.md` for local setup notes.

## Git Workflow

Use focused commits for meaningful milestones. Keep documentation updated when architecture decisions change.
```

- [ ] **Step 2: Verify README**

Run:

```powershell
Get-Content README.md
```

Expected: output includes project direction, tech stack, and links to project docs.

## Task 6: Verify and Commit Milestone 1

**Files:**
- Verify all files from Tasks 1-5.

- [ ] **Step 1: Check Git status**

Run:

```powershell
git status --short
```

Expected new files:

```text
?? .env.example
?? .gitignore
?? README.md
?? backend/
?? docker/
?? docs/DEVELOPMENT_SETUP.md
?? examples/
?? frontend/
?? scripts/
```

- [ ] **Step 2: Stage files**

Run:

```powershell
git add .gitignore .env.example README.md backend/.gitkeep frontend/.gitkeep docker/.gitkeep examples/.gitkeep scripts/.gitkeep docs/DEVELOPMENT_SETUP.md
```

- [ ] **Step 3: Commit files**

Run:

```powershell
git commit -m "chore: add project infrastructure"
```

Expected: commit succeeds and records the infrastructure milestone.

- [ ] **Step 4: Verify clean working tree**

Run:

```powershell
git status --short
```

Expected: no modified or untracked files.

## Self-Review

- Spec coverage: This plan implements Milestone 1 from `docs/MVP_ROADMAP.md` and respects `AGENTS.md` constraints.
- Placeholder scan: No TBD/TODO placeholders are present.
- Type consistency: No code types or APIs are introduced in this milestone.
