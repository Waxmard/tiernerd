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

Development startup seeds accounts for fixture data, not password sign-in. Sign in on iOS with a verified Google account. The Google account email must match an existing account to access its saved data.

## API Documentation

- **Swagger UI**: <http://localhost:8000/docs>
- **ReDoc**: <http://localhost:8000/redoc>

## API Structure

The API is structured around the following resources:

- `/api/users` — User management and authentication
- `/api/lists` — List creation and management
- `/api/items` — Item management and ranking

### Backend commands

Setup, quality targets and the Cloud Run dev loop: see [AGENTS.md](../AGENTS.md#backend-fastapi).

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

Module layout, layering and the tach boundary rule: see [AGENTS.md](../AGENTS.md#backend-structure-fastapiapp).

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
