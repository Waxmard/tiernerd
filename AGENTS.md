# Repository Guidelines

This file provides guidance to AI agents working in this repository.

## Project Overview

TierNerd is a cross-platform mobile app for creating ranked tier lists (S–F) through 1v1 comparisons. Rather than asking users to assign subjective numerical scores, the app presents pairs of items and asks which is better. Through a series of binary choices, each item finds its proper place and receives a numeric rating that is then mapped to an intuitive tier (S, A, B, C, D, F).

Monorepo with React Native/Expo frontend and FastAPI backend.

## Repo Layout

- `fastapi/` — Python backend (uv, pyproject.toml, Dockerfile, Makefile)
- `frontend/` — React Native/Expo app (package.json, biome)
- `docs/src/` — documentation templates and partials (rendered by `scripts/build_docs.py`)
- `scripts/` — repo-wide tooling (e.g. `build_docs.py`)
- `/package.json` — root dev-tooling only (lefthook). Not a JS project.
- `lefthook.yml` — git hooks (biome for frontend, ruff for backend)

## First-Time Setup

Tool versions (node, python, uv) are pinned via [mise](https://mise.jdx.dev/) in `mise.toml`. Install mise (`brew install mise`), then:

```bash
mise install     # install pinned node/python/uv versions
make setup       # installs root deps (incl. lefthook git hooks), frontend deps, backend deps
```

Or step-by-step:

1. `mise install` (installs node, python, uv at pinned versions)
2. `npm install` (root, installs lefthook + git hooks via `prepare` script)
3. `cd frontend && npm install`
4. `cd ../fastapi && uv sync --extra dev --group dev`

## Development Commands

### Root (cross-project)

```bash
make help          # list all targets
make lint          # backend + frontend lint
make fix           # autofix both
make typecheck     # mypy + tsc
make test          # backend pytest w/ coverage
make ci            # lint + typecheck + boundaries + test + docs-check
make docs-build    # render docs/src → README.md, sub-READMEs
make docs-check    # fail if generated docs are stale
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

Day-to-day UI work happens in the browser — no Xcode or simulator needed.

Terminal A (backend, once):

```bash
cd fastapi && make dev DETACHED=1
```

Terminal B (web bundle):

```bash
cd frontend
npm run web                       # http://localhost:8081
EXPO_PUBLIC_API_URL=https://<cloud-run-url> npm run web   # target the deployed dev API
```

Open `http://localhost:8081`. Chrome DevTools' device toolbar gives a phone-sized layout, and Fast Refresh applies edits without a rebuild.

To check on your iPhone (no Xcode):

```bash
ipconfig getifaddr en0            # e.g. 192.168.1.50
```

Open `http://<ip>:8081` in Safari. The API base URL follows the host that served the app, so the phone reaches the backend on the same LAN IP.

End-to-end smoke test — Playwright drives the **built** web bundle, so the API URL is baked in at export time:

```bash
make frontend-e2e                 # builds the bundle, then runs the spec
```

`make frontend-e2e` builds first, so it always tests the current code. The API the bundle targets is `EXPO_PUBLIC_API_URL` (the shell value wins over `frontend/.env.local`), so a run against a local backend is `EXPO_PUBLIC_API_URL=http://localhost:8000 make frontend-e2e`. CI runs the same flow in `.github/workflows/e2e.yml`.

Reserved for native-only changes and pre-release checks:

```bash
npm run ios                       # Run on iOS simulator
npm run android                   # Run on Android emulator
npx expo start --go               # Expo Go on a physical phone, no simulator
```

Code quality (Biome — single tool for lint + format):

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

The default backend for frontend work is a deployed dev API — no local containers.

```bash
cd frontend
EXPO_PUBLIC_API_URL=https://tiernerd-api-dev-xxxx.run.app npm run web
```

Open `http://localhost:8081` and log in with the seeded dev credentials. `EXPO_PUBLIC_API_URL` also goes in `frontend/.env.local` to make it the default for every `npm run web`. Unset it to fall back to a backend on `localhost:8000`.

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

Testing against the deployed API:

```bash
cd frontend && EXPO_PUBLIC_API_URL=https://tiernerd-api-dev-xxxx.run.app npm run e2e
```

The URL is baked into the bundle at export time, so run `npm run build:web` first if the code changed. Playwright starts its own preview server on 8081 and never reuses an existing one, so stop any Metro dev server on that port — otherwise the spec fails on a port conflict instead of silently testing the dev-server bundle.

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
- `core/` — Pure utilities (security/argon2, constants, ranking algorithm, fractional index)
- `crud/` — Database operations
- `db/` — SQLAlchemy models and async database setup
- `schemas/` — Pydantic request/response models
- `settings.py` — Configuration via pydantic-settings

Module boundaries enforced by [tach](https://docs.gauge.sh/) (`fastapi/tach.toml`). Layering: `main → api → services → crud → db`. `api` may also call `crud` directly (endpoint handlers use `crud_*` helpers); this is intentional, not a violation. `core` is a pure leaf (constants, security, algorithm, fractional_index) reachable from `api`/`services`/`crud`. `schemas`/`settings`/`utils` are cross-cutting. Run `make backend-boundaries` (or `uv run tach check` in `fastapi/`) to verify.

### Frontend Structure (`frontend/src/`)

- `screens/` — Screen components (Login, Home, Lists, Profile)
- `navigation/` — React Navigation stack setup
- `providers/` — Context providers (AuthContext)
- `design-system/` — Reusable components and design tokens

### Key Patterns

- **Backend**: Async SQLAlchemy 2.0+, FastAPI dependency injection, JWT auth
- **Frontend**: Context API for state, token-based design system, TypeScript strict mode
- **Items**: Ordered via Base-62 fractional index `position` column (`app/core/fractional_index.py`)
- **Ranking**: Binary search algorithm in `app/core/algorithm.py`

### Database

- PostgreSQL with async (asyncpg)
- UUID primary keys throughout
- Schema managed via `Base.metadata.create_all` (`app/db/database.py`, `scripts/seed.py`) — no Alembic. Column type/constraint changes require a volume wipe (`make clean` + `make dev`).

## Development Notes for AI Agents

- Check for TypeScript errors after frontend changes.
- Google sign-in is real: the web client obtains a Google ID token and exchanges it at `POST /api/users/google`. Setting `EXPO_PUBLIC_USE_MOCK_AUTH=true` switches auth to mocks for frontend-only work.
- Comparison sessions are stored in-memory (not persistent).
- API endpoints are prefixed with `/api/`.
- Do **not** run `npm run ios`, `npm run android`, or `npx expo start` — the user runs these in a separate terminal.
- The browser target (`npm run web`, served at `http://localhost:8081`) is the primary frontend loop. If it is already serving, use it to verify UI changes instead of asking for a simulator run.
- The deployed dev API is the default backend for frontend work; point `npm run web` at it with `EXPO_PUBLIC_API_URL` instead of starting containers locally.
- Do **not** run `make cloud-deploy` unless asked — it mutates shared cloud state.
- Run `make frontend-e2e` after changing frontend behavior — it builds the web bundle first, then drives it with Playwright, so it needs an API to talk to (a local backend, or the deployed dev API via `frontend/.env.local`).
- Do **not** run `git commit`, `git add`, or `git push` — the user handles staging, committing, and pushing.
- Do **not** run `make clean`, `make dev`, `make fresh`, `make restart`, or `make reset` — the user runs these themselves.
- Backend package management: use `uv`, not `pip`.

## Documentation Automation

`README.md`, `fastapi/README.md`, and `frontend/README.md` are **generated** from templates in `docs/src/` by `scripts/build_docs.py`. Do not edit the generated files directly — edit the template or partial and re-render.

```bash
make docs-build    # render templates → generated files
make docs-check    # fail if generated docs are stale
```

Partials live in `docs/src/partials/` and are included with double-brace `include:partials/<name>.md` directives.

`AGENTS.md` is **not** generated — it is the hand-maintained source for agent guidance. The partials it inlines are shared with the generated READMEs, so a partial edit can leave this file stale; when you change a shared partial, update `AGENTS.md` by hand to match.
