# TierNerd

{{ include:partials/overview.md }}

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

{{ include:partials/tech_stack.md }}

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

{{ include:partials/tier_system.md }}

## Project Status

Currently in initial development phase.

{{ include:partials/docs_automation.md }}
