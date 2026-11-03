import argparse
import asyncio
import importlib
import sys
from collections import defaultdict
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from sqlalchemy import DDL, Float, Integer, String, Uuid, text
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

_legacy = importlib.import_module("scripts.migrate_ui_ranking")
generate_key_between = importlib.import_module(
    "app.core.fractional_index"
).generate_key_between
score_for_rank = importlib.import_module("app.services.ranking").score_for_rank
MigrationError = _legacy.MigrationError
require_postgresql = _legacy.require_postgresql

ITEM_COLUMNS = (_legacy.ITEM_BASE_COLUMNS - {"tier_set"}) | {"name_key"}
SESSION_COLUMNS = (
    _legacy.LEGACY_SESSION_COLUMNS - {"tier_set", "is_complete"}
) | _legacy.SESSION_NEW_COLUMNS
BAND_PRIORITY = {"bad": 0, "mid": 1, "good": 2}
ACTIVE_STATUSES = {"active", "ready_to_commit"}
TERMINAL_STATUSES = {"completed", "cancelled"}


def classify_schema(item_columns: set[str], session_columns: set[str]) -> str:
    if not item_columns >= ITEM_COLUMNS or not session_columns >= SESSION_COLUMNS:
        raise MigrationError(
            "Unrecognized schema: the UI ranking migration is a prerequisite."
        )
    if "is_complete" in session_columns:
        raise MigrationError("Unrecognized or partially migrated ranking schema.")
    item_tier = "tier_set" in item_columns
    session_tier = "tier_set" in session_columns
    if item_tier != session_tier:
        raise MigrationError("Unrecognized or partially migrated ranking schema.")
    return "legacy" if item_tier else "current"


def _plan_items(rows: list[Mapping[str, Any]]) -> dict[object, dict[str, Any]]:
    result: dict[object, dict[str, Any]] = {}
    groups: dict[object, list[Mapping[str, Any]]] = defaultdict(list)
    seen: set[tuple[object, str, str]] = set()
    for row in rows:
        if row["item_id"] in result:
            raise MigrationError("Duplicate item identities in the ranking data.")
        item = dict(row)
        item.pop("tier_set")
        result[row["item_id"]] = item
        position = row["position"]
        if position is None:
            item["rating"] = None
            continue
        tier = row["tier_set"]
        if tier not in BAND_PRIORITY:
            raise MigrationError(
                f"Ranked item {row['item_id']} has a missing or unknown category."
            )
        old_key = (row["list_id"], tier, position)
        if old_key in seen:
            raise MigrationError(
                f"List {row['list_id']} has duplicate positions within a category."
            )
        seen.add(old_key)
        groups[row["list_id"]].append(row)

    for ranked in groups.values():
        ranked.sort(
            key=lambda row: (BAND_PRIORITY[row["tier_set"]], row["position"]),
            reverse=True,
        )
        previous = None
        for rank in range(len(ranked), 0, -1):
            row = ranked[rank - 1]
            position = generate_key_between(previous, None)
            if len(position) > 255:
                raise MigrationError(
                    f"List {row['list_id']} needs a position longer than "
                    "255 characters."
                )
            result[row["item_id"]]["position"] = position
            result[row["item_id"]]["rating"] = score_for_rank(rank, len(ranked))
            previous = position
    return result


def _plan_sessions(rows: list[Mapping[str, Any]]) -> dict[object, dict[str, Any]]:
    result: dict[object, dict[str, Any]] = {}
    for row in rows:
        if row["session_id"] in result:
            raise MigrationError("Duplicate session identities in the ranking data.")
        session = dict(row)
        session.pop("tier_set")
        status = row["status"]
        if status not in ACTIVE_STATUSES | TERMINAL_STATUSES:
            raise MigrationError(f"Session {row['session_id']} has an unknown status.")
        if status in ACTIVE_STATUSES:
            if row["revision"] >= 2_147_483_647:
                raise MigrationError(
                    f"Session {row['session_id']} revision would overflow."
                )
            session["status"] = "cancelled"
            session["revision"] += 1
        session["target_item_id"] = None
        session["previous_state"] = None
        session["peer_snapshot"] = []
        session["candidate_snapshot"] = {}
        result[row["session_id"]] = session
    return result


def _verify_current_items(rows: list[Mapping[str, Any]]) -> None:
    groups: dict[object, list[Mapping[str, Any]]] = defaultdict(list)
    seen: set[object] = set()
    for row in rows:
        if row["item_id"] in seen:
            raise MigrationError("Duplicate item identities in the ranking data.")
        seen.add(row["item_id"])
        if row["position"] is None:
            if row["rating"] is not None:
                raise MigrationError("An unranked item has a non-null rating.")
        else:
            groups[row["list_id"]].append(row)
    for ranked in groups.values():
        ranked.sort(key=lambda row: row["position"], reverse=True)
        positions = {row["position"] for row in ranked}
        if len(positions) != len(ranked):
            raise MigrationError("Ranked items have duplicate positions.")
        for rank, row in enumerate(ranked, start=1):
            if row["rating"] != score_for_rank(rank, len(ranked)):
                raise MigrationError("A ranked item has an incorrect rating.")


async def _verify_position_index(
    connection: AsyncConnection, name: str, columns: tuple[str, ...]
) -> None:
    result = await connection.execute(
        text(
            "SELECT ix.indisunique, ix.indisvalid, ix.indisready, "
            "ix.indnatts = ix.indnkeyatts AS no_includes, "
            "ARRAY(SELECT attribute.attname "
            "FROM unnest(ix.indkey::smallint[]) WITH ORDINALITY "
            "AS index_key(attnum, ordinality) "
            "JOIN pg_attribute AS attribute "
            "ON attribute.attrelid = ix.indrelid "
            "AND attribute.attnum = index_key.attnum "
            "WHERE index_key.ordinality <= ix.indnkeyatts "
            "ORDER BY index_key.ordinality) AS columns, "
            "pg_get_expr(ix.indpred, ix.indrelid) AS predicate "
            "FROM pg_index AS ix "
            "JOIN pg_class AS index_relation ON index_relation.oid = ix.indexrelid "
            "WHERE ix.indrelid = to_regclass('items') "
            "AND index_relation.relname = :name"
        ),
        {"name": name},
    )
    indexes = result.mappings().all()
    if len(indexes) != 1:
        raise MigrationError(
            f"Unrecognized schema: index {name} is missing or duplicated."
        )
    index = indexes[0]
    predicate = index["predicate"]
    if not (
        index["indisunique"]
        and index["indisvalid"]
        and index["indisready"]
        and index["no_includes"]
        and tuple(index["columns"]) == columns
        and predicate is not None
        and _legacy._normalize_pg_expression(predicate) == "positionisnotnull"
    ):
        raise MigrationError(
            f"Unrecognized schema: index {name} has unexpected definition."
        )


async def _reject_index(connection: AsyncConnection, name: str) -> None:
    result = await connection.execute(
        text(
            "SELECT index_relation.oid FROM pg_class AS indexed_table "
            "JOIN pg_class AS index_relation "
            "ON index_relation.relnamespace = indexed_table.relnamespace "
            "WHERE indexed_table.oid = to_regclass('items') "
            "AND index_relation.relname = :name"
        ),
        {"name": name},
    )
    if result.first() is not None:
        raise MigrationError(
            f"Unrecognized or partially migrated schema: {name} exists."
        )


async def _inspect_state(connection: AsyncConnection) -> str:
    snapshot = await connection.run_sync(_legacy._schema_snapshot)
    state = classify_schema(set(snapshot["items"]), set(snapshot["sessions"]))
    await _legacy._verify_current_schema(connection, snapshot)
    _legacy._column(snapshot, "items", "item_id", Uuid, nullable=False)
    _legacy._column(snapshot, "items", "list_id", Uuid, nullable=False)
    _legacy._column(
        snapshot,
        "items",
        "position",
        String,
        nullable=True,
        length=255,
        check_length=True,
    )
    _legacy._column(snapshot, "items", "rating", Float, nullable=True)
    _legacy._column(snapshot, "sessions", "session_id", Uuid, nullable=False)
    _legacy._column(snapshot, "sessions", "list_id", Uuid, nullable=False)
    _legacy._column(snapshot, "sessions", "new_item_id", Uuid, nullable=False)
    _legacy._column(snapshot, "sessions", "target_item_id", Uuid, nullable=True)
    for column in ("min_index", "max_index", "comparison_index"):
        _legacy._column(snapshot, "sessions", column, Integer, nullable=False)
    if state == "legacy":
        _legacy._column(
            snapshot,
            "items",
            "tier_set",
            String,
            nullable=True,
            length=10,
            check_length=True,
        )
        _legacy._column(
            snapshot,
            "sessions",
            "tier_set",
            String,
            nullable=False,
            length=10,
            check_length=True,
        )
        await _verify_position_index(
            connection,
            "ix_items_list_tier_position",
            ("list_id", "tier_set", "position"),
        )
        await _reject_index(connection, "ix_items_list_position")
    else:
        await _verify_position_index(
            connection, "ix_items_list_position", ("list_id", "position")
        )
        await _reject_index(connection, "ix_items_list_tier_position")
    return state


async def _read_rows(
    connection: AsyncConnection, table: str
) -> list[Mapping[str, Any]]:
    statement = (
        "SELECT * FROM items"
        if table == "items"
        else "SELECT * FROM comparison_sessions"
    )
    result = await connection.execute(text(statement))
    return list(result.mappings().all())


async def _preflight(
    connection: AsyncConnection, state: str
) -> tuple[dict[object, dict[str, Any]], dict[object, dict[str, Any]]]:
    items = await _read_rows(connection, "items")
    if state == "current":
        _verify_current_items(items)
        return {}, {}
    sessions = await _read_rows(connection, "comparison_sessions")
    return _plan_items(items), _plan_sessions(sessions)


async def _apply_migration(
    connection: AsyncConnection, items: dict[object, dict[str, Any]]
) -> None:
    schema = await connection.scalar(
        text(
            "SELECT namespace.nspname FROM pg_class AS relation "
            "JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace "
            "WHERE relation.oid = to_regclass('items')"
        )
    )
    if not isinstance(schema, str):
        raise MigrationError("Cannot determine the items table schema.")
    quoted_schema = connection.dialect.identifier_preparer.quote_schema(schema)
    await connection.execute(
        text(f"DROP INDEX {quoted_schema}.ix_items_list_tier_position")
    )
    updates = [
        {"item_id": item_id, "position": row["position"], "rating": row["rating"]}
        for item_id, row in items.items()
    ]
    if updates:
        await connection.execute(
            text(
                "UPDATE items SET position = :position, rating = :rating "
                "WHERE item_id = :item_id"
            ),
            updates,
        )
    await connection.execute(
        text(
            "UPDATE comparison_sessions SET "
            "revision = revision + CASE WHEN status IN ('active', 'ready_to_commit') "
            "THEN 1 ELSE 0 END, "
            "target_item_id = NULL, previous_state = NULL, "
            "status = CASE WHEN status IN ('active', 'ready_to_commit') "
            "THEN 'cancelled' ELSE status END, "
            "peer_snapshot = '[]'::json, candidate_snapshot = '{}'::json"
        )
    )
    await connection.execute(DDL("ALTER TABLE items DROP COLUMN tier_set"))
    await connection.execute(
        DDL("ALTER TABLE comparison_sessions DROP COLUMN tier_set")
    )
    await connection.execute(
        text(
            "CREATE UNIQUE INDEX ix_items_list_position ON items (list_id, position) "
            "WHERE position IS NOT NULL"
        )
    )


async def _verify_migration(
    connection: AsyncConnection,
    expected_items: dict[object, dict[str, Any]],
    expected_sessions: dict[object, dict[str, Any]],
) -> None:
    if await _inspect_state(connection) != "current":
        raise MigrationError("Migration did not produce the expected schema.")
    items = await _read_rows(connection, "items")
    sessions = await _read_rows(connection, "comparison_sessions")
    _verify_current_items(items)
    if {row["item_id"]: dict(row) for row in items} != expected_items:
        raise MigrationError("Post-migration item preservation verification failed.")
    if len(sessions) != len(expected_sessions) or {
        row["session_id"]: dict(row) for row in sessions
    } != expected_sessions:
        raise MigrationError("Post-migration session preservation verification failed.")


async def _run(apply: bool) -> int:
    settings = importlib.import_module("app.settings").get_settings()
    database_url = str(settings.DATABASE_URL)
    require_postgresql(database_url)
    engine = create_async_engine(database_url, echo=False)
    try:
        async with engine.connect() as connection:
            await connection.execute(
                text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            )
            state = await _inspect_state(connection)
            await _preflight(connection, state)
            if not apply:
                print(
                    "Overall ranking is already migrated and verified."
                    if state == "current"
                    else "Legacy ranking passed preflight; no changes were made."
                )
                return 0

        async with engine.begin() as connection:
            await connection.execute(
                text("LOCK TABLE items, comparison_sessions IN ACCESS EXCLUSIVE MODE")
            )
            state = await _inspect_state(connection)
            items, sessions = await _preflight(connection, state)
            if state == "current":
                print("Overall ranking is already migrated and verified.")
                return 0
            await _apply_migration(connection, items)
            await _verify_migration(connection, items, sessions)
        print("Overall ranking migration completed.")
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
