# Docker Development

Docker Compose provides the local development services for the Data Analysis System.

## Services

- `postgres`: PostgreSQL database.
- `redis`: reserved for task center/cache work.
- `backend`: FastAPI development server.
- `frontend`: Vite React development server.
- `worker`: reserved placeholder under the `worker` profile.

## Commands

From the repository root:

```powershell
docker compose up --build
```

Run in the background:

```powershell
docker compose up -d --build
```

Stop services:

```powershell
docker compose down
```

Remove service volumes when you intentionally want a clean database:

```powershell
docker compose down -v
```

## Image Pull Notes

Docker Desktop must be able to pull images from Docker Hub, including:

- `postgres:17-alpine`
- `redis:8-alpine`
- `python:3.13-slim`
- `node:24-alpine`

If `docker compose up --build` fails while pulling images, configure Docker Desktop proxy or registry mirror settings, then run the command again.

## Local URLs

```text
Frontend: http://127.0.0.1:5173
Backend:  http://127.0.0.1:8000/api/health
Postgres: 127.0.0.1:5432
Redis:    127.0.0.1:6379
```
