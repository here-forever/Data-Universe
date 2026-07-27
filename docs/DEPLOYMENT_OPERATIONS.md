# Deployment, Backup, Upgrade, and Recovery

Last updated: 2026-07-27

This runbook covers the supported first-stage Docker Compose deployment. It is intended for local, personal, and trusted small-team environments. It is not a Kubernetes or multi-tenant production guide.

## 1. Production-Style Environment Checklist

Create an untracked `.env` file and replace every placeholder. At minimum:

```text
APP_ENV=production
APP_DEBUG=false
APP_SECRET_KEY=<long random application secret>
DEFAULT_ADMIN_PASSWORD=<strong initial administrator password>
ACCESS_TOKEN_EXPIRE_MINUTES=480
PASSWORD_HASH_SCHEME=pbkdf2_sha256
PASSWORD_HASH_ITERATIONS=120000
EXTERNAL_CONNECTION_ENCRYPTION_KEY=<separate stable encryption key>
POSTGRES_PASSWORD=<strong database password>
VITE_DEV_ACCESS_TOKEN=
```

Rules:

- Keep `APP_SECRET_KEY` stable. Changing it invalidates signed sessions.
- Keep `EXTERNAL_CONNECTION_ENCRYPTION_KEY` stable and backed up separately. Losing it makes stored external connection credentials unreadable.
- Do not expose the development token in a non-development deployment. The backend accepts `local-dev-token-*` only when `APP_ENV=development`.
- Restrict `BACKEND_CORS_ORIGINS`, host firewall rules, and reverse-proxy access to trusted origins.
- TLS termination, login rate limiting, password reset, MFA, centralized session revocation, and secret-manager integration remain deployment responsibilities for any internet-facing environment.

## 2. Clean Compose Deployment

From the repository root:

```powershell
docker compose config
docker compose up -d --build
docker compose ps
docker compose exec -T backend python -m alembic upgrade head
docker compose exec -T backend python /demo/scripts/seed_demo.py
docker compose exec -T backend python /demo/scripts/validate_release.py --project-id prj_demo
```

Expected result:

- PostgreSQL, Redis, backend, and frontend are healthy.
- Alembic reports the repository head revision.
- The seed is idempotent and creates or reuses `prj_demo`.
- The validator prints JSON with `"status": "ok"` and non-zero workflow, audit, and lineage counts.

Open:

```text
http://127.0.0.1:5173
http://127.0.0.1:5173/governance?project_id=prj_demo
```

## 3. Backup

The backup must include both PostgreSQL and the backend storage volume. Database-only backups are incomplete because original uploads and report exports are stored under `/app/storage`.

Run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup_compose.ps1
```

For a named Compose project or custom destination:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup_compose.ps1 `
  -ComposeProject dataanalyzesystem `
  -OutputDirectory D:\protected-backups\data-analysis-20260727
```

Each backup contains:

```text
database.dump
storage/
manifest.json
```

Store the backup outside the repository. The `backups/` path is ignored by Git for local convenience, but it is not a durable backup destination by itself.

After backup, verify:

- `database.dump` is non-empty.
- `storage/` contains retained uploads and any generated exports.
- `manifest.json` records the migration revision and Git commit.
- The protected encryption key is available through the deployment secret store; it is intentionally not copied into the backup directory.

## 4. Restore

Restoring replaces the active database and storage. Verify the backup path and create a fresh safety backup first.

```powershell
powershell -ExecutionPolicy Bypass -File scripts\restore_compose.ps1 `
  -BackupDirectory D:\protected-backups\data-analysis-20260727 `
  -ComposeProject dataanalyzesystem `
  -Force
```

The restore script:

1. Stops backend and frontend traffic.
2. Restores PostgreSQL with `pg_restore --clean --if-exists`.
3. Replaces the managed `/app/storage` contents.
4. Restarts backend and frontend.
5. Applies forward-compatible Alembic migrations.

Validate immediately:

```powershell
docker compose -p dataanalyzesystem exec -T backend python -m alembic current
docker compose -p dataanalyzesystem exec -T backend python /demo/scripts/validate_release.py --project-id prj_demo
docker compose -p dataanalyzesystem ps
```

Do not reopen the workspace to users until validation succeeds.

## 5. Upgrade Procedure

Before upgrading:

```powershell
git status --short
powershell -ExecutionPolicy Bypass -File scripts\backup_compose.ps1 `
  -ComposeProject dataanalyzesystem
```

Apply the upgrade:

```powershell
git pull --ff-only
docker compose -p dataanalyzesystem build backend frontend
docker compose -p dataanalyzesystem run --rm backend python -m alembic upgrade head
docker compose -p dataanalyzesystem up -d backend frontend
docker compose -p dataanalyzesystem exec -T backend python /demo/scripts/validate_release.py --project-id prj_demo
```

Review release notes and migration files before upgrading. Never run two different application revisions against the same database during a schema-changing upgrade.

## 6. Rollback and Recovery

Preferred rollback order:

1. Stop application traffic.
2. Restore the last verified database and storage backup together.
3. Switch application code/image back to the matching Git commit from `manifest.json`.
4. Start services and run the release validator.

Avoid using Alembic downgrade as the primary production rollback strategy when a migration has transformed or removed data. Backup restore is safer because it keeps database and file storage synchronized.

Common recovery cases:

- **Accidental resource removal:** use Governance Center restore; no infrastructure restore is needed.
- **Database corruption or failed schema upgrade:** restore the paired database/storage backup.
- **Lost application secret:** users must sign in again after setting a replacement.
- **Lost external credential encryption key:** restore the protected key; database restore alone cannot recover encrypted connection passwords.
- **Missing report export file:** restore the matching storage backup and database snapshot together.

## 7. Routine Validation

Recommended before each release and after each restore:

```powershell
backend\.venv\Scripts\python -m ruff check backend
backend\.venv\Scripts\python -m pytest backend\tests -q
cd frontend
npm.cmd run lint
npm.cmd test -- --run
npm.cmd run build
```

Also verify the Governance Center in a real browser at desktop and mobile widths, including resource archive/restore confirmation, dependency focus switching, member role changes, and operation-log visibility.
