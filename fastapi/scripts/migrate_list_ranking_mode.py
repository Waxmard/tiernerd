import argparse
import asyncio
import importlib
import re
import sys
from collections import defaultdict
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from sqlalchemy import DDL, String, column, inspect, select, table as sql_table, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

_overall = importlib.import_module("scripts.migrate_overall_ranking")
_legacy = importlib.import_module("scripts.migrate_ui_ranking")
MigrationError = _overall.MigrationError
require_postgresql = _overall.require_postgresql
_inspect_state = _overall._inspect_state
_verify_current_items = _overall._verify_current_items
score_for_rank = _overall.score_for_rank


def _plan_scores(
    items: list[Mapping[str, Any]], list_ids: set[object]
) -> dict[object, float | None]:
    groups: dict[object, list[Mapping[str, Any]]] = defaultdict(list)
    seen: set[object] = set()
    updates: dict[object, float | None] = {}
    for row in items:
        item_id = row["item_id"]
        if item_id in seen:
            raise MigrationError("Duplicate item identities in the ranking data.")
        seen.add(item_id)
        if row["list_id"] not in list_ids:
            raise MigrationError("An item belongs to a missing list.")
        if row["position"] is None:
            if row["rating"] is not None:
                updates[item_id] = None
        else:
            groups[row["list_id"]].append(row)
    for ranked in groups.values():
        ranked.sort(key=lambda row: row["position"], reverse=True)
        if len({row["position"] for row in ranked}) != len(ranked):
            raise MigrationError("Ranked items have duplicate positions.")
        for rank, row in enumerate(ranked, 1):
            expected = score_for_rank(rank, len(ranked))
            if row["rating"] != expected:
                updates[row["item_id"]] = expected
    return updates


def _columns(connection: Connection, table: str) -> list[dict[str, Any]]:
    return list(inspect(connection).get_columns(table))


def _normalize_expression(expression: str) -> str:
    parts = re.split(r"('(?:''|[^'])*')", expression)
    return "".join(
        part if index % 2 else _legacy._normalize_pg_expression(part)
        for index, part in enumerate(parts)
    )


async def _mode_present(connection: AsyncConnection) -> bool:
    columns = await connection.run_sync(_columns, "lists")
    mode = next(
        (column for column in columns if column["name"] == "ranking_mode"), None
    )
    result = await connection.execute(
        text(
            "SELECT contype::text AS contype, convalidated, "
            "pg_get_constraintdef(oid, true) AS definition "
            "FROM pg_constraint WHERE conrelid = to_regclass('lists') "
            "AND conname = 'ck_lists_ranking_mode'"
        )
    )
    constraints = result.mappings().all()
    if mode is None and not constraints:
        return False
    if mode is None or len(constraints) != 1:
        raise MigrationError(
            "Unrecognized or partially migrated list ranking mode schema."
        )
    constraint = constraints[0]
    definition = _normalize_expression(constraint["definition"])
    expected = _legacy._expected_membership_expression(
        "ranking_mode", ("rank", "score")
    )
    default = mode.get("default")
    if not (
        isinstance(mode["type"], String)
        and mode["type"].length == 5
        and mode["nullable"] is False
        and isinstance(default, str)
        and _normalize_expression(default) == "'score'"
        and constraint["contype"] == "c"
        and constraint["convalidated"]
        and definition.startswith("check")
        and definition[5:] in expected
    ):
        raise MigrationError("Unrecognized or incompatible list ranking mode schema.")
    invalid = await connection.scalar(
        text(
            "SELECT EXISTS (SELECT 1 FROM lists WHERE ranking_mode IS NULL "
            "OR ranking_mode NOT IN ('rank', 'score'))"
        )
    )
    if invalid:
        raise MigrationError("A list has an invalid ranking mode.")
    return True


async def _rows(
    connection: AsyncConnection, table: str, omit_mode: bool = False
) -> list[dict[str, Any]]:
    columns = await connection.run_sync(_columns, table)
    names = [
        column["name"]
        for column in columns
        if not (omit_mode and column["name"] == "ranking_mode")
    ]
    source = sql_table(table, *(column(name) for name in names))
    result = await connection.execute(select(source))
    return [dict(row) for row in result.mappings().all()]


async def _preflight(
    connection: AsyncConnection,
) -> tuple[bool, dict[object, float | None], dict[str, list[dict[str, Any]]]]:
    try:
        state = await _inspect_state(connection)
    except MigrationError as exc:
        raise MigrationError(
            "Unrecognized ranking schema. Run the UI ranking migration if needed, "
            "then migrate_overall_ranking.py."
        ) from exc
    if state != "current":
        raise MigrationError(
            "Legacy ranking schema: run migrate_overall_ranking.py first."
        )
    present = await _mode_present(connection)
    snapshot = {
        "lists": await _rows(connection, "lists", omit_mode=True),
        "items": await _rows(connection, "items"),
        "comparison_sessions": await _rows(connection, "comparison_sessions"),
    }
    list_ids = [row["list_id"] for row in snapshot["lists"]]
    if len(set(list_ids)) != len(list_ids):
        raise MigrationError("Duplicate list identities in the ranking data.")
    updates = _plan_scores(snapshot["items"], set(list_ids))
    if present:
        snapshot["modes"] = await _mode_rows(connection)
    return present, updates, snapshot


async def _mode_rows(connection: AsyncConnection) -> list[dict[str, Any]]:
    result = await connection.execute(text("SELECT list_id, ranking_mode FROM lists"))
    return [dict(row) for row in result.mappings().all()]


def _by_id(rows: list[dict[str, Any]], key: str) -> dict[object, dict[str, Any]]:
    result = {row[key]: row for row in rows}
    if len(result) != len(rows):
        raise MigrationError("Duplicate identities in migration data.")
    return result


async def _verify_migration(
    connection: AsyncConnection,
    present: bool,
    updates: dict[object, float | None],
    snapshot: dict[str, list[dict[str, Any]]],
) -> None:
    if await _inspect_state(connection) != "current" or not await _mode_present(
        connection
    ):
        raise MigrationError("Migration did not produce the expected schema.")
    lists = await _rows(connection, "lists", omit_mode=True)
    items = await _rows(connection, "items")
    sessions = await _rows(connection, "comparison_sessions")
    _verify_current_items(items)
    expected_items = {
        row["item_id"]: row
        | ({"rating": updates[row["item_id"]]} if row["item_id"] in updates else {})
        for row in snapshot["items"]
    }
    expected_modes = (
        _by_id(snapshot["modes"], "list_id")
        if present
        else {
            row["list_id"]: {"list_id": row["list_id"], "ranking_mode": "score"}
            for row in lists
        }
    )
    if (
        _by_id(lists, "list_id") != _by_id(snapshot["lists"], "list_id")
        or _by_id(items, "item_id") != expected_items
        or _by_id(sessions, "session_id")
        != _by_id(snapshot["comparison_sessions"], "session_id")
        or _by_id(await _mode_rows(connection), "list_id") != expected_modes
    ):
        raise MigrationError("Post-migration data preservation verification failed.")


async def _run(apply: bool) -> int:
    settings = importlib.import_module("app.settings").get_settings()
    database_url = str(settings.DATABASE_URL)
    require_postgresql(database_url)
    engine = create_async_engine(database_url, echo=False)
    try:
        if not apply:
            async with engine.connect() as connection:
                await connection.execute(
                    text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
                )
                present, updates, _ = await _preflight(connection)
                print(
                    f"lists.ranking_mode needs adding: {'no' if present else 'yes'}; "
                    f"incorrect ratings: {len(updates)}."
                )
            return 0
        async with engine.begin() as connection:
            await connection.execute(text("LOCK TABLE lists IN ACCESS EXCLUSIVE MODE"))
            await connection.execute(text("LOCK TABLE items IN ACCESS EXCLUSIVE MODE"))
            present, updates, snapshot = await _preflight(connection)
            if not present:
                await connection.execute(
                    DDL(
                        "ALTER TABLE lists ADD COLUMN ranking_mode "
                        "VARCHAR(5) NOT NULL DEFAULT 'score'"
                    )
                )
                await connection.execute(
                    DDL(
                        "ALTER TABLE lists ADD CONSTRAINT ck_lists_ranking_mode "
                        "CHECK (ranking_mode IN ('rank', 'score'))"
                    )
                )
            if updates:
                await connection.execute(
                    text("UPDATE items SET rating = :rating WHERE item_id = :item_id"),
                    [
                        {"item_id": item_id, "rating": rating}
                        for item_id, rating in updates.items()
                    ],
                )
            await _verify_migration(connection, present, updates, snapshot)
        if present and not updates:
            print("List ranking mode and scores already verified; no changes needed.")
        else:
            print(
                "List ranking mode migration completed; "
                f"corrected {len(updates)} ratings."
            )
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
