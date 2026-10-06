"""Test configuration and fixtures."""

import asyncio
import os
from collections.abc import AsyncGenerator, Generator

# Set test environment variables before importing app
os.environ["SECRET_KEY"] = "test-secret-key-for-testing-only"
os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["APP_ENV"] = "test"

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.security import get_password_hash
from app.db.database import get_db
from app.db.models import Base, Item as ItemModel, List as ListModel, User
from app.main import app
from app.services.auth import create_access_token

# Test database URL - using SQLite for tests
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Create an event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def test_db() -> AsyncGenerator[AsyncSession]:
    """Create a test database session."""
    # Create async engine for testing
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        connect_args={"check_same_thread": False},
    )

    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Create session
    async_session = async_sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session() as session:
        yield session
        await session.rollback()

    # Drop tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def client(test_db: AsyncSession) -> AsyncGenerator[AsyncClient]:
    """Create a test client with overridden database dependency."""

    async def override_get_db() -> AsyncGenerator[AsyncSession]:
        yield test_db

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_user(test_db: AsyncSession) -> User:
    """Create a test user."""
    import uuid
    from datetime import datetime

    user = User(
        user_id=uuid.uuid4(),
        email="test@example.com",
        username="testuser",
        password_hash=get_password_hash("testpassword123"),
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_user2(test_db: AsyncSession) -> User:
    """Create a second test user."""
    import uuid
    from datetime import datetime

    user = User(
        user_id=uuid.uuid4(),
        email="test2@example.com",
        username="testuser2",
        password_hash=get_password_hash("testpassword456"),
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user


@pytest.fixture
def auth_headers(test_user: User) -> dict:
    """Generate authentication headers for test user."""
    access_token = create_access_token(subject=test_user.user_id)
    return {"Authorization": f"Bearer {access_token}"}


@pytest.fixture
def auth_headers_user2(test_user2: User) -> dict:
    """Generate authentication headers for second test user."""
    access_token = create_access_token(subject=test_user2.user_id)
    return {"Authorization": f"Bearer {access_token}"}


@pytest_asyncio.fixture
async def admin_user(test_db: AsyncSession) -> User:
    """Create an admin test user."""
    import uuid
    from datetime import datetime

    user = User(
        user_id=uuid.uuid4(),
        email="admin@example.com",
        username="adminuser",
        password_hash=get_password_hash("adminpassword123"),
        is_admin=True,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    test_db.add(user)
    await test_db.commit()
    await test_db.refresh(user)
    return user


@pytest.fixture
def admin_auth_headers(admin_user: User) -> dict:
    """Generate authentication headers for admin user."""
    access_token = create_access_token(subject=admin_user.user_id)
    return {"Authorization": f"Bearer {access_token}"}


@pytest_asyncio.fixture
async def test_list(test_db: AsyncSession, test_user: User) -> ListModel:
    """Create a test list."""
    import uuid
    from datetime import datetime

    list_obj = ListModel(
        list_id=uuid.uuid4(),
        user_id=test_user.user_id,
        title="Test List",
        description="A test list for testing",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    test_db.add(list_obj)
    await test_db.commit()
    await test_db.refresh(list_obj)
    return list_obj


@pytest_asyncio.fixture
async def test_item(test_db: AsyncSession, test_list: ListModel) -> ItemModel:
    """Create a test item with tier_set and valid position."""
    import uuid
    from datetime import datetime

    item = ItemModel(
        item_id=uuid.uuid4(),
        list_id=test_list.list_id,
        name="Test Item",
        description="A test item",
        image_url="https://example.com/image.jpg",
        position="a0",
        rating=None,
        tier="A",
        tier_set="good",
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )
    test_db.add(item)
    await test_db.commit()
    await test_db.refresh(item)
    return item


@pytest_asyncio.fixture
async def multiple_items(
    test_db: AsyncSession, test_list: ListModel
) -> list[ItemModel]:
    """Create multiple test items with tier_set and positions."""
    import uuid
    from datetime import datetime

    items = []
    positions = ["a0", "a1", "a2", "a3", "a4"]
    for i in range(5):
        item = ItemModel(
            item_id=uuid.uuid4(),
            list_id=test_list.list_id,
            name=f"Test Item {i + 1}",
            description=f"Test item number {i + 1}",
            image_url=f"https://example.com/image{i + 1}.jpg",
            position=positions[i],
            rating=None,
            tier="A" if i < 3 else "S",
            tier_set="good",
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        test_db.add(item)
        items.append(item)

    await test_db.commit()
    for item in items:
        await test_db.refresh(item)
    return items


@pytest.fixture
def item_factory(test_list: ListModel):
    """Factory fixture for creating ItemModel instances with defaults."""
    import uuid as uuid_module
    from datetime import datetime

    def _create_item(
        name: str = "Test Item",
        tier: str | None = "A",
        tier_set: str = "good",
        description: str = "",
        image_url: str | None = None,
        position: str | None = "a0",
        rating: float | None = None,
        list_id=None,
    ) -> ItemModel:
        return ItemModel(
            item_id=uuid_module.uuid4(),
            list_id=list_id or test_list.list_id,
            name=name,
            description=description,
            image_url=image_url,
            position=position,
            rating=rating,
            tier=tier,
            tier_set=tier_set,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )

    return _create_item
