import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from app.db import database as db_module
from app.settings import get_settings
from scripts.migrate_drop_comparison_sessions import (
    _arguments,
    main,
)


def _sqlite_engine(path) -> Engine:
    return create_engine(f"sqlite:///{path}")


def _has_table(engine: Engine, name: str) -> bool:
    with engine.connect() as connection:
        return inspect(connection).has_table(name)


@pytest.fixture
def sessions_database(tmp_path, monkeypatch, capsys):
    """SQLite file holding a comparison_sessions table with one row."""
    path = tmp_path / "sessions.db"
    engine = _sqlite_engine(path)
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE comparison_sessions ("
                "session_id VARCHAR(36) PRIMARY KEY, "
                "list_id VARCHAR(36) NOT NULL)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO comparison_sessions (session_id, list_id) "
                "VALUES ('s1', 'l1')"
            )
        )
    engine.dispose()

    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{path}")
    get_settings.cache_clear()
    yield path, capsys
    get_settings.cache_clear()


def test_check_reports_rows_without_dropping(sessions_database) -> None:
    path, capsys = sessions_database
    engine = _sqlite_engine(path)

    assert _arguments([]).apply is False
    assert main(["--check"]) == 0
    assert "1 row" in capsys.readouterr().out
    assert _has_table(engine, "comparison_sessions")

    engine.dispose()


def test_apply_drops_the_table_and_check_then_counts_zero(sessions_database) -> None:
    path, capsys = sessions_database
    engine = _sqlite_engine(path)

    assert main(["--apply"]) == 0
    assert not _has_table(engine, "comparison_sessions")
    capsys.readouterr()

    assert main(["--check"]) == 0
    assert "does not exist" in capsys.readouterr().out

    assert main(["--apply"]) == 0

    engine.dispose()


def test_apply_refuses_without_a_database_url(monkeypatch, capsys) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("DATABASE_URL", "")
    get_settings.cache_clear()
    try:
        assert main(["--check"]) == 1
        assert "DATABASE_URL" in capsys.readouterr().err
    finally:
        get_settings.cache_clear()


async def test_create_tables_drops_legacy_comparison_sessions(
    test_db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    bind = test_db.bind
    assert isinstance(bind, AsyncEngine)
    async with bind.begin() as conn:
        await conn.execute(
            text("CREATE TABLE comparison_sessions (session_id VARCHAR(36))")
        )

    monkeypatch.setattr(db_module, "engine", bind)
    await db_module.create_tables()

    async with bind.connect() as conn:
        has_sessions = await conn.run_sync(
            lambda sync_conn: inspect(sync_conn).has_table("comparison_sessions")
        )
    assert not has_sessions
