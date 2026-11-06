#!/bin/bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -n "${SKIP_DEPLOY:-}" && "${SKIP_DEPLOY}" != 0 ]]; then
  echo 'Skipping the backend deploy (SKIP_DEPLOY set).'
elif [[ -n "${CI:-}" && "${CI}" != 0 ]]; then
  echo 'Skipping the backend deploy (CI set).'
elif [[ -n "${EXPO_PUBLIC_API_URL:-}" && "${EXPO_PUBLIC_API_URL}" != *tiernerd-api-dev* ]]; then
  echo "Skipping the backend deploy: the app will target ${EXPO_PUBLIC_API_URL}."
else
  make -C "$root/fastapi" cloud-deploy-if-needed
fi
