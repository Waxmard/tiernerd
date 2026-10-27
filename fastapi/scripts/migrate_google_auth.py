import argparse
import asyncio
import importlib
import sys
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.exc import NoSuchTableError
from sqlalchemy.ext.asyncio import create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _columns(connection: Connection) -> set[str]:
    return {column["name"] for column in inspect(connection).get_columns("users")}


def _changes(columns: set[str]) -> list[str]:
    changes = []
    if "photo_url" not in columns:
        changes.append("add users.photo_url")
    if "password_hash" in columns:
        changes.append("discard users.password_hash")
    return changes


async def _run(apply: bool) -> int:
    settings = importlib.import_module("app.settings").get_settings()
    engine = create_async_engine(str(settings.DATABASE_URL), echo=False)
    try:
        async with engine.connect() as connection:
            columns = await connection.run_sync(_columns)
        if not apply:
            changes = _changes(columns)
            if changes:
                print(f"Pending changes: {', '.join(changes)}. Re-run with --apply.")
            else:
                print("Google auth schema is already migrated; nothing to do.")
            return 0

        async with engine.begin() as connection:
            if connection.dialect.name == "postgresql":
                await connection.execute(
                    text("LOCK TABLE users IN ACCESS EXCLUSIVE MODE")
                )
            elif connection.dialect.name == "sqlite":
                await connection.exec_driver_sql("BEGIN")
            columns = await connection.run_sync(_columns)
            changes = _changes(columns)
            if "photo_url" not in columns:
                await connection.execute(
                    text("ALTER TABLE users ADD COLUMN photo_url TEXT")
                )
            if "password_hash" in columns:
                await connection.execute(
                    text("ALTER TABLE users DROP COLUMN password_hash")
                )

        if changes:
            print(f"Google auth migration completed: {', '.join(changes)}.")
        else:
            print("Google auth schema is already migrated; nothing to do.")
        return 0
    finally:
        await engine.dispose()


def _arguments(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Upgrade users for Google-only authentication.",
        epilog=(
            "WARNING: --apply permanently discards password hashes. "
            "Take a database backup and stop the old application before applying."
        ),
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--check", action="store_true", help="Inspect without changing data."
    )
    mode.add_argument("--apply", action="store_true", help="Apply the schema changes.")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _arguments(argv)
    try:
        return asyncio.run(_run(args.apply))
    except NoSuchTableError:
        print("Migration failed; users table is missing.", file=sys.stderr)
        return 1
    except Exception:
        print("Migration failed; database error details suppressed.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
