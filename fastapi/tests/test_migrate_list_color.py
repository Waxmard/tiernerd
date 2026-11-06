import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine

from app.settings import get_settings
from scripts.migrate_list_appearance import (
    _arguments as appearance_arguments,
    main as appearance_main,
)
from scripts.migrate_list_color import _arguments, main
from scripts.migrate_list_photos import (
    _arguments as photos_arguments,
    main as photos_main,
)


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


def test_appearance_migration_check_and_idempotent_apply(
    legacy_lists_database,
) -> None:
    engine = _sqlite_engine(legacy_lists_database)

    assert {"color", "icon", "cover"}.isdisjoint(_list_columns(engine))
    assert appearance_arguments([]).apply is False
    assert appearance_main(["--check"]) == 0
    assert {"color", "icon", "cover"}.isdisjoint(_list_columns(engine))

    assert appearance_main(["--apply"]) == 0
    assert {"color", "icon", "cover"}.issubset(_list_columns(engine))

    assert appearance_main(["--apply"]) == 0
    assert appearance_main(["--check"]) == 0
    assert {"color", "icon", "cover"}.issubset(_list_columns(engine))

    engine.dispose()


def test_photo_migration_check_and_idempotent_apply(
    legacy_lists_database,
) -> None:
    engine = _sqlite_engine(legacy_lists_database)
    with engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO lists (list_id, title, description) "
                "VALUES ('existing', 'My list', 'Preserve this')"
            )
        )

    original_columns = _list_columns(engine)
    assert photos_arguments([]).apply is False
    assert photos_main(["--check"]) == 0
    assert _list_columns(engine) == original_columns

    assert photos_main(["--apply"]) == 0
    assert _list_columns(engine) == original_columns | {"cover_photo"}
    with engine.connect() as connection:
        column = next(
            column
            for column in inspect(connection).get_columns("lists")
            if column["name"] == "cover_photo"
        )
        assert column["nullable"] is True
        assert str(column["type"]) == "JSON"
        assert connection.execute(
            text("SELECT list_id, title, description, cover_photo FROM lists")
        ).one() == ("existing", "My list", "Preserve this", None)

    assert photos_main(["--apply"]) == 0
    assert photos_main(["--check"]) == 0
    assert _list_columns(engine) == original_columns | {"cover_photo"}
    with engine.connect() as connection:
        assert connection.execute(
            text("SELECT list_id, title, description, cover_photo FROM lists")
        ).one() == ("existing", "My list", "Preserve this", None)
    engine.dispose()
