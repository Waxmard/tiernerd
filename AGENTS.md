# Repository Guidelines

This file provides guidance to AI agents working in this repository.

## Project Overview

Monorepo: React Native/Expo frontend (`frontend/`), FastAPI backend (`fastapi/`). Product overview in [README.md](README.md).

## Repo Layout

- `fastapi/` — Python backend (uv, pyproject.toml, Dockerfile, Makefile)
- `frontend/` — React Native/Expo app (package.json, biome)
- `scripts/` — repo-wide tooling (line-limit check, iOS and TestFlight builds)
- `/package.json` — root dev-tooling only (lefthook). Not a JS project.
- `lefthook.yml` — git hooks (biome for frontend, ruff for backend)

## First-Time Setup

Tool versions (node, python, uv) are pinned via [mise](https://mise.jdx.dev/) in `mise.toml`. Install mise (`brew install mise`), then:

```bash
mise install     # install pinned node/python/uv versions
make setup       # installs root deps (incl. lefthook git hooks), frontend deps, backend deps
```

The backend's interpreter is pinned twice and both must move together: `mise.toml` for local dev, `fastapi/.python-version` for uv (CI and anyone not running mise). CI has no mise, so without that file `uv sync` resolves the newest CPython satisfying `requires-python` and can pick a version the locked dependencies have no wheels for.

Or step-by-step:

1. `mise install` (installs node, python, uv at pinned versions)
2. `npm install` (root, installs lefthook + git hooks via `prepare` script)
3. `cd frontend && npm install`
4. `cd ../fastapi && uv sync --locked`

## Development Commands

### Root (cross-project)

```bash
make help          # list all targets
make lint          # backend + frontend lint
make fix           # autofix both
make typecheck     # mypy + tsc
make test          # backend pytest w/ coverage
make ci            # lint + typecheck + boundaries + test + line-limit
make backend-<X>   # delegates to fastapi/Makefile target X (e.g. backend-logs, backend-health, backend-lint)
```

Backend quality targets (lint/fix/format/typecheck/test/ci) live in `fastapi/Makefile` and are reachable from root via the `backend-` prefix or directly when in `fastapi/`.

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

### Frontend (frontend/)

#### iOS Release

To build and install a standalone iOS Release app, meet the [frontend prerequisites](frontend/README.md#prerequisites) and configure Apple team `48TY2FP59S` for signing. Run from the repository root:

```bash
make ios                          # build, install and launch on Gengar Phone
make ios IOS_DEVICE="Other Phone" # choose another paired device
```

The command uses development Google OAuth web and iOS client IDs by default. To use another iOS client for bundle ID `com.maxwellward.tiernerd`, set `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` in the environment. To use another web client, set `EXPO_PUBLIC_GOOGLE_CLIENT_ID` to the same client ID as the backend's `GOOGLE_CLIENT_ID`.

The Release app uses the hosted development API by default and embeds its JavaScript, so it needs no Metro server after installation. Set `EXPO_PUBLIC_API_URL` to another public HTTPS API if needed. The command ignores Expo dotenv files. Re-running it replaces the app without deliberately removing its data. `npm run ios` remains the separate Expo development command.

TestFlight builds run `scripts/build-ios-testflight.sh`; see [Deploys & Releases](CONTRIBUTING.md#deploys--releases) for the trigger, environment and signing secrets.

#### Simulator and development builds

See [frontend/README.md](frontend/README.md#option-2-ios-simulator) for simulator and physical-device development commands. Expo Go cannot run Google Sign-In because it requires native code.

#### Frontend code quality

Biome handles lint and formatting:

```bash
npm run lint                      # Lint with Biome
npm run lint:fix                  # Fix lint errors
npm run format                    # Format with Biome
npm run format:check              # Check formatting
npm run check                     # Lint + format + import sort (combined)
npm run check:fix                 # Apply all safe fixes
npm run typecheck                 # TypeScript check
```

### Cloud Dev Loop (Cloud Run + Neon)

The default backend for frontend work is the deployed dev API — no local containers. `make ios` and TestFlight builds target `https://tiernerd-api-dev-1015723670625.us-east1.run.app` by default; override `EXPO_PUBLIC_API_URL` to point at another public HTTPS API.

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

Local containers are now optional. The fallback loop is unchanged — `cd fastapi && make dev DETACHED=1` — except its Postgres publishes on host port 55432, not 5432:

```bash
psql -h localhost -p 55432 -U tiernerd tiernerd
```

### Git Hooks

[Lefthook](https://lefthook.dev/) manages all pre-commit hooks via `lefthook.yml` at repo root. Hooks run in parallel and only on staged files matching each glob:

- **biome** — `frontend/src/**/*.{ts,tsx,js,jsx,json}` → `biome check --write`
- **ruff-lint** — `fastapi/**/*.py` → `ruff check --fix`
- **ruff-format** — `fastapi/**/*.py` → `ruff format`
- **tach** — `fastapi/app/**/*.py` or `fastapi/tach.toml` → `tach check` (module-boundary enforcement)

Autofixed files are re-staged automatically (`stage_fixed: true`). Hooks install via the root `prepare` script when you run `npm install`.

## Architecture

### Backend Structure (`fastapi/app/`)

- `api/endpoints/` — Route handlers (users, lists, items)
- `services/` — Business logic (auth/JWT, comparison, list, ranking)
- `core/` — Pure utilities (constants, ranking algorithm, fractional index)
- `crud/` — Database operations
- `db/` — SQLAlchemy models and async database setup
- `schemas/` — Pydantic request/response models
- `settings.py` — Configuration via pydantic-settings

Module boundaries enforced by [tach](https://docs.gauge.sh/) (`fastapi/tach.toml`). Layering: `main → api → services → crud → db`. `api` may also call `crud` directly (endpoint handlers use `crud_*` helpers); this is intentional, not a violation. `core` is a pure leaf (constants, algorithm, fractional_index) reachable from `api`/`services`/`crud`. `schemas`/`settings`/`utils` are cross-cutting. Run `make backend-boundaries` (or `uv run tach check` in `fastapi/`) to verify.

### Frontend Structure (`frontend/src/`)

- `components/` — Screen-level components and workspace hooks
- `config/` — API endpoint configuration
- `screens/` — Screen components (Login, Home, ListDetail, Profile)
- `navigation/` — React Navigation stack setup
- `providers/` — Context providers (AuthContext)
- `design-system/` — Reusable components and design tokens
- `services/` — API, sign-in and cache services
- `utils/` — Shared utilities

### Key Patterns

- **Backend**: Async SQLAlchemy 2.0+, FastAPI dependency injection, JWT auth
- **Frontend**: Context API for state, token-based design system, TypeScript strict mode
- **Items**: Ordered via Base-62 fractional index `position` column (`app/core/fractional_index.py`)
- **Ranking**: Binary search algorithm in `app/core/algorithm.py`

### Database

- PostgreSQL with async (asyncpg)
- UUID primary keys throughout
- Fresh schemas use `Base.metadata.create_all` (`app/db/database.py`, `scripts/seed.py`) — no Alembic. Existing databases need explicit schema upgrades; see the backend README. The Google auth migration permanently removes password hashes: back up the database, stop the old backend, check and apply the migration, then deploy the matching backend. Do not wipe application data.

## Development Notes for AI Agents

- Google is the only sign-in method: the client obtains a Google ID token and exchanges it at `POST /api/users/google`.
- Comparison sessions are persistent database drafts; answers do not change saved ranks until commit.
- API endpoints are prefixed with `/api/`.
- Do **not** run `npm run ios` or `npx expo start` — the user runs these in a separate terminal.
- Do **not** run `make cloud-deploy` unless asked — it mutates shared cloud state.
- Run `make test` and `make typecheck` (or `make ci`) after changing frontend behavior.
- Do **not** run `git commit`, `git add`, or `git push` — the user handles staging, committing, and pushing.

## Documentation

`README.md`, `fastapi/README.md`, `frontend/README.md`, and `AGENTS.md` are all hand-maintained. Edit them directly; there is no template, partial, or render step.
