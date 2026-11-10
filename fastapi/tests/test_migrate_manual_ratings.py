import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import create_async_engine

from app.db import database as db_module
from app.settings import get_settings
from scripts.migrate_manual_ratings import main


def _sqlite_engine(path) -> Engine:
    return create_engine(f"sqlite:///{path}")


def _has_column(engine: Engine, table: str, column: str) -> bool:
    with engine.connect() as connection:
        return any(
            col["name"] == column for col in inspect(connection).get_columns(table)
        )


@pytest.fixture
def legacy_items_database(tmp_path, monkeypatch, capsys):
    path = tmp_path / "legacy_items.db"
    engine = _sqlite_engine(path)
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE items ("
                "item_id VARCHAR(36) PRIMARY KEY, "
                "list_id VARCHAR(36) NOT NULL, "
                "name VARCHAR(100) NOT NULL, "
                "position VARCHAR(255), "
                "rating DOUBLE PRECISION)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO items (item_id, list_id, name, position, rating) VALUES "
                "('i1', 'l1', 'First', 'a2', 10.0), "
                "('i2', 'l1', 'Second', 'a1', 5.0), "
                "('i3', 'l1', 'Third', 'a0', 0.0), "
                "('i4', 'l1', 'Unranked', NULL, NULL)"
            )
        )
    engine.dispose()

    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{path}")
    get_settings.cache_clear()
    yield path, capsys
    get_settings.cache_clear()


def test_check_reports_missing_column_and_mismatches_without_mutating(
    legacy_items_database,
) -> None:
    path, capsys = legacy_items_database
    engine = _sqlite_engine(path)

    assert main(["--check"]) == 0
    out = capsys.readouterr().out
    assert "missing" in out
    assert "3 row(s) need score updates" in out
    assert not _has_column(engine, "items", "manual_rating")

    engine.dispose()


def test_apply_adds_column_rescores_and_is_idempotent(legacy_items_database) -> None:
    path, capsys = legacy_items_database
    engine = _sqlite_engine(path)

    assert main(["--apply"]) == 0
    assert _has_column(engine, "items", "manual_rating")
    capsys.readouterr()

    with engine.connect() as connection:
        rows = (
            connection.execute(
                text(
                    "SELECT item_id, rating, manual_rating FROM items ORDER BY item_id"
                )
            )
            .mappings()
            .all()
        )
    assert [dict(r) for r in rows] == [
        {"item_id": "i1", "rating": 8.0, "manual_rating": None},
        {"item_id": "i2", "rating": 6.5, "manual_rating": None},
        {"item_id": "i3", "rating": 4.6, "manual_rating": None},
        {"item_id": "i4", "rating": None, "manual_rating": None},
    ]

    assert main(["--check"]) == 0
    out = capsys.readouterr().out
    assert "present" in out
    assert "0 row(s) need score updates" in out

    assert main(["--apply"]) == 0
    with engine.connect() as connection:
        again = (
            connection.execute(
                text(
                    "SELECT item_id, rating, manual_rating FROM items ORDER BY item_id"
                )
            )
            .mappings()
            .all()
        )
    assert [dict(r) for r in again] == [dict(r) for r in rows]
    engine.dispose()


async def test_create_tables_adds_column_and_rescores_legacy_items(
    legacy_items_database, monkeypatch
) -> None:
    path, _capsys = legacy_items_database
    engine = create_async_engine(f"sqlite+aiosqlite:///{path}")
    monkeypatch.setattr(db_module, "engine", engine)
    monkeypatch.setattr(get_settings(), "APP_ENV", "production")
    try:
        await db_module.create_tables()
    finally:
        await engine.dispose()

    sync_engine = _sqlite_engine(path)
    try:
        assert _has_column(sync_engine, "items", "manual_rating")
        with sync_engine.connect() as connection:
            rows = (
                connection.execute(
                    text("SELECT item_id, rating FROM items ORDER BY item_id")
                )
                .mappings()
                .all()
            )
    finally:
        sync_engine.dispose()
    assert [dict(row) for row in rows] == [
        {"item_id": "i1", "rating": 8.0},
        {"item_id": "i2", "rating": 6.5},
        {"item_id": "i3", "rating": 4.6},
        {"item_id": "i4", "rating": None},
    ]


async def test_create_tables_drops_retired_list_cover_columns(
    legacy_items_database, monkeypatch
) -> None:
    path, _capsys = legacy_items_database
    sync_engine = _sqlite_engine(path)
    with sync_engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE lists (list_id VARCHAR(36) PRIMARY KEY, "
                "cover VARCHAR(32), cover_photo VARCHAR(36))"
            )
        )
    engine = create_async_engine(f"sqlite+aiosqlite:///{path}")
    monkeypatch.setattr(db_module, "engine", engine)
    monkeypatch.setattr(get_settings(), "APP_ENV", "production")
    try:
        await db_module.create_tables()
    finally:
        await engine.dispose()

    try:
        assert not _has_column(sync_engine, "lists", "cover")
        assert not _has_column(sync_engine, "lists", "cover_photo")
    finally:
        sync_engine.dispose()


def test_apply_preserves_existing_manual_rating_pins(legacy_items_database) -> None:
    path, _capsys = legacy_items_database
    engine = _sqlite_engine(path)

    assert main(["--apply"]) == 0
    with engine.begin() as connection:
        connection.execute(
            text(
                "UPDATE items SET manual_rating = 7.0, rating = 1.0 "
                "WHERE item_id = 'i3'"
            )
        )

    assert main(["--apply"]) == 0
    with engine.connect() as connection:
        rows = (
            connection.execute(
                text(
                    "SELECT item_id, rating, manual_rating FROM items "
                    "WHERE position IS NOT NULL ORDER BY position DESC"
                )
            )
            .mappings()
            .all()
        )
    assert [dict(r) for r in rows] == [
        {"item_id": "i1", "rating": 8.7, "manual_rating": None},
        {"item_id": "i2", "rating": 7.8, "manual_rating": None},
        {"item_id": "i3", "rating": 7.0, "manual_rating": 7.0},
    ]
    engine.dispose()


def test_refuses_without_database_url(monkeypatch, capsys) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("DATABASE_URL", "")
    get_settings.cache_clear()
    try:
        assert main(["--check"]) == 1
        assert "DATABASE_URL" in capsys.readouterr().err
    finally:
        get_settings.cache_clear()
