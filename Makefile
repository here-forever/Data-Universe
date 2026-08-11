.PHONY: install lint format test build migrate api benchmark docker verify

VITE_API_BASE_URL ?= http://127.0.0.1:8000/api/v1
export VITE_API_BASE_URL

install:
	cd backend && uv sync --frozen --extra dev
	cd frontend && npm ci

lint:
	cd backend && uv run ruff check .
	cd frontend && npm run lint

format:
	cd backend && uv run ruff format .
	cd frontend && npx prettier --write .

test:
	cd backend && uv run pytest
	cd frontend && npm run test:coverage

build:
	cd frontend && npm run build

migrate:
	cd backend && uv run alembic upgrade head

api:
	cd backend && uv run python ../scripts/export_openapi.py
	cd frontend && npm run api:types

benchmark:
	cd backend && uv run --frozen python ../scripts/benchmark_storage.py

docker:
	docker compose build

verify: lint test build
