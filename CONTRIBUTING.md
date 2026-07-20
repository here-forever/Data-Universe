# Contributing

Thanks for helping improve the Data Analysis System.

## Development Setup

Use the instructions in `docs/DEVELOPMENT_SETUP.md` for local Python/Node development and Docker Compose integration. The quickest demo path is documented in `docs/DEMO_GUIDE.md`.

## Change Guidelines

- Keep the first-stage architecture a clearly layered modular monolith.
- Preserve the main flow: data source -> dataset -> cleaning or SQL -> data view -> chart -> dashboard/report.
- Keep routes thin, workflows in services, and persistence in repositories.
- Preserve original source retention, task records, operation logs, and lineage for important data operations.
- Avoid silent overwrite or hard deletion of important user resources.
- Keep changes focused and update documentation when behavior or architecture changes.

## Validation

Run these checks before opening a pull request:

```powershell
backend\.venv\Scripts\python -m ruff check backend
backend\.venv\Scripts\python -m pytest backend\tests -q
cd frontend
npm.cmd run lint
npm.cmd test -- --run
npm.cmd run build
```

For Docker changes, also run:

```powershell
docker compose config --quiet
```

## Security And Data Privacy

Use synthetic or anonymized sample data only. Never commit `.env` files, credentials, uploaded user files, database dumps, or private endpoints. See `SECURITY.md` before contributing authentication, connector, storage, or deployment changes.
