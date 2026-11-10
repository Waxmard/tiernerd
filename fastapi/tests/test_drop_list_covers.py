from uuid import uuid4

from sqlalchemy import create_engine, insert, inspect, text

from app.db.models import Base, List as ListModel, User
from app.settings import get_settings
from scripts.drop_list_covers import main


def test_drops_cover_columns_only_with_apply(tmp_path, monkeypatch, capsys) -> None:
    path = tmp_path / "covers.db"
    engine = create_engine(f"sqlite:///{path}")
    Base.metadata.create_all(engine)
    user_id, list_id = uuid4(), uuid4()
    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE lists ADD COLUMN cover VARCHAR(16)"))
        connection.execute(text("ALTER TABLE lists ADD COLUMN cover_photo JSON"))
        connection.execute(insert(User), {"user_id": user_id, "email": "a@example.com"})
        connection.execute(
            insert(ListModel), {"list_id": list_id, "user_id": user_id, "title": "Kept"}
        )
        connection.execute(text("UPDATE lists SET cover_photo = '{}'"))

    def columns() -> set[str]:
        return {column["name"] for column in inspect(engine).get_columns("lists")}

    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{path}")
    get_settings.cache_clear()
    try:
        assert main([]) == 0
        assert "lists.cover_photo is set on 1 row(s)" in capsys.readouterr().out
        assert {"cover", "cover_photo"} <= columns()

        assert main(["--apply"]) == 0
        assert "Dropped lists.cover_photo." in capsys.readouterr().out
        assert not {"cover", "cover_photo"} & columns()
        with engine.connect() as connection:
            title = connection.execute(text("SELECT title FROM lists")).scalar_one()
        assert title == "Kept"

        assert main(["--apply"]) == 0
        assert "Nothing to do" in capsys.readouterr().out
    finally:
        get_settings.cache_clear()
        engine.dispose()
