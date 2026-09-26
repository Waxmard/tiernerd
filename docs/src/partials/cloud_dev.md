### Cloud Dev Loop (Cloud Run + Neon)

The default backend for frontend work is a deployed dev API — no local containers.

```bash
cd frontend
EXPO_PUBLIC_API_URL=https://tiernerd-api-dev-xxxx.run.app npm run web
```

Open `http://localhost:8081` and log in with the seeded dev credentials. `EXPO_PUBLIC_API_URL` also goes in `frontend/.env.local` to make it the default for every `npm run web`. Unset it to fall back to a backend on `localhost:8000`.

Deploy (from `fastapi/`):

```bash
make cloud-deploy          # GCP_PROJECT/tiernerd-api-dev, CLOUD_ENV=dev
make cloud-url             # print the service URL
make cloud-health          # curl the deployed /health
make cloud-logs            # recent service logs
```

`CLOUD_ENV` selects the service, env file and secrets (`cloud/env.<env>.yaml`, `tiernerd-<env>-*`). Deploying a second environment needs its own secrets and env file and nothing else:

```bash
make cloud-deploy CLOUD_ENV=prod GCP_PROJECT=<prod-project>
```

Config lives in `fastapi/cloud/env.dev.yaml` (non-secret) and Secret Manager (`SECRET_KEY`, `DATABASE_URL`). `APP_ENV=development` is what makes the container create its tables and seed the dev users on startup; setting it to `production` disables that seeding and switches the SQLAlchemy pool settings in `app/db/database.py`.

`DATABASE_URL` must be `postgresql+asyncpg://…?ssl=require`. A Neon string's `?sslmode=require&channel_binding=require` crashes asyncpg (`unexpected keyword argument`), because SQLAlchemy forwards DSN query parameters to the driver as keyword arguments.

Testing against the deployed API:

```bash
cd frontend && EXPO_PUBLIC_API_URL=https://tiernerd-api-dev-xxxx.run.app npm run e2e
```

The URL is baked into the bundle at export time, so run `npm run build:web` first if the code changed. Playwright starts its own preview server on 8081 and never reuses an existing one, so stop any Metro dev server on that port — otherwise the spec fails on a port conflict instead of silently testing the dev-server bundle.

Local containers are now optional. The fallback loop is unchanged — `cd fastapi && make dev DETACHED=1` — except its Postgres publishes on host port 55432, not 5432:

```bash
psql -h localhost -p 55432 -U tiernerd tiernerd
```
