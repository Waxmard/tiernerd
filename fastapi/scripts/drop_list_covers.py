import argparse
import asyncio
import importlib
import sys
from pathlib import Path

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

COVER_COLUMNS = {
    "cover": (
        "SELECT COUNT(*) FROM lists WHERE cover IS NOT NULL",
        "ALTER TABLE lists DROP COLUMN cover",
    ),
    "cover_photo": (
        "SELECT COUNT(*) FROM lists WHERE cover_photo IS NOT NULL",
        "ALTER TABLE lists DROP COLUMN cover_photo",
    ),
}


class MigrationError(Exception):
    pass


def _database_url() -> str:
    try:
        settings = importlib.import_module("app.settings").get_settings()
    except Exception as exc:
        raise MigrationError("DATABASE_URL is not set; nothing to migrate.") from exc
    url = str(settings.DATABASE_URL)
    if not url.strip():
        raise MigrationError("DATABASE_URL is not set; nothing to migrate.")
    return url


def _present_columns(connection: Connection) -> list[str]:
    inspector = inspect(connection)
    if not inspector.has_table("lists"):
        raise MigrationError("Unrecognized schema: lists table is missing.")
    existing = {column["name"] for column in inspector.get_columns("lists")}
    return [column for column in COVER_COLUMNS if column in existing]


async def _drop(connection: AsyncConnection, apply: bool) -> None:
    present = await connection.run_sync(_present_columns)
    if not present:
        print("Nothing to do: lists has no cover columns.")
        return
    prefix = "Apply" if apply else "Dry run"
    for column in present:
        count_sql, _ = COVER_COLUMNS[column]
        count = (await connection.execute(text(count_sql))).scalar_one()
        print(f"{prefix}: lists.{column} is set on {count} row(s).")
    if apply:
        for column in present:
            _, drop_sql = COVER_COLUMNS[column]
            await connection.execute(text(drop_sql))
            print(f"Dropped lists.{column}.")


async def _run(apply: bool) -> int:
    engine = create_async_engine(_database_url(), echo=False)
    try:
        async with engine.begin() as connection:
            await _drop(connection, apply)
        return 0
    finally:
        await engine.dispose()


def _arguments(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        epilog="Run after the new backend is deployed; back up the database first."
    )
    parser.add_argument("--apply", action="store_true")
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
