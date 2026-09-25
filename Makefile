# Root Makefile — monorepo orchestrator.
# Backend targets delegate to fastapi/Makefile. Frontend targets call npm scripts.

.DEFAULT_GOAL := help

.PHONY: help
help:
	@echo "Setup:"
	@echo "  setup            - First-time install (root, frontend, backend, hooks)"
	@echo ""
	@echo "Quality (both projects):"
	@echo "  lint             - Lint backend + frontend"
	@echo "  fix              - Lint + autofix backend + frontend"
	@echo "  typecheck        - Typecheck backend + frontend"
	@echo "  test             - Run backend tests with coverage"
	@echo "  ci               - lint + typecheck + test + docs-check"
	@echo ""
	@echo "Docs (rendered from docs/src):"
	@echo "  docs-build       - Render docs/src → README.md, CLAUDE.md, AGENTS.md, sub-READMEs"
	@echo "  docs-check       - Fail if generated docs are stale"
	@echo ""
	@echo "Backend (delegates to fastapi/Makefile):"
	@echo "  backend-<target> - any fastapi/Makefile target (e.g. backend-lint, backend-logs)"
	@echo ""
	@echo "Frontend (delegates to frontend/package.json scripts):"
	@echo "  frontend-lint frontend-fix frontend-typecheck"
	@echo "  frontend-e2e     - Playwright smoke spec against the web bundle"

# ----- Setup -----

.PHONY: setup
setup:
	npm install
	cd frontend && npm install
	cd fastapi && uv sync --extra dev --group dev

# ----- Aggregate -----

.PHONY: lint fix typecheck test ci
lint:      backend-lint frontend-lint
fix:       backend-fix frontend-fix
typecheck: backend-typecheck frontend-typecheck
test:      backend-test
ci:        backend-ci frontend-lint frontend-typecheck docs-check

# ----- Docs (generated from docs/src) -----

.PHONY: docs-build docs-check
docs-build:
	mise exec -- python3 scripts/build_docs.py --write

docs-check:
	mise exec -- python3 scripts/build_docs.py --check

# ----- Backend: delegate any backend-* to fastapi/Makefile -----

backend-%:
	$(MAKE) -C fastapi $*

# ----- Frontend -----

.PHONY: frontend-lint frontend-fix frontend-typecheck frontend-e2e
frontend-lint:
	cd frontend && npm run lint && npm run format:check

frontend-fix:
	cd frontend && npm run lint:fix && npm run format

frontend-typecheck:
	cd frontend && npm run typecheck

frontend-e2e:
	@if [ -z "$$EXPO_PUBLIC_API_URL" ]; then \
		curl -sf http://localhost:8000/health >/dev/null || { echo "backend not running — run: cd fastapi && make dev DETACHED=1, or set EXPO_PUBLIC_API_URL to a deployed API"; exit 1; }; \
	fi
	cd frontend && npm run e2e
