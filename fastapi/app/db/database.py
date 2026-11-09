import sys
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.db.models import Base
from app.settings import get_settings

connect_args: dict[str, Any] = {}
pool_kwargs: dict[str, Any] = {}
if get_settings().APP_ENV == "production":
    # connect_args reach asyncpg.connect(); pool sizing belongs to the engine.
    connect_args = {
        "server_settings": {"jit": "off"},
        "command_timeout": 60,
    }
    pool_kwargs = {
        "pool_size": 20,
        "max_overflow": 40,
    }

engine = create_async_engine(
    str(get_settings().DATABASE_URL),
    echo=False,
    pool_pre_ping=True,
    pool_recycle=3600,
    connect_args=connect_args,
    **pool_kwargs,
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

_STARTUP_COLUMNS: tuple[tuple[str, str, str], ...] = (
    ("users", "photo_url", "ALTER TABLE users ADD COLUMN photo_url TEXT"),
    ("lists", "color", "ALTER TABLE lists ADD COLUMN color VARCHAR(16)"),
    ("lists", "icon", "ALTER TABLE lists ADD COLUMN icon VARCHAR(16)"),
    ("lists", "cover", "ALTER TABLE lists ADD COLUMN cover VARCHAR(16)"),
    ("lists", "cover_photo", "ALTER TABLE lists ADD COLUMN cover_photo JSON"),
    (
        "lists",
        "ranking_mode",
        "ALTER TABLE lists ADD COLUMN ranking_mode "
        "VARCHAR(16) NOT NULL DEFAULT 'score'",
    ),
    (
        "items",
        "manual_rating",
        "ALTER TABLE items ADD COLUMN manual_rating DOUBLE PRECISION",
    ),
)


def _ensure_columns(connection: Connection) -> None:
    inspector = inspect(connection)
    for table, column, ddl in _STARTUP_COLUMNS:
        if column not in {col["name"] for col in inspector.get_columns(table)}:
            connection.execute(text(ddl))


async def get_db() -> AsyncGenerator[AsyncSession]:
    """
    Dependency function that yields db sessions.

    Usage:
        @app.get("/users/")
        async def get_users(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def create_tables() -> None:
    """Create all database tables and seed dev users."""
    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    from scripts.migrate_manual_ratings import apply_connection  # noqa: PLC0415

    async with engine.begin() as conn:
        await conn.execute(text("DROP TABLE IF EXISTS comparison_sessions"))
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_ensure_columns)
        await apply_connection(conn)

    # Auto-seed dev users in development. `scripts/` lives outside the `app`
    # package and is dev-only, so the import stays lazy + scoped here.
    if get_settings().APP_ENV == "development":
        from scripts.seed import seed_users  # noqa: PLC0415

        async with SessionLocal() as session:
            await seed_users(session)
