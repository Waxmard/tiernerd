"""Add the optional per-list color column.

Mirrors migrate_ui_ranking.py's CLI surface: read-only by default, `--apply` to
write. Idempotent — a database that already has the column exits 0 untouched.
"""

import argparse
import asyncio
import importlib
import sys
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


COLUMN_NAME = "color"
ADD_COLUMN_STATEMENT = "ALTER TABLE lists ADD COLUMN color VARCHAR(16)"


def _columns(connection: Connection) -> Mapping[str, Any]:
    return {
        column["name"]: column for column in inspect(connection).get_columns("lists")
    }


async def _has_color_column(connection: AsyncConnection) -> bool:
    return COLUMN_NAME in await connection.run_sync(_columns)


async def _run(apply: bool) -> int:
    settings = importlib.import_module("app.settings").get_settings()
    engine = create_async_engine(str(settings.DATABASE_URL), echo=False)
    try:
        async with engine.connect() as connection:
            if await _has_color_column(connection):
                print("lists.color already exists; nothing to do.")
                return 0
        if not apply:
            print("lists.color is missing; re-run with --apply to add it.")
            return 0

        async with engine.begin() as connection:
            if connection.dialect.name == "postgresql":
                await connection.execute(
                    text("LOCK TABLE lists IN ACCESS EXCLUSIVE MODE")
                )
            if await _has_color_column(connection):
                print("lists.color already exists; nothing to do.")
                return 0
            await connection.execute(text(ADD_COLUMN_STATEMENT))
    finally:
        await engine.dispose()
    print("Added lists.color.")
    return 0


def _arguments(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        epilog="Before --apply, stop the application and take a database backup."
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--apply", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _arguments(argv)
    try:
        return asyncio.run(_run(args.apply))
    except Exception:
        print("Migration failed; database error details suppressed.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
