<!-- Generated from docs/src. Run `make docs-build` to update. Do not edit directly. -->

# TierNerd

TierNerd is a cross-platform mobile app for creating ranked tier lists (S–F) through 1v1 comparisons. Rather than asking users to assign subjective numerical scores, the app presents pairs of items and asks which is better. Through a series of binary choices, each item finds its proper place and receives a numeric rating that is then mapped to an intuitive tier (S, A, B, C, D, F).

## Key Features

- Create custom lists on any topic
- Add items with descriptions and images
- Rank items through simple better/worse comparisons
- Eliminate arbitrary rating bias
- View results as both ordered lists and intuitive tier rankings (S–F)
- Understand at a glance which items are top-tier (S) vs lower tiers

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

## Tier Ranking System

TierNerd uses a standardized tier ranking system common in gaming and competitive communities:

- **S Tier**: The absolute best items (exceptional)
- **A Tier**: Excellent items (above average)
- **B Tier**: Good items (slightly above average)
- **C Tier**: Average items (balanced)
- **D Tier**: Below average items
- **F Tier**: The lowest ranked items

While the underlying algorithm assigns numeric values, users interact with this intuitive tier system for easier comprehension and comparison.

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
