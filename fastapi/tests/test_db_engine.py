"""Regression tests for the production engine configuration."""

import os
import subprocess
import sys
from pathlib import Path

FASTAPI_DIR = Path(__file__).resolve().parents[1]

PROBE = """
import inspect

import asyncpg

from app.db import database

sig = inspect.signature(asyncpg.connect)
bad = sorted(k for k in database.connect_args if k not in sig.parameters)
assert not bad, f"asyncpg.connect() rejects {bad}"
assert database.engine.pool.size() == 20, database.engine.pool.size()
"""


def test_production_connect_args_are_asyncpg_kwargs():
    """Pool sizing must reach create_async_engine, not asyncpg.connect()."""
    env = {
        **os.environ,
        "APP_ENV": "production",
        "SECRET_KEY": "test-secret-key-for-testing-only",
        "DATABASE_URL": "postgresql+asyncpg://user:pw@localhost:5432/db",
    }

    result = subprocess.run(  # noqa: S603  # fixed argv, no untrusted input
        [sys.executable, "-c", PROBE],
        cwd=FASTAPI_DIR,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
