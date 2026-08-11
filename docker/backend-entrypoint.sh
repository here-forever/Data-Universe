#!/bin/sh
set -eu

# The container starts as root. The named volume mounted at /app/storage masks
# the dirs baked into the image, and on first runs (or after a stale image) its
# contents may be owned by root, which the "app" user cannot write to. Repair
# ownership here, then drop privileges before launching the app.
mkdir -p /app/storage/datasets /app/storage/exports
chown -R app:app /app/storage

exec su app -s /bin/sh -c "alembic upgrade head && exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
