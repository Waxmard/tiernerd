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
	@echo "  test             - Run backend tests with coverage + frontend unit tests"
	@echo "  ci               - lint + typecheck + test + docs-check + line-limit"
	@echo ""
	@echo "Docs (rendered from docs/src):"
	@echo "  docs-build       - Render docs/src → README.md, sub-READMEs"
	@echo "  docs-check       - Fail if generated docs are stale"
	@echo ""
	@echo "Backend (delegates to fastapi/Makefile):"
	@echo "  backend-<target> - any fastapi/Makefile target (e.g. backend-lint, backend-logs)"
	@echo ""
	@echo "Frontend (delegates to frontend/package.json scripts):"
	@echo "  frontend-lint frontend-fix frontend-typecheck"
	@echo "  frontend-e2e     - Playwright smoke spec against the built web bundle"

# ----- Setup -----

.PHONY: setup
setup:
	npm install
	cd frontend && npm install
	cd fastapi && uv sync --extra dev --group dev

# ----- Aggregate -----

.PHONY: lint fix typecheck test ci line-limit
lint:      backend-lint frontend-lint
fix:       backend-fix frontend-fix
typecheck: backend-typecheck frontend-typecheck
test:      backend-test frontend-unit
ci:        backend-ci frontend-lint frontend-typecheck frontend-unit docs-check line-limit

# ----- Source hygiene -----

line-limit:
	@bash scripts/check-line-limit.sh

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

.PHONY: frontend-lint frontend-fix frontend-typecheck frontend-unit frontend-e2e
frontend-lint:
	cd frontend && npm run lint && npm run format:check

frontend-fix:
	cd frontend && npm run lint:fix && npm run format

frontend-typecheck:
	cd frontend && npm run typecheck

frontend-unit:
	cd frontend && npm run test:unit

frontend-e2e:
	@if [ -n "$$EXPO_PUBLIC_API_URL" ]; then \
		echo "frontend-e2e: against $$EXPO_PUBLIC_API_URL"; \
		cd frontend && npm run build:web && npm run e2e; \
	else \
		scripts/e2e_backend.sh; \
	fi
