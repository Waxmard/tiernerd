import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine

from app.settings import get_settings
from scripts.migrate_list_color import _arguments, main


def _sqlite_engine(path) -> Engine:
    return create_engine(f"sqlite:///{path}")


def _list_columns(engine: Engine) -> set[str]:
    with engine.connect() as connection:
        return {column["name"] for column in inspect(connection).get_columns("lists")}


@pytest.fixture
def legacy_lists_database(tmp_path, monkeypatch):
    """A SQLite file with the pre-color `lists` table, wired into settings."""
    path = tmp_path / "lists.db"
    engine = _sqlite_engine(path)
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE lists ("
                "list_id VARCHAR(36) PRIMARY KEY, "
                "title VARCHAR(100) NOT NULL, "
                "description TEXT)"
            )
        )
    engine.dispose()

    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{path}")
    get_settings.cache_clear()
    yield path
    get_settings.cache_clear()


def test_check_reports_the_missing_column_without_writing(
    legacy_lists_database,
) -> None:
    engine = _sqlite_engine(legacy_lists_database)

    assert "color" not in _list_columns(engine)
    assert _arguments([]).apply is False
    assert main(["--check"]) == 0
    assert "color" not in _list_columns(engine)

    engine.dispose()


def test_apply_adds_the_column_once_and_is_a_no_op_afterwards(
    legacy_lists_database,
) -> None:
    engine = _sqlite_engine(legacy_lists_database)

    assert main(["--apply"]) == 0
    assert "color" in _list_columns(engine)

    assert main(["--apply"]) == 0
    assert main(["--check"]) == 0
    assert "color" in _list_columns(engine)

    engine.dispose()
