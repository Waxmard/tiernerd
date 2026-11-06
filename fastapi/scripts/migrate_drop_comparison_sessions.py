import argparse
import asyncio
import importlib
import sys
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

TABLE_NAME = "comparison_sessions"


class MigrationError(Exception):
    pass


def _database_url() -> str:
    """Read the configured database URL, refusing to run without one."""
    try:
        settings = importlib.import_module("app.settings").get_settings()
    except Exception as exc:
        raise MigrationError("DATABASE_URL is not set; nothing to migrate.") from exc
    url = str(settings.DATABASE_URL)
    if not url.strip():
        raise MigrationError("DATABASE_URL is not set; nothing to migrate.")
    return url


async def _table_state(connection: AsyncConnection) -> tuple[bool, int]:
    exists = await connection.run_sync(lambda sync: inspect(sync).has_table(TABLE_NAME))
    if not exists:
        return False, 0
    count = await connection.scalar(text("SELECT COUNT(*) FROM comparison_sessions"))
    return True, int(count or 0)


async def _run(apply: bool) -> int:
    engine = create_async_engine(_database_url(), echo=False)
    try:
        if not apply:
            async with engine.connect() as connection:
                exists, count = await _table_state(connection)
            if not exists:
                print(f"{TABLE_NAME} does not exist; nothing to drop.")
            else:
                print(f"{TABLE_NAME} exists with {count} row(s).")
            return 0
        async with engine.begin() as connection:
            exists, count = await _table_state(connection)
            if not exists:
                print(f"{TABLE_NAME} does not exist; nothing to drop.")
                return 0
            await connection.execute(text("DROP TABLE comparison_sessions"))
        print(f"Dropped {TABLE_NAME} with {count} row(s).")
        return 0
    finally:
        await engine.dispose()


def _arguments(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        epilog="Before --apply, run migrate_ui_ranking.py, stop the application, "
        "and take a database backup."
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--apply", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _arguments(argv)
    try:
        return asyncio.run(_run(args.apply))
    except MigrationError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except Exception:
        print("Migration failed; database error details suppressed.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
