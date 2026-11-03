import os
import shutil
import subprocess
import tempfile
import uuid
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy import MetaData, create_engine, inspect, text
from sqlalchemy.engine import URL

from app.db.models import Base
from app.settings import get_settings
from scripts import migrate_overall_ranking as migration
from scripts.migrate_overall_ranking import (
    MigrationError,
    _arguments,
    _plan_items,
    _plan_sessions,
    classify_schema,
    main,
    require_postgresql,
)
from scripts.migrate_ui_ranking import (
    ITEM_BASE_COLUMNS,
    LEGACY_SESSION_COLUMNS,
    SESSION_NEW_COLUMNS,
)


def _sample_data():
    timestamp = datetime(2024, 2, 3, 4, 5, 6, tzinfo=UTC)
    user_id, list_id = uuid.uuid4(), uuid.uuid4()
    user = {
        "user_id": user_id,
        "email": "migration@example.test",
        "username": "migration-user",
        "photo_url": "https://example.test/user.png",
        "is_admin": False,
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    ranking_list = {
        "list_id": list_id,
        "user_id": user_id,
        "title": "Preserved list",
        "description": "List metadata",
        "color": "#123456",
        "created_at": timestamp,
        "updated_at": timestamp,
    }
    items = []
    for name, tier, position, rating in (
        ("Good high", "good", "a2", 9.1),
        ("Good low", "good", "a1", 8.2),
        ("Middle", "mid", "a2", 4.3),
        ("Bad", "bad", "a1", 1.4),
        ("Unranked", None, None, 7.5),
    ):
        items.append(
            {
                "item_id": uuid.uuid4(),
                "list_id": list_id,
                "name": name,
                "name_key": name.casefold(),
                "description": f"Description for {name}",
                "image_url": f"https://example.test/{name.replace(' ', '-')}.png",
                "position": position,
                "rating": rating,
                "tier_set": tier,
                "created_at": timestamp,
                "updated_at": timestamp,
            }
        )
    sessions = []
    for index, status in enumerate(
        ("active", "ready_to_commit", "completed", "cancelled")
    ):
        sessions.append(
            {
                "session_id": uuid.uuid4(),
                "list_id": list_id,
                "new_item_id": items[4 if index == 0 else index]["item_id"],
                "target_item_id": items[index + 1]["item_id"],
                "tier_set": "good",
                "min_index": 1,
                "max_index": 8,
                "comparison_index": 3,
                "status": status,
                "comparisons_answered": index + 2,
                "revision": index + 7,
                "discard_on_cancel": index % 2 == 0,
                "peer_snapshot": [
                    {
                        "item_id": str(items[0]["item_id"]),
                        "tier_set": "good",
                        "position": "a2",
                    }
                ],
                "candidate_snapshot": {"tier_set": "good", "position": "a2"},
                "previous_state": {"tier_set": "mid", "position": "a1", "rating": 4.3},
                "created_at": timestamp,
                "updated_at": timestamp,
            }
        )
    return {
        "users": [user],
        "lists": [ranking_list],
        "items": items,
        "sessions": sessions,
    }


def _expected_item(row, position, rating):
    return {key: value for key, value in row.items() if key != "tier_set"} | {
        "position": position,
        "rating": rating,
    }


def _expected_session(row):
    expected = {key: value for key, value in row.items() if key != "tier_set"}
    expected.update(
        target_item_id=None,
        previous_state=None,
        peer_snapshot=[],
        candidate_snapshot={},
    )
    if row["status"] in ("active", "ready_to_commit"):
        expected.update(
            status="cancelled",
            revision=row["revision"] + 1,
        )
    return expected


def test_items_preserve_metadata_and_rank_across_overlapping_bands():
    items = _sample_data()["items"]
    planned = _plan_items([items[3], items[1], items[4], items[2], items[0]])
    expected = [
        _expected_item(items[0], "a3", 10.0),
        _expected_item(items[1], "a2", 6.7),
        _expected_item(items[2], "a1", 3.3),
        _expected_item(items[3], "a0", 0.0),
        _expected_item(items[4], None, None),
    ]
    assert planned == {row["item_id"]: row for row in expected}
    assert [
        row["item_id"]
        for row in sorted(
            (row for row in planned.values() if row["position"] is not None),
            key=lambda row: row["position"],
            reverse=True,
        )
    ] == [row["item_id"] for row in items[:4]]


def test_empty_singleton_unranked_and_separate_lists():
    items = _sample_data()["items"]
    singleton = items[0] | {"list_id": uuid.uuid4()}
    unranked_unknown_tier = items[4] | {"tier_set": "unknown"}
    assert _plan_items([]) == {}
    assert _plan_items([unranked_unknown_tier]) == {
        unranked_unknown_tier["item_id"]: _expected_item(
            unranked_unknown_tier, None, None
        )
    }
    assert _plan_items([singleton, unranked_unknown_tier]) == {
        singleton["item_id"]: _expected_item(singleton, "a0", 10.0),
        unranked_unknown_tier["item_id"]: _expected_item(
            unranked_unknown_tier, None, None
        ),
    }
    other_list = items[0] | {"item_id": uuid.uuid4(), "list_id": uuid.uuid4()}
    planned = _plan_items([items[0], other_list])
    assert planned[items[0]["item_id"]]["rating"] == 10.0
    assert planned[other_list["item_id"]]["rating"] == 10.0
    assert planned[items[0]["item_id"]]["position"] == "a0"
    assert planned[other_list["item_id"]]["position"] == "a0"


@pytest.mark.parametrize("tier", [None, "", "unknown", "GOOD"])
def test_ranked_items_reject_missing_or_unknown_categories(tier):
    item = _sample_data()["items"][0] | {"tier_set": tier}
    with pytest.raises(MigrationError):
        _plan_items([item])


def test_duplicate_position_within_a_list_and_band_is_rejected():
    item = _sample_data()["items"][0]
    duplicate = item | {"item_id": uuid.uuid4()}
    with pytest.raises(MigrationError):
        _plan_items([item, duplicate])


def test_generated_position_length_boundary(monkeypatch):
    item = _sample_data()["items"][0]
    monkeypatch.setattr(migration, "generate_key_between", lambda *_: "a" * 255)
    assert _plan_items([item])[item["item_id"]]["position"] == "a" * 255
    monkeypatch.setattr(migration, "generate_key_between", lambda *_: "a" * 256)
    with pytest.raises(MigrationError):
        _plan_items([item])


def test_current_ranking_verification_rejects_corrupted_scores_and_positions():
    rows = [
        {"item_id": "best", "list_id": "list", "position": "a3", "rating": 10.0},
        {"item_id": "second", "list_id": "list", "position": "a2", "rating": 6.7},
        {"item_id": "third", "list_id": "list", "position": "a1", "rating": 3.3},
        {"item_id": "worst", "list_id": "list", "position": "a0", "rating": 0.0},
        {"item_id": "draft", "list_id": "list", "position": None, "rating": None},
    ]
    migration._verify_current_items(rows)
    for broken in (
        [rows[0] | {"rating": 9.0}, *rows[1:]],
        [*rows[:4], rows[4] | {"rating": 1.0}],
        [rows[0], rows[1] | {"position": "a3"}, *rows[2:]],
        [rows[0], rows[1] | {"item_id": "best"}, *rows[2:]],
    ):
        with pytest.raises(MigrationError):
            migration._verify_current_items(broken)


def test_session_history_cancels_only_open_sessions_and_clears_snapshots():
    sessions = _sample_data()["sessions"]
    assert _plan_sessions([]) == {}
    assert _plan_sessions(sessions) == {
        row["session_id"]: _expected_session(row) for row in sessions
    }


def test_open_session_revision_overflow_is_rejected():
    session = _sample_data()["sessions"][0] | {"revision": 2_147_483_647}
    with pytest.raises(MigrationError):
        _plan_sessions([session])
    terminal = session | {"status": "completed"}
    assert _plan_sessions([terminal])[terminal["session_id"]] == _expected_session(
        terminal
    )


def _schema_shapes():
    items = set(ITEM_BASE_COLUMNS) | {"name_key"}
    sessions = (set(LEGACY_SESSION_COLUMNS) - {"is_complete"}) | set(
        SESSION_NEW_COLUMNS
    )
    return items, sessions


def test_schema_recognition_requires_both_tier_columns_or_neither():
    items, sessions = _schema_shapes()
    assert classify_schema(items, sessions) == "legacy"
    assert classify_schema(items - {"tier_set"}, sessions - {"tier_set"}) == "current"
    assert classify_schema(items | {"other"}, sessions | {"other"}) == "legacy"
    with pytest.raises(MigrationError):
        classify_schema(items - {"tier_set"}, sessions)
    with pytest.raises(MigrationError):
        classify_schema(items, sessions - {"tier_set"})
    with pytest.raises(MigrationError):
        classify_schema(items, sessions | {"is_complete"})


@pytest.mark.parametrize(
    ("table", "column"),
    [
        ("items", column)
        for column in sorted((ITEM_BASE_COLUMNS - {"tier_set"}) | {"name_key"})
    ]
    + [
        ("sessions", column)
        for column in sorted(
            (LEGACY_SESSION_COLUMNS - {"tier_set", "is_complete"}) | SESSION_NEW_COLUMNS
        )
    ],
)
@pytest.mark.parametrize("current", [False, True])
def test_schema_rejects_missing_prerequisite_columns(table, column, current):
    items, sessions = _schema_shapes()
    if current:
        items.remove("tier_set")
        sessions.remove("tier_set")
    (items if table == "items" else sessions).remove(column)
    with pytest.raises(MigrationError):
        classify_schema(items, sessions)


def test_cli_defaults_to_read_only_and_rejects_conflicting_modes():
    assert _arguments([]).apply is False
    assert _arguments(["--check"]).apply is False
    assert _arguments(["--apply"]).apply is True
    with pytest.raises(SystemExit):
        _arguments(["--check", "--apply"])


def test_only_postgresql_urls_are_accepted():
    assert require_postgresql("postgresql+asyncpg://user@localhost/example") == (
        "postgresql"
    )
    assert require_postgresql("postgresql+psycopg://user@localhost/example") == (
        "postgresql"
    )
    for url in (
        "sqlite+aiosqlite:///:memory:",
        "mysql://localhost/example",
        "not a url",
    ):
        with pytest.raises(MigrationError):
            require_postgresql(url)


def test_cli_refuses_non_postgresql_without_connecting(monkeypatch, capsys):
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("SECRET_KEY", "test-secret-only")
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    get_settings.cache_clear()
    try:
        assert main(["--check"]) == 1
        assert main(["--apply"]) == 1
        assert capsys.readouterr().err.count("PostgreSQL only") == 2
    finally:
        get_settings.cache_clear()


def test_cli_suppresses_unexpected_database_error_details(monkeypatch, capsys):
    async def failed_run(_apply):
        raise RuntimeError("secret-from-driver")

    monkeypatch.setattr(migration, "_run", failed_run)
    assert main(["--apply"]) == 1
    error = capsys.readouterr().err
    assert "database error details suppressed" in error
    assert "secret-from-driver" not in error


@pytest.fixture
def legacy_database(monkeypatch):
    initdb = shutil.which("initdb")
    pg_ctl = shutil.which("pg_ctl")
    if not initdb or not pg_ctl:
        pytest.skip("initdb and pg_ctl are required for isolated PostgreSQL tests")
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        pytest.skip("initdb cannot create a PostgreSQL cluster as root")

    for key in tuple(os.environ):
        if key.startswith("PG"):
            monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("SECRET_KEY", "test-secret-only")

    with tempfile.TemporaryDirectory(prefix="tiernerd-pg-", dir="/tmp") as temporary:
        root = Path(temporary)
        data_dir = root / "data"
        socket_dir = root / "socket"
        socket_dir.mkdir()
        subprocess.run(  # noqa: S603
            [
                initdb,
                "-D",
                str(data_dir),
                "-U",
                "postgres",
                "--auth-local=trust",
                "--auth-host=reject",
                "--no-locale",
                "--encoding=UTF8",
            ],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=60,
        )
        attempted = False
        started = False
        engine = None
        try:
            attempted = True
            subprocess.run(  # noqa: S603
                [
                    pg_ctl,
                    "-D",
                    str(data_dir),
                    "-l",
                    str(root / "postgres.log"),
                    "-o",
                    f"-c listen_addresses='' -c unix_socket_directories={socket_dir} "
                    "-c port=5432",
                    "-w",
                    "-t",
                    "30",
                    "start",
                ],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                timeout=60,
            )
            started = True
            async_url = URL.create(
                "postgresql+asyncpg",
                username="postgres",
                database="postgres",
                query={"host": str(socket_dir), "port": "5432"},
            )
            monkeypatch.setenv(
                "DATABASE_URL", async_url.render_as_string(hide_password=False)
            )
            get_settings.cache_clear()
            engine = create_engine(async_url.set(drivername="postgresql+psycopg"))
            Base.metadata.create_all(engine)
            with engine.begin() as connection:
                connection.execute(text("DROP INDEX ix_items_list_position"))
                connection.execute(
                    text("ALTER TABLE items ADD COLUMN tier_set VARCHAR(10)")
                )
                connection.execute(
                    text(
                        "ALTER TABLE comparison_sessions "
                        "ADD COLUMN tier_set VARCHAR(10) NOT NULL"
                    )
                )
                connection.execute(
                    text(
                        "CREATE UNIQUE INDEX ix_items_list_tier_position "
                        "ON items (list_id, tier_set, position) "
                        "WHERE position IS NOT NULL"
                    )
                )
            metadata = MetaData()
            metadata.reflect(bind=engine)
            data = _sample_data()
            with engine.begin() as connection:
                for table, key in (
                    ("users", "users"),
                    ("lists", "lists"),
                    ("items", "items"),
                    ("comparison_sessions", "sessions"),
                ):
                    connection.execute(metadata.tables[table].insert(), data[key])
            yield engine, data
        finally:
            try:
                if engine is not None:
                    engine.dispose()
            finally:
                get_settings.cache_clear()
                if attempted:
                    subprocess.run(  # noqa: S603
                        [
                            pg_ctl,
                            "-D",
                            str(data_dir),
                            "-m",
                            "fast",
                            "-w",
                            "-t",
                            "30",
                            "stop",
                        ],
                        check=started,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        text=True,
                        timeout=60,
                    )


def _database_state(engine):
    queries = {
        "users": "SELECT * FROM users ORDER BY user_id",
        "lists": "SELECT * FROM lists ORDER BY list_id",
        "items": "SELECT * FROM items ORDER BY item_id",
        "sessions": "SELECT * FROM comparison_sessions ORDER BY session_id",
    }
    with engine.connect() as connection:
        rows = {
            name: [dict(row) for row in connection.execute(text(query)).mappings()]
            for name, query in queries.items()
        }
        columns = connection.execute(
            text(
                "SELECT table_name, column_name, ordinal_position, data_type, "
                "udt_name, is_nullable, character_maximum_length, numeric_precision, "
                "numeric_scale, "
                "column_default FROM information_schema.columns "
                "WHERE table_schema = current_schema() AND table_name IN "
                "('users', 'lists', 'items', 'comparison_sessions') "
                "ORDER BY table_name, ordinal_position"
            )
        ).all()
        indexes = connection.execute(
            text(
                "SELECT tablename, indexname, indexdef FROM pg_indexes "
                "WHERE schemaname = current_schema() AND tablename IN "
                "('users', 'lists', 'items', 'comparison_sessions') "
                "ORDER BY tablename, indexname"
            )
        ).all()
        constraints = connection.execute(
            text(
                "SELECT conrelid::regclass::text, conname, pg_get_constraintdef(oid) "
                "FROM pg_constraint WHERE conrelid IN "
                "('users'::regclass, 'lists'::regclass, 'items'::regclass, "
                "'comparison_sessions'::regclass) ORDER BY 1, 2"
            )
        ).all()
    return {
        "rows": rows,
        "columns": columns,
        "indexes": indexes,
        "constraints": constraints,
    }


def _assert_position_index(engine, name, columns):
    indexes = {index["name"]: index for index in inspect(engine).get_indexes("items")}
    index = indexes[name]
    assert index["unique"] is True
    assert index["column_names"] == columns
    predicate = str(index["dialect_options"]["postgresql_where"])
    assert predicate.lower().replace(" ", "").replace("(", "").replace(")", "") == (
        "positionisnotnull"
    )


def test_postgresql_check_apply_and_idempotent_rerun(legacy_database):
    engine, data = legacy_database
    before = _database_state(engine)
    _assert_position_index(
        engine, "ix_items_list_tier_position", ["list_id", "tier_set", "position"]
    )
    assert main([]) == 0
    assert _database_state(engine) == before
    assert main(["--check"]) == 0
    assert _database_state(engine) == before

    assert main(["--apply"]) == 0
    after = _database_state(engine)
    expected_items = [
        _expected_item(data["items"][0], "a3", 10.0),
        _expected_item(data["items"][1], "a2", 6.7),
        _expected_item(data["items"][2], "a1", 3.3),
        _expected_item(data["items"][3], "a0", 0.0),
        _expected_item(data["items"][4], None, None),
    ]
    assert {row["item_id"]: row for row in after["rows"]["items"]} == {
        row["item_id"]: row for row in expected_items
    }
    assert {row["session_id"]: row for row in after["rows"]["sessions"]} == {
        row["session_id"]: _expected_session(row) for row in data["sessions"]
    }
    assert after["rows"]["users"] == before["rows"]["users"]
    assert after["rows"]["lists"] == before["rows"]["lists"]
    assert after["columns"] == [
        column
        for column in before["columns"]
        if not (
            column[0] in ("items", "comparison_sessions") and column[1] == "tier_set"
        )
    ]
    assert after["constraints"] == before["constraints"]
    old_indexes = {row[1]: (row[0], row[2]) for row in before["indexes"]}
    new_indexes = {row[1]: (row[0], row[2]) for row in after["indexes"]}
    assert old_indexes.pop("ix_items_list_tier_position")[0] == "items"
    assert new_indexes.pop("ix_items_list_position")[0] == "items"
    assert old_indexes == new_indexes
    _assert_position_index(engine, "ix_items_list_position", ["list_id", "position"])

    assert main(["--apply"]) == 0
    assert _database_state(engine) == after
    assert main(["--check"]) == 0
    assert _database_state(engine) == after


def test_postgresql_alter_failure_rolls_back_all_rows_and_schema(legacy_database):
    engine, _ = legacy_database
    assert main(["--check"]) == 0
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE VIEW migration_test_blocker AS "
                "SELECT tier_set FROM comparison_sessions"
            )
        )
    before = _database_state(engine)
    assert main(["--apply"]) == 1
    assert _database_state(engine) == before
    _assert_position_index(
        engine, "ix_items_list_tier_position", ["list_id", "tier_set", "position"]
    )
    with engine.begin() as connection:
        connection.execute(text("DROP VIEW migration_test_blocker"))
    assert main(["--apply"]) == 0
