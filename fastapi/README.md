<!-- Generated from docs/src. Run `make docs-build` to update. Do not edit directly. -->

# TierNerd Backend

FastAPI backend for the TierNerd ranking app.

## Quick Start

```bash
# Start the backend (builds and runs Docker containers, auto-seeds dev user)
make dev

# Or run in background
make dev DETACHED=1
```

The API is now running at <http://localhost:8000>.

## Development accounts

Development startup seeds accounts for fixture data, not password sign-in. Sign in on the web with a verified Google account. The Google account email must match an existing account to access its saved data.

## API Documentation

- **Swagger UI**: <http://localhost:8000/docs>
- **ReDoc**: <http://localhost:8000/redoc>

## API Structure

The API is structured around the following resources:

- `/api/users` — User management and authentication
- `/api/lists` — List creation and management
- `/api/items` — Item management and ranking

### Backend (fastapi/)

**Always use `make` commands instead of raw `docker` commands.** Agents may run read-only ones (`make logs`, `make stop`, `make health`); the user runs build/dev/reset commands (`make dev`, `make fresh`, `make restart`, `make reset`, `make clean`).

```bash
cd fastapi

# Docker (use these, not raw docker commands)
make dev                          # Build and run containers (auto-seeds dev user)
make dev DETACHED=1               # Run in background
make restart                      # Rebuild and restart
make fresh                        # Rebuild, restart, and show logs
make logs                         # View container logs
make stop                         # Stop containers
make health                       # Check health endpoint

# Database
make reset                        # Clear database and re-seed
make clean                        # Stop, remove volumes, clean up (use after schema changes)

# Package management (use uv, not pip)
uv sync                           # Install dependencies
uv sync --group dev               # Install with dev dependencies

# Code quality
uv run ruff check app/ tests/     # Lint (rules: E, F, I, B, UP, SIM, RUF, PL, S)
uv run ruff check app/ --fix      # Lint + autofix
uv run ruff format app/           # Format
uv run mypy app/                  # Type check
uv run tach check                 # Enforce module boundaries (see tach.toml)

# Testing
uv run pytest                                       # Run all tests
uv run pytest tests/test_items.py                   # Run single test file
uv run pytest -k "test_name"                        # Run specific test
uv run pytest --cov=app --cov-report=term-missing   # Run with coverage
```

### Cloud Dev Loop (Cloud Run + Neon)

The default backend for frontend work is a deployed dev API — no local containers.

```bash
cd frontend
EXPO_PUBLIC_API_URL=https://tiernerd-api-dev-xxxx.run.app npm run web
```

Open `http://localhost:8081` and sign in with Google. `EXPO_PUBLIC_API_URL` also goes in `frontend/.env.local` to make it the default for every `npm run web`. Unset it to fall back to a backend on `localhost:8000`.

Deploy (from `fastapi/`):

```bash
make cloud-deploy          # GCP_PROJECT/tiernerd-api-dev, CLOUD_ENV=dev
make cloud-url             # print the service URL
make cloud-health          # curl the deployed /health
make cloud-logs            # recent service logs
```

`CLOUD_ENV` selects the service, env file and secrets (`cloud/env.<env>.yaml`, `tiernerd-<env>-*`). Deploying a second environment needs its own secrets and env file and nothing else:

```bash
make cloud-deploy CLOUD_ENV=prod GCP_PROJECT=<prod-project>
```

Config lives in `fastapi/cloud/env.dev.yaml` (non-secret) and Secret Manager (`SECRET_KEY`, `DATABASE_URL`). `APP_ENV=development` is what makes the container create its tables and seed the dev users on startup; setting it to `production` disables that seeding and switches the SQLAlchemy pool settings in `app/db/database.py`.

`DATABASE_URL` must be `postgresql+asyncpg://…?ssl=require`. A Neon string's `?sslmode=require&channel_binding=require` crashes asyncpg (`unexpected keyword argument`), because SQLAlchemy forwards DSN query parameters to the driver as keyword arguments.

Testing against the deployed API requires a valid `E2E_AUTH_TOKEN` for that API. Supply the token securely in the environment, then run:

```bash
cd frontend && EXPO_PUBLIC_API_URL=https://tiernerd-api-dev-xxxx.run.app npm run e2e
```

The URL is baked into the bundle at export time, so run `npm run build:web` first if the code changed. Playwright starts its own preview server on 8081 and never reuses an existing one, so stop any Metro dev server on that port — otherwise the spec fails on a port conflict instead of silently testing the dev-server bundle.

Local containers are now optional. The fallback loop is unchanged — `cd fastapi && make dev DETACHED=1` — except its Postgres publishes on host port 55432, not 5432:

```bash
psql -h localhost -p 55432 -U tiernerd tiernerd
```

## Testing

- **Framework**: `pytest` with `pytest-asyncio` for async support
- **Test Database**: SQLite in-memory for fast, isolated tests
- **HTTP Client**: `httpx.AsyncClient` for endpoint testing
- **Test Files**:
  - `tests/conftest.py` — Test configuration and fixtures
  - `tests/test_users.py` — User endpoint tests
  - `tests/test_lists.py` — List endpoint tests
  - `tests/test_items.py` — Item endpoint tests
  - `tests/app/utils/test_algorithm.py` — Algorithm tests

```bash
uv sync --group dev                                 # Install dev deps
uv run pytest                                       # All tests
uv run pytest tests/test_users.py -v                # Single file
uv run pytest tests/test_users.py -k google           # Google sign-in tests
uv run pytest --cov=app --cov-report=html           # Coverage report
```

### Coverage Areas

- **Users**: Google sign-in, tokens, current user, invalid tokens, and authorization
- **Lists**: CRUD, pagination, authorization (cross-user access denied)
- **Items**: CRUD, comparison workflow (better/worse), session management, authorization
- **Algorithm**: binary search ranking, winner/loser logic, range narrowing, edge cases

## Project Structure

```
app/
├── api/endpoints/   # Route handlers
├── core/            # Constants and algorithms
├── crud/            # Database operations
├── db/              # Models and database setup
├── schemas/         # Pydantic request/response models
└── settings.py      # Configuration
```

## Tech Stack

- **FastAPI** — Web framework
- **PostgreSQL** — Database (via asyncpg)
- **SQLAlchemy 2.0** — Async ORM
- **Google and JWT** — Authentication
- **Docker** — Containerization

## Ranking Algorithm

The ranking algorithm is implemented in `app/core/algorithm.py` and uses binary search to efficiently determine item positions through pairwise comparisons.

Draft sessions persist in the database. Answers and one-step undo update the draft, not the saved item. Commit applies the new position and recalculates affected ranges. Mutation requests carry the current session revision; stale revisions or changed ranking snapshots return 409. Status reads expose stale drafts so the client can restart them.

## Upgrade the UI-ranking schema

This migration supports PostgreSQL only. Back up the database and stop the application before applying it. Load `DATABASE_URL` through your platform secret store; never put credentials in this command or a tracked file. `create_all` does not upgrade existing tables.

Run the read-only preflight from `fastapi/` (the default mode is also read-only):

```bash
uv run python scripts/migrate_ui_ranking.py --check
```

Resolve any reported same-list duplicate names or blank/overlength names yourself. The migration stops without changing conflicting data; it does not rename or delete items.

After preflight succeeds, the backup exists, and the application is stopped, apply the migration:

```bash
uv run python scripts/migrate_ui_ranking.py --apply
```

The migration trims display names, backfills normalized identity keys, and adds uniqueness and draft-session constraints in one locked transaction. Legacy active sessions become cancelled without deleting items or changing ranks; historical completed sessions remain completed. Previously unranked items can start a fresh ranking. Unknown partial schemas are rejected. A verified upgraded schema is a no-op on rerun.

## Upgrade the Google authentication schema

Applying this migration permanently discards password hashes. Back up the intended database and stop the old backend before applying it. Load `DATABASE_URL` from the environment's existing secret store; do not put credentials in commands or tracked files. Fresh databases use the model schema; `create_all` does not upgrade existing tables.

From `fastapi/`, inspect the existing schema without changing it:

```bash
uv run python scripts/migrate_google_auth.py --check
```

After the backup is complete and the old backend is stopped, apply the migration:

```bash
uv run python scripts/migrate_google_auth.py --apply
```

The migration preserves accounts and their relationships, adds a nullable Google photo URL, and removes password hashes. Reapplying it is a no-op. Deploy the matching backend after the migration. Accounts can sign in only with a verified Google account matching their email; existing app sessions remain valid.

## Documentation Automation

`README.md`, `fastapi/README.md`, and `frontend/README.md` are **generated** from templates in `docs/src/` by `scripts/build_docs.py`. Do not edit the generated files directly — edit the template or partial and re-render.

```bash
make docs-build    # render templates → generated files
make docs-check    # fail if generated docs are stale
```

Partials live in `docs/src/partials/` and are included with double-brace `include:partials/<name>.md` directives.

`AGENTS.md` is hand-maintained, not generated — it is the source of truth for agent-facing guidance.
