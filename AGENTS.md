# Repository Guidelines

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

## Development Commands

### Root (cross-project)

```bash
make help          # list all targets
make lint          # backend + frontend lint
make fix           # autofix both
make typecheck     # mypy + tsc
make test          # backend pytest w/ coverage + frontend unit + scripts tests
make ci            # lint + typecheck + boundaries + test + line-limit
make backend-<X>   # delegates to fastapi/Makefile target X (e.g. backend-logs, backend-health, backend-lint)
```

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

The command uses development Google OAuth client IDs by default. Override the iOS client with `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` (bundle ID `com.maxwellward.tiernerd`) and the web client with `EXPO_PUBLIC_GOOGLE_CLIENT_ID`, which must match the backend's `GOOGLE_CLIENT_ID`. Read the [standalone procedure](frontend/README.md#option-1-standalone-ios-release-physical-iphone) before replacing an installed app. `npm run ios` remains the separate Expo development command.

For a local TestFlight upload, run `make testflight`; see [Deploys & Releases](CONTRIBUTING.md#deploys--releases) for the trigger, build numbering, and signing credentials.

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

`make ios` deploys the dev backend while it builds and installs the app only after the deploy succeeds or is skipped. It skips the deploy when a fingerprint of the backend inputs (`app/`, `scripts/`, `pyproject.toml`, `uv.lock`, `Dockerfile`, `cloudbuild.yaml`, `cloud/env.dev.yaml`) matches the last successful deploy. Without that step the app under test is local JavaScript against whatever code dev happens to be running, which is how a stale dev backend once surfaced as an app bug. `SKIP_DEPLOY=1` builds without deploying, and pointing `EXPO_PUBLIC_API_URL` at another API skips it too. A local `make testflight` deploys the same way; hosted release uploads and simulator smoke runs skip it because CI sets `CI`.

The dev Cloud Run service has a service-level minimum of one instance to reduce cold starts. This is separate from the deploy recipe's revision-level `--min-instances 0` and incurs ongoing idle costs (estimated at $9.72/month before free-tier credits and active traffic).

Deploy (from `fastapi/`):

```bash
make cloud-deploy          # GCP_PROJECT/tiernerd-api-dev, CLOUD_ENV=dev
make cloud-deploy-if-needed # deploy only if the backend inputs changed
make cloud-url             # print the service URL
make cloud-health          # curl the deployed /health
make cloud-logs            # recent service logs
```

Dev is the only environment, and testers use it too. Its database holds real user data: never wipe or reset it.

Config lives in `fastapi/cloud/env.dev.yaml` (non-secret) and Secret Manager (`SECRET_KEY`, `DATABASE_URL`). `APP_ENV=development` is what makes the container create its tables and seed the dev users on startup; setting it to `production` disables that seeding and switches the SQLAlchemy pool settings in `app/db/database.py`.

`DATABASE_URL` must be `postgresql+asyncpg://…?ssl=require`. A Neon string's `?sslmode=require&channel_binding=require` crashes asyncpg (`unexpected keyword argument`), because SQLAlchemy forwards DSN query parameters to the driver as keyword arguments.

Local containers are now optional. The fallback loop is unchanged — `cd fastapi && make dev DETACHED=1` — except its Postgres publishes on host port 55432, not 5432:

```bash
psql -h localhost -p 55432 -U tiernerd tiernerd
```

### Git Hooks

[Lefthook](https://lefthook.dev/) runs the pre-commit hooks in `lefthook.yml` in parallel on staged files: biome, ruff, tach and the line-limit check. Autofixed files are re-staged. Hooks install via the root `prepare` script when you run `npm install`.

## Architecture

### Backend Structure (`fastapi/app/`)

- `api/endpoints/` — Route handlers (users, lists, items)
- `services/` — Business logic (auth/JWT, list, ranking placement, covers)
- `core/` — Pure utilities (constants, fractional index)
- `crud/` — Database operations
- `db/` — SQLAlchemy models and async database setup
- `schemas/` — Pydantic request/response models
- `settings.py` — Configuration via pydantic-settings

Module boundaries enforced by [tach](https://docs.gauge.sh/) (`fastapi/tach.toml`). Layering: `main → api → services → crud → db`. `api` may also call `crud` directly (endpoint handlers use `crud_*` helpers); this is intentional, not a violation. `core` is a pure leaf (constants, fractional_index) reachable from `api`/`services`/`crud`. `schemas`/`settings` are cross-cutting. Run `make backend-boundaries` (or `uv run tach check` in `fastapi/`) to verify.

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
- **Offline**: The client keeps an AsyncStorage outbox (`frontend/src/services/syncQueue.ts`) and cache (`localLibrary.ts`); creates accept client-generated `list_id`/`item_id`
- **Ranking**: The client runs the binary search; `PUT /api/lists/{id}/ranking` stores the chosen gap in `app/services/ranking.py`

### Database

- PostgreSQL with async (asyncpg)
- UUID primary keys throughout
- Fresh schemas use `Base.metadata.create_all` (`app/db/database.py`, `scripts/seed.py`) — no Alembic. Startup (`create_tables`) also adds missing additive columns, drops the retired `lists.cover`/`lists.cover_photo`/`lists.color` columns, and applies the manual-rating migration. The Google auth migration stays manual (see the [backend README](fastapi/README.md#upgrade-the-google-authentication-schema)); it permanently removes password hashes, so back it up first and do not wipe application data.

## Development Notes for AI Agents

- Google is the only sign-in method: the client obtains a Google ID token and exchanges it at `POST /api/users/google`.
- Ranking drafts live on the client; the server stores only the final ranking gap (`PUT /api/lists/{id}/ranking`).
- API endpoints are prefixed with `/api/`.
- Do **not** run `npm run ios` or `npx expo start` — the user runs these in a separate terminal.
- Do **not** run `make cloud-deploy` by hand unless asked — it always mutates shared cloud state. See [Cloud Dev Loop](#cloud-dev-loop-cloud-run--neon) for when `make ios` deploys.
- Run `make test` and `make typecheck` (or `make ci`) after changing frontend behavior.
- Do **not** run `git commit`, `git add`, or `git push` — the user handles staging, committing, and pushing.

## Documentation

`README.md`, `fastapi/README.md`, `frontend/README.md`, and `AGENTS.md` are all hand-maintained. Edit them directly; there is no template, partial, or render step.
