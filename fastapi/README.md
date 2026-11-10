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
- `/api/items` — Item management and ranking

List writes use multipart `metadata` and an optional image file. Older clients can create lists with `name` and `description` query parameters and optional `color` and `ranking_mode` parameters. They can update `title`, `description`, or `ranking_mode` with JSON.

### Backend commands

Setup, quality targets and the Cloud Run dev loop: see [AGENTS.md](../AGENTS.md#backend-fastapi).

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

The client runs the binary search over a list's other ranked items and sends the resulting gap; the server owns storage. `PUT /api/lists/{list_id}/ranking` with `{"item_id": "...", "gap": n}` places the item so that `n` worse-ranked peers sit below it (`0` is worst, the ranked item count is best). The server clamps the gap to the current peers, generates a fractional position key between the neighbours, and recalculates scores across the list (see [Ranking lists](../README.md#ranking-lists) for how scores work). Replaying the same request against an unchanged list keeps the same order. Unranked items have null positions and ratings.

Creates accept client-generated ids so a retried request is safe: `POST /api/lists/` reads an optional `list_id` from the list metadata, and `POST /api/items/?list_id=` reads an optional `item_id` in the body. A request that reuses the caller's own id returns the stored row instead of creating a duplicate; an id owned by someone else returns 409. This is what lets the mobile client queue mutations offline and replay them later.

Each list has a `ranking_mode` of `score` (the default) or `rank`. Set it when creating a list or updating its metadata. Both modes retain the same positions and ratings; switching modes changes presentation only.

## Configure list cover photos

Photo search needs an Unsplash developer application and its access key. On macOS, store the key in Keychain:

```bash
security add-generic-password -s tiernerd:unsplash-access-key -a "$USER" -T "" -w
```

Load it at the point of use. Each read asks for Keychain approval.

```bash
export UNSPLASH_ACCESS_KEY="$(security find-generic-password -s tiernerd:unsplash-access-key -a "$USER" -w)"
```

For uploads, set `COVER_UPLOAD_BUCKET` to a private Google Cloud Storage bucket with uniform access and public access prevention. Grant the runtime identity object read, write, and delete access only on that bucket. Hosted environments load the Unsplash key from Secret Manager. Without the corresponding setting, uploads return an unavailable response and the app hides photo search, which reappears on the next picker open once the key is configured.

To configure or change the hosted Unsplash key, pass its Secret Manager name to `make cloud-deploy UNSPLASH_SECRET=<secret-name>`. Later deployments preserve the configured mapping when you omit the option.

Fresh databases use the current schema, and application startup adds the photo column to existing databases.

Interrupted saves or database writes with an uncertain outcome can leave unreferenced uploads. With the correct `DATABASE_URL`, `COVER_UPLOAD_BUCKET`, and Google Cloud credentials loaded, list objects older than 24 hours that are no longer referenced:

```bash
uv run python scripts/cleanup_list_cover_uploads.py
```

After reviewing the output and authorizing deletion, remove those objects:

```bash
uv run python scripts/cleanup_list_cover_uploads.py --apply
```

Do not configure a bucket-wide expiration policy: it would also remove attached photos.

## Upgrade manual ratings and automatic startup migrations

Application startup now applies these upgrades automatically. `create_tables` drops the retired `comparison_sessions` table, adds any missing additive columns (`users.photo_url`, `lists.color`, `lists.icon`, `lists.cover`, `lists.cover_photo`, `lists.ranking_mode`, `items.manual_rating`), and runs the manual-rating migration, which recalculates `items.rating` to the current score curve.

The manual-rating script remains available for preflight checks or an offline upgrade of an older schema. Back up the intended database and stop the application before applying it. From `fastapi/`, inspect the schema and count incorrect ratings without changing data:

```bash
uv run python scripts/migrate_manual_ratings.py --check
```

After the backup exists and the application is stopped, apply it:

```bash
uv run python scripts/migrate_manual_ratings.py --apply
```

`--check` reports whether `items.manual_rating` exists and how many rows need score updates. `--apply` adds the column if missing, rescales scores in a locked transaction, verifies the result, and rolls back on failure. Reapplying it is a no-op.

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
