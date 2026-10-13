import argparse
import asyncio
import importlib
import re
import sys
from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import JSON, Boolean, Integer, String, inspect, text
from sqlalchemy.engine import Connection, make_url
from sqlalchemy.exc import ArgumentError
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


ITEM_BASE_COLUMNS = frozenset(
    {
        "item_id",
        "list_id",
        "name",
        "description",
        "image_url",
        "position",
        "rating",
        "tier_set",
        "created_at",
        "updated_at",
    }
)
LEGACY_SESSION_COLUMNS = frozenset(
    {
        "session_id",
        "list_id",
        "new_item_id",
        "target_item_id",
        "tier_set",
        "min_index",
        "max_index",
        "comparison_index",
        "is_complete",
        "created_at",
        "updated_at",
    }
)
SESSION_NEW_COLUMNS = frozenset(
    {
        "status",
        "comparisons_answered",
        "revision",
        "discard_on_cancel",
        "peer_snapshot",
        "candidate_snapshot",
        "previous_state",
    }
)


class MigrationError(Exception):
    pass


@dataclass(frozen=True)
class PreflightIssue:
    code: str
    list_id: object
    item_ids: tuple[object, ...]
    key: str | None = None
    length: int | None = None
    display_name: str | None = None


def preflight_items(
    rows: Iterable[Mapping[str, Any]], *, require_stored_keys: bool = False
) -> tuple[dict[object, tuple[str, str]], list[PreflightIssue]]:
    normalized: dict[object, tuple[str, str]] = {}
    issues: list[PreflightIssue] = []
    groups: defaultdict[tuple[object, str], list[object]] = defaultdict(list)

    for row in rows:
        item_id = row["item_id"]
        list_id = row["list_id"]
        name = row["name"]
        if not isinstance(name, str):
            issues.append(PreflightIssue("invalid_name", list_id, (item_id,)))
            continue

        display_name = name.strip()
        key = display_name.casefold()
        normalized[item_id] = (display_name, key)
        groups[(list_id, key)].append(item_id)

        if not display_name:
            issues.append(
                PreflightIssue(
                    "blank_name",
                    list_id,
                    (item_id,),
                    length=0,
                    display_name=display_name,
                )
            )
        if len(display_name) > 100:
            issues.append(
                PreflightIssue(
                    "name_too_long",
                    list_id,
                    (item_id,),
                    length=len(display_name),
                    display_name=display_name,
                )
            )
        if require_stored_keys and name != display_name:
            issues.append(
                PreflightIssue(
                    "name_not_trimmed",
                    list_id,
                    (item_id,),
                    display_name=display_name,
                )
            )
        if require_stored_keys and row.get("name_key") != key:
            issues.append(
                PreflightIssue("name_key_mismatch", list_id, (item_id,), key=key)
            )

    for (list_id, key), item_ids in groups.items():
        if len(item_ids) > 1:
            issues.append(
                PreflightIssue(
                    "duplicate_name_key",
                    list_id,
                    tuple(sorted(item_ids, key=str)),
                    key=key,
                )
            )
    return normalized, issues


def classify_schema(item_columns: set[str], session_columns: set[str]) -> str:
    if not item_columns >= ITEM_BASE_COLUMNS:
        raise MigrationError("Unrecognized schema: required item columns are missing.")
    if not (LEGACY_SESSION_COLUMNS - {"is_complete"}) <= session_columns:
        raise MigrationError(
            "Unrecognized schema: required session columns are missing."
        )

    legacy = (
        "name_key" not in item_columns
        and "is_complete" in session_columns
        and not (SESSION_NEW_COLUMNS & session_columns)
    )
    current = (
        "name_key" in item_columns
        and "is_complete" not in session_columns
        and session_columns >= SESSION_NEW_COLUMNS
    )
    if legacy:
        return "legacy"
    if current:
        return "current"
    raise MigrationError("Unrecognized or partially migrated ranking schema.")


def require_postgresql(database_url: str) -> str:
    try:
        backend = make_url(database_url).get_backend_name()
    except ArgumentError as exc:
        raise MigrationError("DATABASE_URL is not a valid SQLAlchemy URL.") from exc
    if backend != "postgresql":
        raise MigrationError(
            "This persistent migration supports PostgreSQL only; "
            f"configured dialect is {backend!r}. Fresh SQLite databases do not use it."
        )
    return backend


def _schema_snapshot(connection: Connection) -> dict[str, Any]:
    inspector = inspect(connection)
    tables = set(inspector.get_table_names())
    required = {"items", "comparison_sessions"}
    if not required <= tables:
        raise MigrationError(
            "Unrecognized schema: items or comparison_sessions is missing."
        )
    return {
        "items": {column["name"]: column for column in inspector.get_columns("items")},
        "sessions": {
            column["name"]: column
            for column in inspector.get_columns("comparison_sessions")
        },
    }


def _column(
    snapshot: dict[str, Any],
    table: str,
    name: str,
    type_class: type | None,
    *,
    nullable: bool,
    length: int | None = None,
    check_length: bool = False,
) -> dict[str, Any]:
    columns = snapshot[table]
    if name not in columns:
        raise MigrationError(f"Unrecognized schema: {table}.{name} is missing.")
    column = columns[name]
    if (
        type_class is not None and not isinstance(column["type"], type_class)
    ) or column["nullable"] is not nullable:
        raise MigrationError(
            f"Unrecognized schema: {table}.{name} has an unexpected "
            "type or nullability."
        )
    if check_length and getattr(column["type"], "length", None) != length:
        raise MigrationError(
            f"Unrecognized schema: {table}.{name} has an unexpected length."
        )
    return column


def _check_legacy_schema(snapshot: dict[str, Any]) -> None:
    _column(
        snapshot, "items", "name", String, nullable=False, length=100, check_length=True
    )
    _column(snapshot, "items", "list_id", None, nullable=False)
    _column(snapshot, "items", "position", String, nullable=True)
    _column(snapshot, "items", "tier_set", String, nullable=True)
    _column(snapshot, "sessions", "is_complete", Boolean, nullable=False)
    _column(snapshot, "sessions", "new_item_id", None, nullable=False)


def _check_current_schema(snapshot: dict[str, Any]) -> None:
    _column(
        snapshot,
        "items",
        "name",
        String,
        nullable=False,
        length=100,
        check_length=True,
    )
    _column(snapshot, "items", "list_id", None, nullable=False)
    _column(
        snapshot,
        "items",
        "name_key",
        String,
        nullable=False,
        length=300,
        check_length=True,
    )
    _column(
        snapshot,
        "sessions",
        "status",
        String,
        nullable=False,
        length=20,
        check_length=True,
    )
    _column(snapshot, "sessions", "comparisons_answered", Integer, nullable=False)
    _column(snapshot, "sessions", "revision", Integer, nullable=False)
    _column(snapshot, "sessions", "discard_on_cancel", Boolean, nullable=False)
    _column(snapshot, "sessions", "peer_snapshot", JSON, nullable=False)
    _column(snapshot, "sessions", "candidate_snapshot", JSON, nullable=False)
    _column(snapshot, "sessions", "previous_state", JSON, nullable=True)


def _normalize_pg_expression(expression: str) -> str:
    normalized = expression.lower()
    normalized = re.sub(
        r"::\s*(?:character varying|varchar|text)(?:\s*\[\])?", "", normalized
    )
    return re.sub(r"[\s()]", "", normalized)


def _expected_membership_expression(column: str, values: tuple[str, ...]) -> set[str]:
    members = ",".join(f"'{value}'" for value in values)
    return {f"{column}in{members}", f"{column}=anyarray[{members}]"}


async def _verify_check_constraint(connection: AsyncConnection) -> None:
    result = await connection.execute(
        text(
            "SELECT pg_get_constraintdef(oid, true) AS definition, convalidated "
            "FROM pg_constraint "
            "WHERE conrelid = to_regclass('comparison_sessions') "
            "AND conname = 'ck_comparison_session_status' AND contype = 'c'"
        )
    )
    constraints = result.mappings().all()
    expected = _expected_membership_expression(
        "status", ("active", "ready_to_commit", "completed", "cancelled")
    )
    if len(constraints) != 1:
        raise MigrationError(
            "Unrecognized schema: status check constraint is missing or duplicated."
        )
    definition = _normalize_pg_expression(constraints[0]["definition"])
    if definition.startswith("check"):
        definition = definition[5:]
    if not constraints[0]["convalidated"] or definition not in expected:
        raise MigrationError(
            "Unrecognized schema: status check constraint is not the "
            "expected validated check."
        )


async def _verify_index(
    connection: AsyncConnection,
    name: str,
    table: str,
    columns: tuple[str, ...],
    predicate_values: tuple[str, ...] | None = None,
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
            "JOIN pg_class AS indexed_table ON indexed_table.oid = ix.indrelid "
            "JOIN pg_class AS index_relation ON index_relation.oid = ix.indexrelid "
            "WHERE indexed_table.oid = to_regclass(:table) "
            "AND index_relation.relname = :name"
        ),
        {"table": table, "name": name},
    )
    indexes = result.mappings().all()
    if len(indexes) != 1:
        raise MigrationError(
            f"Unrecognized schema: index {name} is missing or duplicated."
        )
    index = indexes[0]
    predicate = index["predicate"]
    valid_predicate = predicate is None and predicate_values is None
    if predicate is not None and predicate_values is not None:
        valid_predicate = _normalize_pg_expression(predicate) in (
            _expected_membership_expression("status", predicate_values)
        )
    if not (
        index["indisunique"]
        and index["indisvalid"]
        and index["indisready"]
        and index["no_includes"]
        and tuple(index["columns"]) == columns
        and valid_predicate
    ):
        raise MigrationError(
            f"Unrecognized schema: index {name} has unexpected columns or predicate."
        )


async def _verify_current_schema(
    connection: AsyncConnection, snapshot: dict[str, Any]
) -> None:
    _check_current_schema(snapshot)
    await _verify_check_constraint(connection)
    await _verify_index(
        connection,
        "ix_items_list_name_key",
        "items",
        ("list_id", "name_key"),
    )
    await _verify_index(
        connection,
        "ix_comparison_sessions_active_item",
        "comparison_sessions",
        ("new_item_id",),
        ("active", "ready_to_commit"),
    )


async def _inspect_state(connection: AsyncConnection) -> tuple[str, dict[str, Any]]:
    snapshot = await connection.run_sync(_schema_snapshot)
    state = classify_schema(set(snapshot["items"]), set(snapshot["sessions"]))
    if state == "legacy":
        _check_legacy_schema(snapshot)
    else:
        await _verify_current_schema(connection, snapshot)
    return state, snapshot


async def _read_items(
    connection: AsyncConnection, *, include_keys: bool
) -> list[Mapping[str, Any]]:
    statement = (
        text("SELECT item_id, list_id, name, name_key FROM items ORDER BY item_id")
        if include_keys
        else text("SELECT item_id, list_id, name FROM items ORDER BY item_id")
    )
    result = await connection.execute(statement)
    return list(result.mappings().all())


async def _check_candidate_links(connection: AsyncConnection) -> None:
    result = await connection.execute(
        text(
            "SELECT session.session_id FROM comparison_sessions AS session "
            "LEFT JOIN items AS candidate ON candidate.item_id = session.new_item_id "
            "WHERE candidate.item_id IS NULL LIMIT 1"
        )
    )
    orphan = result.first()
    if orphan is not None:
        raise MigrationError(
            f"Cannot build candidate snapshots: session {orphan[0]} "
            "has no candidate item."
        )


def _report_issues(issues: list[PreflightIssue]) -> None:
    print("Preflight failed; no changes were made:", file=sys.stderr)
    for issue in issues:
        item_ids = ",".join(str(item_id) for item_id in issue.item_ids)
        detail = f"list_id={issue.list_id}, item_ids={item_ids}"
        if issue.key is not None:
            detail += f", key={issue.key!r}"
        if issue.length is not None:
            detail += f", trimmed_length={issue.length}"
        if issue.display_name is not None:
            detail += f", trimmed_name={issue.display_name!r}"
        print(f"- {issue.code}: {detail}", file=sys.stderr)


async def _preflight(
    connection: AsyncConnection, state: str
) -> tuple[dict[object, tuple[str, str]], list[PreflightIssue]]:
    rows = await _read_items(connection, include_keys=state == "current")
    return preflight_items(rows, require_stored_keys=state == "current")


async def _apply_migration(
    connection: AsyncConnection, normalized: dict[object, tuple[str, str]]
) -> None:
    await connection.execute(text("ALTER TABLE items ADD COLUMN name_key VARCHAR(300)"))
    updates = [
        {"item_id": item_id, "name": display_name, "name_key": key}
        for item_id, (display_name, key) in normalized.items()
    ]
    if updates:
        await connection.execute(
            text(
                "UPDATE items SET name = :name, name_key = :name_key "
                "WHERE item_id = :item_id"
            ),
            updates,
        )
    await connection.execute(text("ALTER TABLE items ALTER COLUMN name SET NOT NULL"))
    await connection.execute(
        text("ALTER TABLE items ALTER COLUMN name_key SET NOT NULL")
    )
    await connection.execute(
        text("CREATE UNIQUE INDEX ix_items_list_name_key ON items (list_id, name_key)")
    )

    await connection.execute(
        text(
            "ALTER TABLE comparison_sessions "
            "ADD COLUMN status VARCHAR(20), "
            "ADD COLUMN comparisons_answered INTEGER NOT NULL DEFAULT 0, "
            "ADD COLUMN revision INTEGER NOT NULL DEFAULT 0, "
            "ADD COLUMN discard_on_cancel BOOLEAN NOT NULL DEFAULT false, "
            "ADD COLUMN peer_snapshot JSON NOT NULL DEFAULT '[]'::json, "
            "ADD COLUMN candidate_snapshot JSON NOT NULL DEFAULT '{}'::json, "
            "ADD COLUMN previous_state JSON"
        )
    )
    await connection.execute(
        text(
            "UPDATE comparison_sessions AS session "
            "SET status = CASE WHEN session.is_complete "
            "THEN 'completed' ELSE 'cancelled' END, "
            "candidate_snapshot = json_build_object("
            "'position', candidate.position, 'tier_set', candidate.tier_set) "
            "FROM items AS candidate WHERE candidate.item_id = session.new_item_id"
        )
    )
    await connection.execute(
        text("ALTER TABLE comparison_sessions ALTER COLUMN status SET NOT NULL")
    )
    await connection.execute(
        text(
            "ALTER TABLE comparison_sessions "
            "ADD CONSTRAINT ck_comparison_session_status "
            "CHECK (status IN ('active', 'ready_to_commit', 'completed', 'cancelled'))"
        )
    )
    await connection.execute(
        text("ALTER TABLE comparison_sessions DROP COLUMN is_complete")
    )
    await connection.execute(
        text(
            "CREATE UNIQUE INDEX ix_comparison_sessions_active_item "
            "ON comparison_sessions (new_item_id) "
            "WHERE status IN ('active', 'ready_to_commit')"
        )
    )


async def _run(apply: bool) -> int:
    settings = importlib.import_module("app.settings").get_settings()
    database_url = str(settings.DATABASE_URL)
    require_postgresql(database_url)
    engine = create_async_engine(database_url, echo=False)
    try:
        async with engine.connect() as connection:
            state, _ = await _inspect_state(connection)
            _, issues = await _preflight(connection, state)
            if issues:
                _report_issues(issues)
                return 1
            if state == "legacy":
                await _check_candidate_links(connection)
            if not apply:
                message = (
                    "Ranking schema and stored keys are already migrated and verified."
                    if state == "current"
                    else "Legacy data passed preflight; no changes were made."
                )
                print(message)
                return 0

        async with engine.begin() as connection:
            await connection.execute(
                text("LOCK TABLE items, comparison_sessions IN ACCESS EXCLUSIVE MODE")
            )
            state, _ = await _inspect_state(connection)
            normalized, issues = await _preflight(connection, state)
            if issues:
                _report_issues(issues)
                return 1
            if state == "current":
                print(
                    "Ranking schema and stored keys are already migrated and verified."
                )
                return 0
            await _check_candidate_links(connection)
            await _apply_migration(connection, normalized)
            state, _ = await _inspect_state(connection)
            if state != "current":
                raise MigrationError("Migration did not produce the expected schema.")
            _, issues = await _preflight(connection, state)
            if issues:
                raise MigrationError("Post-migration data verification failed.")
        print("Ranking migration completed.")
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
