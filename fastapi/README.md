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

The ranking service uses binary search in `app/services/comparison_service.py` to determine item positions through pairwise comparisons.

Draft sessions persist in the database. Answers and one-step undo update the draft, not the saved item. Comparisons use all other ranked items in the list. Commit applies the new position and recalculates scores across the list (see [Ranking lists](../README.md#ranking-lists) for the score formula). Unranked items have null positions and ratings. Mutation requests carry the current session revision; stale revisions or changed ranking snapshots return 409. Status reads expose stale drafts so the client can restart them.

Each list has a `ranking_mode` of `score` (the default) or `rank`. Set it when creating a list or updating its metadata. Both modes retain the same positions, ratings, and comparison workflow; switching modes changes presentation only.

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

Fresh databases use the current schema. For an existing database, back it up and stop the old backend before applying the photo schema migration. From `fastapi/`, inspect the schema:

```bash
uv run python scripts/migrate_list_photos.py --check
```

After the backup and application stop, apply the migration:

```bash
uv run python scripts/migrate_list_photos.py --apply
```

Interrupted saves or database writes with an uncertain outcome can leave unreferenced uploads. With the correct `DATABASE_URL`, `COVER_UPLOAD_BUCKET`, and Google Cloud credentials loaded, list objects older than 24 hours that are no longer referenced:

```bash
uv run python scripts/cleanup_list_cover_uploads.py
```

After reviewing the output and authorizing deletion, remove those objects:

```bash
uv run python scripts/cleanup_list_cover_uploads.py --apply
```

Do not configure a bucket-wide expiration policy: it would also remove attached photos.

## Upgrade the list-ranking mode schema

This PostgreSQL-only migration adds list display modes and repairs inconsistent stored scores without changing item positions. Back up the intended database and stop the old backend before applying it. Load `DATABASE_URL` from your environment's secret store; never put credentials in commands or tracked files. Confirm the API URL embedded in the iOS build before choosing a database. Fresh databases use the current model schema; `create_all` does not upgrade existing tables.

For an older database, first run the [UI-ranking migration](#upgrade-the-ui-ranking-schema) if needed, then the [overall-ranking migration](#upgrade-the-overall-ranking-schema) if category columns remain. Do not treat overlapping category positions as one list order. If the unified schema already has incorrect scores, use the migration below to repair them instead of the overall migration's no-op check.

From `fastapi/`, inspect the schema and count incorrect ratings without changing data:

```bash
uv run python scripts/migrate_list_ranking_mode.py --check
```

The preflight rejects partial or incompatible schemas and ambiguous item order. Resolve any reported problem before continuing. The default mode is also read-only.

After preflight succeeds, the backup exists, and the old backend is stopped, apply the migration and repeat it to verify a no-op:

```bash
uv run python scripts/migrate_list_ranking_mode.py --apply
uv run python scripts/migrate_list_ranking_mode.py --apply
```

The migration preserves existing valid mode choices, item order, metadata and sessions. It recalculates incorrect ratings in a locked transaction and rolls back if verification fails.

Deploy the matching backend after the migration. For the default development API, run `make cloud-deploy CLOUD_ENV=dev` from `fastapi/`; use a different target only if the app is configured for it. Refresh the affected list against that API and confirm its top saved score is 10.0. Then run a fresh `make ios` from the repository root and confirm the device displays 10.0 without a suffix. A client build alone does not migrate or deploy the backend.

## Upgrade the overall-ranking schema

This PostgreSQL-only migration changes stored positions and scores and cancels active ranking drafts. Back up the intended database and stop the old backend before applying it. Load `DATABASE_URL` from your platform secret store; never put credentials in commands or tracked files. The [UI-ranking migration](#upgrade-the-ui-ranking-schema) is a prerequisite for databases that have not already applied it. Fresh databases use the current model schema; `create_all` does not upgrade existing tables.

From `fastapi/`, run the read-only preflight (the default mode is also read-only):

```bash
uv run python scripts/migrate_overall_ranking.py --check
```

Resolve any reported missing or unknown categories on ranked items, or duplicate positions within a category, before continuing. The migration rejects unsupported or partially upgraded schemas.

After preflight succeeds, the backup exists, and the old backend is stopped, apply the migration:

```bash
uv run python scripts/migrate_overall_ranking.py --apply
```

The migration preserves items and their existing best-first order, recalculates scores across each list, and removes category columns. Active and ready-to-commit drafts are cancelled without deleting their candidate items. The migration verifies the result in a locked transaction; failure rolls it back. Reapplying it verifies the upgraded schema and is a no-op. Deploy the matching backend and client after the migration; do not restart the old backend against the upgraded schema.

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
