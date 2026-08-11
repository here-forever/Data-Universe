FROM ghcr.io/astral-sh/uv:0.8.15 AS uv

FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PATH="/app/.venv/bin:$PATH"

WORKDIR /app

RUN apt-get update \
    && apt-get install --no-install-recommends --yes fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY --from=uv /uv /uvx /bin/
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

RUN groupadd --system app && useradd --system --gid app --home-dir /app app

COPY --chown=app:app backend/ ./
COPY docker/backend-entrypoint.sh /usr/local/bin/backend-entrypoint

RUN mkdir -p /app/storage/datasets /app/storage/exports \
    && chown -R app:app /app/storage \
    && chmod +x /usr/local/bin/backend-entrypoint \
    && uv sync --frozen --no-dev

# NOTE: intentionally no "USER app" here. The container starts as root so the
# entrypoint can repair ownership of the mounted named volume (which masks the
# dirs baked into the image), then drops privileges to "app" via su.
EXPOSE 8000

ENTRYPOINT ["backend-entrypoint"]
