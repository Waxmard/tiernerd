import argparse
import asyncio
import importlib
import math
import sys
from collections import defaultdict
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

_ranking = importlib.import_module("app.services.ranking")
compute_scores = _ranking.compute_scores
_half_even_1 = _ranking._half_even_1


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


def _has_manual_rating(connection: Connection) -> bool:
    if not inspect(connection).has_table("items"):
        raise MigrationError("Unrecognized schema: items table is missing.")
    return any(
        column["name"] == "manual_rating"
        for column in inspect(connection).get_columns("items")
    )


async def _fetch_items(
    connection: AsyncConnection, has_column: bool
) -> list[dict[str, Any]]:
    query = (
        "SELECT item_id, list_id, position, rating, manual_rating FROM items"
        if has_column
        else "SELECT item_id, list_id, position, rating FROM items"
    )
    result = await connection.execute(text(query))
    return [dict(row) for row in result.mappings().all()]


def _validate_manual_pin(manual: object) -> float | None:
    if manual is None:
        return None
    if (
        isinstance(manual, bool)
        or not isinstance(manual, (int, float))
        or not math.isfinite(float(manual))
        or float(manual) < 0.0
        or float(manual) > 10.0
    ):
        raise MigrationError("An item has an out-of-range manual_rating value.")
    return _half_even_1(float(manual))


def _plan_ranked_list_updates(
    ranked: list[Mapping[str, Any]], has_column: bool, updates: dict[Any, float | None]
) -> None:
    ranked.sort(key=lambda row: row["position"], reverse=True)
    if len({row["position"] for row in ranked}) != len(ranked):
        raise MigrationError("Ranked items have duplicate positions.")
    manual_ratings: list[float | None] = []
    last_pin: float | None = None
    for row in ranked:
        pin = _validate_manual_pin(row.get("manual_rating") if has_column else None)
        if pin is not None:
            if last_pin is not None and pin > last_pin:
                raise MigrationError(
                    "Pinned manual_rating values violate list rank order."
                )
            last_pin = pin
        manual_ratings.append(pin)
    for row, expected in zip(ranked, compute_scores(manual_ratings), strict=True):
        current = row["rating"]
        if current is None or _half_even_1(float(current)) != expected:
            updates[row["item_id"]] = expected


def _plan_score_updates(
    items: list[Mapping[str, Any]], has_column: bool
) -> dict[Any, float | None]:
    groups: dict[Any, list[Mapping[str, Any]]] = defaultdict(list)
    updates: dict[Any, float | None] = {}
    for row in items:
        if row["position"] is None:
            if has_column and row.get("manual_rating") is not None:
                raise MigrationError(
                    "Unranked item has a non-null manual_rating value."
                )
            if row["rating"] is not None:
                updates[row["item_id"]] = None
        else:
            groups[row["list_id"]].append(row)
    for ranked in groups.values():
        _plan_ranked_list_updates(ranked, has_column, updates)
    return updates


async def apply_connection(connection: AsyncConnection) -> int:
    if connection.dialect.name == "postgresql":
        await connection.execute(text("LOCK TABLE items IN ACCESS EXCLUSIVE MODE"))
    has_column = await connection.run_sync(_has_manual_rating)
    if not has_column:
        await connection.execute(
            text("ALTER TABLE items ADD COLUMN manual_rating DOUBLE PRECISION")
        )
        has_column = True
    items = await _fetch_items(connection, has_column)
    updates = _plan_score_updates(items, has_column)
    for item_id, rating in updates.items():
        await connection.execute(
            text("UPDATE items SET rating = :rating WHERE item_id = :item_id"),
            {"rating": rating, "item_id": item_id},
        )
    verified_items = await _fetch_items(connection, has_column)
    remaining = _plan_score_updates(verified_items, has_column)
    if remaining:
        raise MigrationError("Score verification failed after migration.")
    return len(updates)


async def _run(apply: bool) -> int:
    engine = create_async_engine(_database_url(), echo=False)
    try:
        if not apply:
            async with engine.connect() as connection:
                has_column = await connection.run_sync(_has_manual_rating)
                items = await _fetch_items(connection, has_column)
                updates = _plan_score_updates(items, has_column)
            status_str = "present" if has_column else "missing"
            print(
                f"items.manual_rating is {status_str}; "
                f"{len(updates)} row(s) need score updates."
            )
            return 0

        async with engine.begin() as connection:
            count = await apply_connection(connection)
        print(f"Migrated items.manual_rating and updated {count} row(s).")
        return 0
    finally:
        await engine.dispose()


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
    except MigrationError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except Exception:
        print("Migration failed; database error details suppressed.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
