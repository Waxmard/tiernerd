import argparse
import asyncio
import importlib
import sys
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _has_column(connection: Connection) -> bool:
    return any(
        column["name"] == "cover_photo"
        for column in inspect(connection).get_columns("lists")
    )


async def _run(apply: bool) -> int:
    settings = importlib.import_module("app.settings").get_settings()
    engine = create_async_engine(str(settings.DATABASE_URL), echo=False)
    try:
        async with engine.connect() as connection:
            if await connection.run_sync(_has_column):
                print("lists cover_photo column already exists; nothing to do.")
                return 0
        if not apply:
            print("lists cover_photo column missing; re-run with --apply to add it.")
            return 0

        async with engine.begin() as connection:
            if connection.dialect.name == "postgresql":
                await connection.execute(
                    text("LOCK TABLE lists IN ACCESS EXCLUSIVE MODE")
                )
            if await connection.run_sync(_has_column):
                print("lists cover_photo column already exists; nothing to do.")
                return 0
            await connection.execute(
                text("ALTER TABLE lists ADD COLUMN cover_photo JSON")
            )
    finally:
        await engine.dispose()
    print("Added lists cover_photo column.")
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
