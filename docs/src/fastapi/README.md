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

{{ include:partials/dev_credentials.md }}

## API Documentation

- **Swagger UI**: <http://localhost:8000/docs>
- **ReDoc**: <http://localhost:8000/redoc>

## API Structure

The API is structured around the following resources:

- `/api/users` — User management and authentication
- `/api/lists` — List creation and management
- `/api/items` — Item management and ranking

{{ include:partials/backend_commands.md }}

{{ include:partials/cloud_dev.md }}

{{ include:partials/backend_testing.md }}

## Project Structure

```
app/
├── api/endpoints/   # Route handlers
├── core/            # Auth, security, algorithms
├── crud/            # Database operations
├── db/              # Models and database setup
├── schemas/         # Pydantic request/response models
└── settings.py      # Configuration
```

## Tech Stack

- **FastAPI** — Web framework
- **PostgreSQL** — Database (via asyncpg)
- **SQLAlchemy 2.0** — Async ORM
- **JWT** — Authentication
- **Docker** — Containerization

## Ranking Algorithm

The ranking algorithm is implemented in `app/core/algorithm.py` and uses binary search to efficiently determine item positions through pairwise comparisons.

{{ include:partials/docs_automation.md }}
