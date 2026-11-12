# syntax=docker/dockerfile:1

# Multi-stage build for optimized image size
FROM python:3.14-slim@sha256:cd89c30eda26ee911a4611b18680086e0ea42e6f5f8cbe653d07fa7958c9cec8 AS builder

COPY --from=ghcr.io/astral-sh/uv:0.13.6 /uv /uvx /bin/

ENV UV_PYTHON=/usr/local/bin/python3
ENV UV_COMPILE_BYTECODE=1 UV_PYTHON_DOWNLOADS=never UV_LINK_MODE=copy

WORKDIR /app

COPY pyproject.toml uv.lock ./

# Install locked dependencies only; the project itself is copied below
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

FROM python:3.14-slim@sha256:cd89c30eda26ee911a4611b18680086e0ea42e6f5f8cbe653d07fa7958c9cec8

RUN useradd -m -u 1000 appuser \
    && install -d -o appuser -g appuser /app

WORKDIR /app

COPY --from=builder --chown=appuser:appuser /app/.venv /app/.venv

COPY --chown=appuser:appuser . .

USER appuser

ENV PATH="/app/.venv/bin:$PATH"

# Fail the build here, not at container start, if a runtime dep is missing
RUN python -c "import app, fastapi, uvicorn, sqlalchemy, asyncpg, pydantic_settings"

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

CMD ["/app/.venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
