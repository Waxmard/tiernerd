# Root Makefile — monorepo orchestrator.
# Backend targets delegate to fastapi/Makefile. Frontend targets call npm scripts.

.DEFAULT_GOAL := help
IOS_DEVICE ?= Gengar Phone

.PHONY: help
help:
	@echo "Setup:"
	@echo "  setup            - First-time install (root, frontend, backend, hooks)"
	@echo ""
	@echo "Quality (both projects):"
	@echo "  lint             - Lint backend + frontend"
	@echo "  fix              - Lint + autofix backend + frontend"
	@echo "  typecheck        - Typecheck backend + frontend"
	@echo "  test             - Run backend tests with coverage + frontend unit tests"
	@echo "  ci               - lint + typecheck + test + line-limit"
	@echo ""
	@echo "Backend (delegates to fastapi/Makefile):"
	@echo "  backend-<target> - any fastapi/Makefile target (e.g. backend-lint, backend-logs)"
	@echo ""
	@echo "Frontend (delegates to frontend/package.json scripts):"
	@echo "  frontend-lint frontend-fix frontend-typecheck"
	@echo "  ios             - Build, install and launch a standalone iOS Release app"
	@echo "  ios IOS_REUSE=1 - Install and launch the existing iOS build"

.PHONY: setup
setup:
	npm install
	cd frontend && npm install
	cd fastapi && uv sync --extra dev --group dev

.PHONY: lint fix typecheck test ci line-limit
lint:      backend-lint frontend-lint
fix:       backend-fix frontend-fix
typecheck: backend-typecheck frontend-typecheck
test:      backend-test frontend-unit scripts-test
ci:        backend-ci frontend-lint frontend-typecheck frontend-unit scripts-test line-limit

line-limit:
	@bash scripts/check-line-limit.sh

# ----- Backend: delegate any backend-* to fastapi/Makefile -----

backend-%:
	$(MAKE) -C fastapi $*

.PHONY: ios
ios:
	IOS_REUSE="$(IOS_REUSE)" EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID="$${EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID-1015723670625-v0h15l5cj1eotf9h4u539q878e2mclm6.apps.googleusercontent.com}" bash scripts/ios.sh "$(IOS_DEVICE)"

.PHONY: frontend-lint frontend-fix frontend-typecheck frontend-unit scripts-test
frontend-lint:
	cd frontend && npm run lint && npm run format:check

frontend-fix:
	cd frontend && npm run lint:fix && npm run format

frontend-typecheck:
	cd frontend && npm run typecheck

frontend-unit:
	cd frontend && npm run test:unit

scripts-test:
	node --test scripts/ios-config.test.mjs
