<!-- Generated from docs/src. Run `make docs-build` to update. Do not edit directly. -->

# TierNerd

TierNerd is a cross-platform mobile app for ranking items through 1v1 comparisons and displaying scores out of 10. Pick a starting range, then compare items to establish their order within that range. Ranked items receive a score based on their position and appear best first.

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

## Scores out of 10

Each starting range defines a score band:

- **Great** (`good`): 7.0–10.0
- **Okay** (`mid`): 4.0–7.0
- **Bad** (`bad`): 1.0–4.0

When adding another item in the same range, choose the better item in each comparison until ranking finishes. The list then reloads its scores and order. Select an item to edit it or choose **Delete Item**; confirm deletion to remove it and recalculate the remaining scores.

Deleting an item or list also discards its related active and completed comparison sessions. Sessions unrelated to the deleted item or list remain unchanged.

Within a band, comparisons order items from lowest to highest. Item `i` of `n` ranked items receives `round(low + (high - low) * (i + 0.5) / n, 1)`, where `i` starts at zero. A single Great item scores 8.5; two Great items score 7.8 and 9.2. Scores are relative to the ranked items in each band, not user-entered ratings.

The API stores scores in `rating`. Items without a position remain unranked with a null score and are excluded from scoring. Adding a ranked item or deleting one recalculates the band's scores. Lists display ranked items best first.

Existing development items with null ratings remain hidden until their band is rescored. Removing the old `tier` model field does not require a database wipe: existing nullable columns are ignored.

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
