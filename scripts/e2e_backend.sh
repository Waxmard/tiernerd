#!/bin/bash
# Boots a throwaway SQLite backend and runs a command against it. This is the
# backend the E2E job in .github/workflows/e2e.yml uses, and the one
# `make frontend-e2e` uses. With no arguments it builds the web bundle and runs
# the frontend smoke spec against that backend.
#
# Usage:
#   scripts/e2e_backend.sh                # build web bundle + run the e2e spec
#   scripts/e2e_backend.sh <cmd> [args]   # any command, with EXPO_PUBLIC_API_URL set
#
# Env: E2E_BACKEND_PORT pins the port (default: a free one).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
port="${E2E_BACKEND_PORT:-$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')}"
api_url="http://localhost:$port"
health_url="http://127.0.0.1:$port"
db_dir="$(mktemp -d)"
backend_pid=""

cleanup() {
  [[ -n "$backend_pid" ]] && kill "$backend_pid" 2>/dev/null
  rm -rf "$db_dir"
}
trap cleanup EXIT

cd "$root/fastapi"
uv sync --extra dev --group dev
DATABASE_URL="sqlite+aiosqlite:///$db_dir/e2e.db" \
  APP_ENV=development \
  SECRET_KEY=e2e-backend-secret \
  CORS_ORIGINS_STR="http://localhost:8081" \
  uv run uvicorn app.main:app --host 127.0.0.1 --port "$port" --log-level warning &
backend_pid=$!

for _ in $(seq 1 60); do
  curl -sf "$health_url/health" >/dev/null && break
  kill -0 "$backend_pid" 2>/dev/null || {
    echo "backend exited before becoming healthy" >&2
    exit 1
  }
  sleep 1
done
curl -sf "$health_url/health" >/dev/null || {
  echo "backend did not become healthy on $health_url" >&2
  exit 1
}

echo "e2e backend: $api_url (sqlite, seeded dev users)"
export EXPO_PUBLIC_API_URL="$api_url"

if [[ $# -gt 0 ]]; then
  "$@"
else
  cd "$root/frontend"
  npm run build:web
  npm run e2e
fi
