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

- `/api/users` — User management and authentication
- `/api/lists` — List creation and management
- `/api/items` — Item management
- `/api/ai` — Emoji and item/list suggestions

List creates and updates send their fields as JSON in a multipart `metadata` part.

### Backend commands

Setup and quality targets: see [AGENTS.md](../AGENTS.md#backend-fastapi). Cloud Run dev loop: see [Cloud Dev Loop](../AGENTS.md#cloud-dev-loop-cloud-run--neon).

## Testing

- **Framework**: `pytest` with `pytest-asyncio` for async support
- **Test Database**: SQLite in-memory for fast, isolated tests
- **HTTP Client**: `httpx.AsyncClient` for endpoint testing
- **Tests**: Test modules and fixtures live in `tests/`.

```bash
uv sync --locked                                    # Install deps incl. dev group
uv run pytest tests/test_users.py -v                # Single file
uv run pytest tests/test_users.py -k google           # Google sign-in tests
uv run pytest --cov=app --cov-report=html           # Coverage report
```

## Project Structure

Module layout, layering and the tach boundary rule: see [AGENTS.md](../AGENTS.md#backend-structure-fastapiapp).

## Ranking Algorithm

The client runs the binary search over a list's other ranked items and sends the resulting gap; the server owns storage. `PUT /api/lists/{list_id}/ranking` with `{"item_id": "...", "gap": n}` places the item so that `n` worse-ranked peers sit below it (`0` is worst, the ranked item count is best). The server clamps the gap to the current peers, generates a fractional position key between the neighbours, and recalculates scores across the list (see [Ranking lists](../README.md#ranking-lists) for how scores work). Replaying the same request against an unchanged list keeps the same order. Item creation (`POST /api/items/?list_id=`) takes the same `gap`; every item always has a position and rating.

Creates accept client-generated ids so a retried request is safe: `POST /api/lists/` reads an optional `list_id` from the list metadata, and `POST /api/items/?list_id=` reads an optional `item_id` in the body. A request that reuses the caller's own id returns the stored row instead of creating a duplicate; an id owned by someone else returns 409. This is what lets the mobile client queue mutations offline and replay them later.

Each list has a `ranking_mode` of `score` (the default) or `rank`. Set it when creating a list or updating its metadata. Both modes retain the same positions and ratings; switching modes changes presentation only.

## Configure the background photo

A user can upload one background photo with `PUT /api/users/me/background` (multipart part `file`); `DELETE /api/users/me/background` removes it and `GET /api/users/me/background/{photo_id}` serves it to its owner. Set `COVER_UPLOAD_BUCKET` to a private Google Cloud Storage bucket with uniform access and public access prevention. Grant the runtime identity object read, write, and delete access only on that bucket. Without the setting, uploads return an unavailable response.

Interrupted saves or database writes with an uncertain outcome can leave unreferenced uploads. With the correct `DATABASE_URL`, `COVER_UPLOAD_BUCKET`, and Google Cloud credentials loaded, list objects older than 24 hours that are no longer referenced:

```bash
uv run python scripts/cleanup_photo_uploads.py
```

After reviewing the output and authorizing deletion, remove those objects:

```bash
uv run python scripts/cleanup_photo_uploads.py --apply
```

Do not configure a bucket-wide expiration policy: it would also remove attached photos.

## Schema changes

Startup runs `create_all` only: it creates missing tables and never alters existing ones. Apply schema changes to an existing database by hand, and do not wipe application data to fix a schema mismatch.
