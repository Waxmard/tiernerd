import pytest
from sqlalchemy import Text, create_engine, inspect, text
from sqlalchemy.engine import Engine

from app.settings import get_settings
from scripts import migrate_google_auth
from scripts.migrate_google_auth import _arguments, main


@pytest.fixture
def database(tmp_path, monkeypatch):
    path = tmp_path / "google-auth.db"
    engine = create_engine(f"sqlite:///{path}")
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{path}")
    get_settings.cache_clear()
    yield engine
    engine.dispose()
    get_settings.cache_clear()


def _create_tables(engine: Engine, *, photo: bool, password: bool) -> None:
    users = [
        {
            "user_id": "11111111-1111-4111-8111-111111111111",
            "email": "owner@example.com",
            "username": "owner",
            "is_admin": True,
            "photo_url": "https://example.com/existing.png",
            "password_hash": "legacy-hash-one",
        },
        {
            "user_id": "22222222-2222-4222-8222-222222222222",
            "email": "other@example.com",
            "username": None,
            "is_admin": False,
            "photo_url": None,
            "password_hash": "legacy-hash-two",
        },
    ]
    with engine.begin() as connection:
        connection.execute(text("PRAGMA foreign_keys=ON"))
        connection.execute(
            text(
                "CREATE TABLE users (user_id VARCHAR(36) PRIMARY KEY, "
                "email VARCHAR(100) NOT NULL UNIQUE, username VARCHAR(50) UNIQUE, "
                "is_admin BOOLEAN NOT NULL, password_hash VARCHAR(255) NOT NULL)"
            )
        )
        connection.execute(
            text(
                "CREATE TABLE lists (list_id VARCHAR(36) PRIMARY KEY, "
                "user_id VARCHAR(36) NOT NULL REFERENCES users(user_id), "
                "title VARCHAR(100) NOT NULL)"
            )
        )
        connection.execute(
            text(
                "CREATE TABLE items (item_id VARCHAR(36) PRIMARY KEY, "
                "list_id VARCHAR(36) NOT NULL REFERENCES lists(list_id), "
                "name VARCHAR(100) NOT NULL)"
            )
        )
        connection.execute(
            text(
                "INSERT INTO users (user_id, email, username, is_admin, password_hash) "
                "VALUES (:user_id, :email, :username, :is_admin, :password_hash)"
            ),
            users,
        )
        connection.execute(
            text(
                "INSERT INTO lists VALUES "
                "('33333333-3333-4333-8333-333333333333', :owner, 'Owned list')"
            ),
            {"owner": users[0]["user_id"]},
        )
        connection.execute(
            text(
                "INSERT INTO items VALUES "
                "('44444444-4444-4444-8444-444444444444', "
                "'33333333-3333-4333-8333-333333333333', 'Saved item')"
            )
        )
        if photo:
            connection.execute(text("ALTER TABLE users ADD COLUMN photo_url TEXT"))
            connection.execute(
                text(
                    "UPDATE users SET photo_url = :photo_url WHERE user_id = :user_id"
                ),
                users,
            )
        if not password:
            connection.execute(text("ALTER TABLE users DROP COLUMN password_hash"))


def _snapshot(engine: Engine) -> tuple:
    with engine.connect() as connection:
        return (
            tuple(
                connection.execute(text("SELECT * FROM sqlite_master ORDER BY name"))
            ),
            tuple(connection.execute(text("SELECT * FROM users ORDER BY user_id"))),
            tuple(connection.execute(text("SELECT * FROM lists ORDER BY list_id"))),
            tuple(connection.execute(text("SELECT * FROM items ORDER BY item_id"))),
        )


SCHEMA_STATES = [
    pytest.param(False, True, id="legacy"),
    pytest.param(True, True, id="photo-already-added"),
    pytest.param(False, False, id="password-already-removed"),
    pytest.param(True, False, id="current"),
]


@pytest.mark.parametrize(("photo", "password"), SCHEMA_STATES)
def test_check_and_default_are_read_only(database, photo: bool, password: bool) -> None:
    _create_tables(database, photo=photo, password=password)
    before = _snapshot(database)

    assert _arguments([]).apply is False
    assert main([]) == 0
    assert main(["--check"]) == 0
    assert _snapshot(database) == before


@pytest.mark.parametrize(("photo", "password"), SCHEMA_STATES)
def test_apply_preserves_accounts_and_ownership_and_is_idempotent(
    database, photo: bool, password: bool
) -> None:
    _create_tables(database, photo=photo, password=password)

    assert main(["--apply"]) == 0
    columns = {
        column["name"]: column for column in inspect(database).get_columns("users")
    }
    assert "password_hash" not in columns
    assert isinstance(columns["photo_url"]["type"], Text)
    assert columns["photo_url"]["nullable"] is True

    with database.connect() as connection:
        users = connection.execute(
            text(
                "SELECT user_id, email, username, is_admin, photo_url "
                "FROM users ORDER BY user_id"
            )
        ).all()
        ownership = connection.execute(
            text(
                "SELECT users.user_id, lists.list_id, lists.title, items.item_id, "
                "items.name FROM users JOIN lists ON lists.user_id = users.user_id "
                "JOIN items ON items.list_id = lists.list_id"
            )
        ).all()
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []

    assert users == [
        (
            "11111111-1111-4111-8111-111111111111",
            "owner@example.com",
            "owner",
            1,
            "https://example.com/existing.png" if photo else None,
        ),
        ("22222222-2222-4222-8222-222222222222", "other@example.com", None, 0, None),
    ]
    assert ownership == [
        (
            "11111111-1111-4111-8111-111111111111",
            "33333333-3333-4333-8333-333333333333",
            "Owned list",
            "44444444-4444-4444-8444-444444444444",
            "Saved item",
        )
    ]
    foreign_keys = inspect(database)
    assert foreign_keys.get_foreign_keys("lists")[0]["referred_table"] == "users"
    assert foreign_keys.get_foreign_keys("items")[0]["referred_table"] == "lists"

    after = _snapshot(database)
    assert main(["--apply"]) == 0
    assert main(["--check"]) == 0
    assert _snapshot(database) == after


def test_missing_users_table_is_an_error(database, capsys) -> None:
    assert main(["--check"]) == 1
    assert main(["--apply"]) == 1
    assert "users table is missing" in capsys.readouterr().err
    assert inspect(database).get_table_names() == []


def test_failed_apply_rolls_back_schema_changes(database, capsys) -> None:
    _create_tables(database, photo=False, password=True)
    with database.begin() as connection:
        connection.execute(text("CREATE INDEX password_index ON users(password_hash)"))
    before = _snapshot(database)

    assert main(["--apply"]) == 1
    assert "database error details suppressed" in capsys.readouterr().err
    assert _snapshot(database) == before


def test_database_error_details_are_not_printed(database, monkeypatch, capsys) -> None:
    def fail(*args, **kwargs):
        raise RuntimeError("sensitive database details")

    monkeypatch.setattr(migrate_google_auth, "create_async_engine", fail)
    assert main(["--check"]) == 1
    captured = capsys.readouterr()
    assert "database error details suppressed" in captured.err
    assert "sensitive database details" not in captured.err + captured.out


def test_help_warns_about_irreversible_upgrade(capsys) -> None:
    with pytest.raises(SystemExit) as exit_info:
        _arguments(["--help"])
    assert exit_info.value.code == 0
    help_text = " ".join(capsys.readouterr().out.split())
    assert "permanently discards password hashes" in help_text
    assert "database backup" in help_text
    assert "stop the old application" in help_text
