# Makefile for TierNerd FastAPI Backend

# Variables
IMAGE_NAME := tiernerd-backend
TAG := latest

# Help target
.PHONY: help
help:
	@echo "Available targets:"
	@echo ""
	@echo "Development:"
	@echo "  dev            - Build and run containers (use DETACHED=1 for background)"
	@echo "  restart        - Rebuild and restart"
	@echo "  fresh          - Rebuild, restart, and show logs"
	@echo "  logs           - View container logs"
	@echo "  stop           - Stop containers"
	@echo "  health         - Check health endpoint"
	@echo ""
	@echo "Database:"
	@echo "  reset          - Clear database and re-seed"
	@echo "  clean          - Remove containers, volumes, and images"
	@echo ""
	@echo "Build:"
	@echo "  build-local    - Build for current platform only (fast)"
	@echo "  build-multi    - Build for multiple platforms (amd64 + arm64)"
	@echo "  push           - Push multi-platform image to registry"
	@echo ""
	@echo "Code Quality:"
	@echo "  lint           - Ruff check + format check"
	@echo "  fix            - Ruff check --fix + format"
	@echo "  format         - Ruff format"
	@echo "  typecheck      - mypy"
	@echo "  boundaries     - tach module-boundary check"
	@echo "  test           - pytest with coverage (fail under 95%)"
	@echo "  ci             - lint + typecheck + boundaries + test"

# Code Quality
.PHONY: lint fix format typecheck boundaries test ci
lint:
	uv run ruff check app/ tests/
	uv run ruff format --check app/ tests/

fix:
	uv run ruff check app/ tests/ --fix
	uv run ruff format app/ tests/

format:
	uv run ruff format app/ tests/

typecheck:
	uv run mypy app/

boundaries:
	uv run tach check

test:
	uv run pytest --cov=app --cov-report=term-missing --cov-fail-under=95

ci: lint typecheck boundaries test

# Build for current platform only (faster for local development)
.PHONY: build-local
build-local:
	@if docker buildx version > /dev/null 2>&1; then \
		echo "Using buildx for optimized build..."; \
		docker buildx bake local; \
	else \
		echo "Using regular docker build..."; \
		docker build -t $(IMAGE_NAME):local .; \
	fi

# Build for multiple platforms (for sharing with teammates)
.PHONY: build-multi
build-multi:
	@if docker buildx version > /dev/null 2>&1; then \
		echo "Using buildx for multi-platform build..."; \
		docker buildx bake backend; \
	else \
		echo "Buildx not available, building for current platform only..."; \
		docker build -t $(IMAGE_NAME):latest .; \
	fi

# Build using docker-compose
.PHONY: build-compose
build-compose:
	COMPOSE_BAKE=true docker-compose build

# Run the application
.PHONY: run
run:
	docker-compose up

# Stop the application
.PHONY: stop
stop:
	docker-compose down

# View logs
.PHONY: logs
logs:
	docker-compose logs -f backend

# Clean up containers and images
.PHONY: clean
clean:
	docker-compose down -v --remove-orphans
	docker image rm $(IMAGE_NAME):latest $(IMAGE_NAME):local 2>/dev/null || true
	docker system prune -f

# Push to registry (requires REGISTRY variable)
.PHONY: push
push:
	@if [ -z "$(REGISTRY)" ]; then \
		echo "Error: REGISTRY variable not set. Use: make push REGISTRY=your-registry.com/"; \
		exit 1; \
	fi
	REGISTRY=$(REGISTRY) docker buildx bake multi --push

# Test build without caching
.PHONY: test-build
test-build:
	docker buildx bake backend --no-cache

# Setup buildx builder (run once)
.PHONY: setup-buildx
setup-buildx:
	docker buildx create --name multiplatform --driver docker-container --use
	docker buildx inspect --bootstrap

# Health check
.PHONY: health
health:
	curl -f http://localhost:8000/health || echo "Service not healthy"

# Dev commands
.PHONY: dev dev-down dev-logs restart fresh quick-restart
dev:
	make build-local
	@if [ "$(DETACHED)" = "1" ]; then \
		docker-compose up -d; \
	else \
		docker-compose up; \
	fi

dev-down:
	make stop

dev-logs:
	make logs

# Convenience commands
restart: build-local stop run
	@echo "Container rebuilt and restarted"

fresh: build-local stop run
	@echo "Container rebuilt and restarted, showing logs..."
	make logs

quick-restart: stop run
	@echo "Container restarted (no rebuild)"

# Database commands
.PHONY: reset
reset:
	@echo "Clearing database and re-seeding..."
	@if docker-compose ps backend | grep -q "Up"; then \
		docker-compose exec backend python scripts/seed.py --clear; \
	else \
		docker-compose run --rm backend python scripts/seed.py --clear; \
	fi

# --- Cloud Run ---------------------------------------------------------------
# GCLOUD_CONFIG keeps every cloud command on the tiernerd gcloud configuration,
# independent of which configuration is active in the caller's shell.
GCLOUD_CONFIG ?= tiernerd
GCLOUD := CLOUDSDK_ACTIVE_CONFIG_NAME=$(GCLOUD_CONFIG) gcloud

# CLOUD_ENV=dev (default) or prod. Selects the service, env file and secrets.
CLOUD_ENV ?= dev
GCP_PROJECT ?= tiernerd-dev
GCP_REGION ?= us-east1
CLOUD_SERVICE ?= tiernerd-api-$(CLOUD_ENV)
CLOUD_ENV_FILE := cloud/env.$(CLOUD_ENV).yaml
CLOUD_SECRET_PREFIX ?= tiernerd-$(CLOUD_ENV)

.PHONY: cloud-deploy cloud-url cloud-health cloud-logs
cloud-deploy:
	$(GCLOUD) run deploy $(CLOUD_SERVICE) \
		--source . \
		--project $(GCP_PROJECT) \
		--region $(GCP_REGION) \
		--allow-unauthenticated \
		--port 8000 \
		--cpu 1 --memory 512Mi \
		--min-instances 0 --max-instances 1 \
		--env-vars-file $(CLOUD_ENV_FILE) \
		--set-secrets SECRET_KEY=$(CLOUD_SECRET_PREFIX)-secret-key:latest,DATABASE_URL=$(CLOUD_SECRET_PREFIX)-database-url:latest

cloud-url:
	@$(GCLOUD) run services describe $(CLOUD_SERVICE) --project $(GCP_PROJECT) \
		--region $(GCP_REGION) --format='value(status.url)'

cloud-health:
	@curl -sf "$$($(GCLOUD) run services describe $(CLOUD_SERVICE) --project $(GCP_PROJECT) \
		--region $(GCP_REGION) --format='value(status.url)')/health" || echo "not healthy"

cloud-logs:
	$(GCLOUD) run services logs read $(CLOUD_SERVICE) --project $(GCP_PROJECT) \
		--region $(GCP_REGION) --limit 50
