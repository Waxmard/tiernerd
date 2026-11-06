"""Regression tests for the production engine configuration."""

import asyncio
import os
import shutil
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


async def test_cloud_deploy_preserves_existing_secret_mappings():
    make = shutil.which("make")
    assert make is not None
    for secret in ("", "photo-secret"):
        process = await asyncio.create_subprocess_exec(
            make,
            "-n",
            "cloud-deploy",
            "CLOUD_SECRET_PREFIX=tiernerd-test",
            f"UNSPLASH_SECRET={secret}",
            cwd=FASTAPI_DIR,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await process.communicate()
        assert process.returncode == 0, stderr.decode()
        command = stdout.decode()
        assert "--set-secrets" not in command
        assert "--clear-secrets" not in command
        assert "--remove-secrets" not in command
        mappings = command.split("--update-secrets ", 1)[1].split()[0]
        expected = (
            "SECRET_KEY=tiernerd-test-secret-key:latest,"
            "DATABASE_URL=tiernerd-test-database-url:latest"
        )
        if secret:
            expected += ",UNSPLASH_ACCESS_KEY=photo-secret:latest"
        assert mappings == expected
