"""Add the optional per-list appearance columns (color, icon, cover).

Read-only by default, `--apply` to write. Idempotent — a database that already
has all columns exits 0 untouched.
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


APPEARANCE_COLUMNS = ("color", "icon", "cover")


def _columns(connection: Connection) -> Mapping[str, Any]:
    return {
        column["name"]: column for column in inspect(connection).get_columns("lists")
    }


async def _missing_columns(connection: AsyncConnection) -> list[str]:
    existing = await connection.run_sync(_columns)
    return [col for col in APPEARANCE_COLUMNS if col not in existing]


async def _run(apply: bool) -> int:
    settings = importlib.import_module("app.settings").get_settings()
    engine = create_async_engine(str(settings.DATABASE_URL), echo=False)
    try:
        async with engine.connect() as connection:
            missing = await _missing_columns(connection)
            if not missing:
                print("lists appearance columns already exist; nothing to do.")
                return 0
        if not apply:
            print(
                f"lists appearance columns missing ({', '.join(missing)}); "
                "re-run with --apply to add them."
            )
            return 0

        async with engine.begin() as connection:
            if connection.dialect.name == "postgresql":
                await connection.execute(
                    text("LOCK TABLE lists IN ACCESS EXCLUSIVE MODE")
                )
            missing = await _missing_columns(connection)
            if not missing:
                print("lists appearance columns already exist; nothing to do.")
                return 0
            for column_name in missing:
                await connection.execute(
                    text(f"ALTER TABLE lists ADD COLUMN {column_name} VARCHAR(16)")
                )
    finally:
        await engine.dispose()
    print(f"Added lists appearance columns: {', '.join(missing)}.")
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
