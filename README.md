<!-- Generated from docs/src. Run `make docs-build` to update. Do not edit directly. -->

# TierNerd

TierNerd is a cross-platform mobile app for ranking items through 1v1 comparisons and displaying scores out of 10. Pick a starting range, then compare items to establish their order within it; each item's score follows from its position, and the highest scores come first.

```text
your items ──1v1 comparisons──▶ TierNerd ──▶ ranked list, scored out of 10
```

## Key Features

- Create custom lists on any topic
- Add items with descriptions and images
- Rank items through simple better/worse comparisons
- Eliminate arbitrary rating bias
- View ranked items best first with scores out of 10
- Choose a starting range: Great (7–10), Okay (4–7), or Bad (1–4)

## Screenshots

| Login | Home |
|:---:|:---:|
| ![Login](screenshots/login.png) | ![Home](screenshots/home-empty.png) |

See the [screenshots/](screenshots/) directory for all available screenshots.

## Technology

- **Frontend:** React Native with Expo (SDK 54)
- **Backend:** Python with FastAPI
- **Database:** PostgreSQL (async via asyncpg)
- **Auth:** JWT with argon2 password hashing

## Getting Started

### Frontend

```bash
cd frontend
npm install --legacy-peer-deps
npx expo start                    # Scan QR with Expo Go app
# or
npm run ios                       # iOS Simulator
```

### Backend

```bash
cd fastapi
make dev                          # Start with Docker (auto-seeds dev user)
```

See [frontend/README.md](frontend/README.md) and [fastapi/README.md](fastapi/README.md) for detailed setup instructions.

## Layout

|Path|What|
|---|---|
|`fastapi/`|FastAPI backend — async SQLAlchemy on PostgreSQL, with the comparison and ranking services|
|`frontend/`|Expo / React Native app (iOS, Android, web)|
|`docs/src/`|Templates and partials that generate this README and the sub-READMEs|
|`scripts/`|Repo-wide tooling — docs build, line-limit check, e2e backend|
|`screenshots/`|Screenshots referenced above|

## Scores out of 10

Each starting range defines a score band:

- **Great** (`good`): 7.0–10.0
- **Okay** (`mid`): 4.0–6.9
- **Bad** (`bad`): 1.0–3.9

When adding another item in the same range, choose the better item in each comparison. **Undo last answer** reverses the latest choice. Review the preview, then choose **Save ranking** to apply the position and reload canonical scores and order. The first item in an empty range is ranked immediately.

Select a row to view its description, image, score and overall rank. **Edit** changes its metadata; **Re-rank** lets you choose a destination range without changing the saved ranking until you save. **Delete Item** is separate from editing and requires confirmation.

Interrupted ranking drafts persist. Select the item and choose **Resume ranking**, or **Restart ranking** if ranked peers changed. Explicitly cancelling a new-item draft discards that item. Cancelling a re-ranking draft preserves the saved item and rank. Unranked items without a draft offer **Rank now**.

Item names are unique within a list across ranges, ignoring surrounding whitespace and Unicode case. Different lists can use the same name.

Deleting an item or list also discards its related active and completed comparison sessions. Sessions unrelated to the deleted item or list remain unchanged.

Within a band, comparisons order items from lowest to highest. Item `i` of `n` ranked items receives `round(low + (high - low) * (i + 0.5) / n, 1)`, where `i` starts at zero. A single Great item scores 8.5; two Great items score 7.8 and 9.2. Scores are relative to the ranked items in each band, not user-entered ratings.

The API stores scores in `rating`. An item without a position has a null score and is shown as **Not ranked yet**. Adding, removing or re-ranking items can change scores. Lists display ranked items best first by range and position, with unranked items last. Rounded scores can overlap at range boundaries.

Persistent PostgreSQL databases require the explicit UI-ranking schema migration before you run the updated application. See the backend migration instructions. Fresh test SQLite databases use current model metadata.

## Project Status

Currently in initial development phase.

## Documentation Automation

`README.md`, `fastapi/README.md`, and `frontend/README.md` are **generated** from templates in `docs/src/` by `scripts/build_docs.py`. Do not edit the generated files directly — edit the template or partial and re-render.

```bash
make docs-build    # render templates → generated files
make docs-check    # fail if generated docs are stale
```

Partials live in `docs/src/partials/` and are included with double-brace `include:partials/<name>.md` directives.

`AGENTS.md` is hand-maintained, not generated — it is the source of truth for agent-facing guidance.
