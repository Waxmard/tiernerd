"""Tests for CRUD operations."""

import uuid
from datetime import datetime

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import comparison as comparison_crud, item as item_crud, list as list_crud
from app.db.models import (
    ComparisonSession as ComparisonSessionModel,
    Item as ItemModel,
    List as ListModel,
    User,
)


@pytest.mark.asyncio
class TestComparisonCRUD:
    async def test_lookup_by_id_and_list_id(
        self, test_db: AsyncSession, test_list: ListModel, test_item: ItemModel
    ) -> None:
        session = ComparisonSessionModel(
            session_id=uuid.uuid4(),
            list_id=test_list.list_id,
            new_item_id=test_item.item_id,
            target_item_id=test_item.item_id,
            tier_set="good",
        )
        test_db.add(session)
        await test_db.commit()

        found = await comparison_crud.get_by_id(test_db, session.session_id)
        assert found is not None and found.session_id == session.session_id
        assert (
            await comparison_crud.get_list_id(test_db, session.session_id)
            == test_list.list_id
        )
        assert await comparison_crud.get_by_id(test_db, uuid.uuid4()) is None

    async def test_get_active_by_item(self, test_db, test_list, test_item) -> None:
        session = ComparisonSessionModel(
            list_id=test_list.list_id,
            new_item_id=test_item.item_id,
            target_item_id=test_item.item_id,
            tier_set="good",
            status="ready_to_commit",
        )
        test_db.add(session)
        await test_db.commit()

        assert await comparison_crud.get_active(test_db, session.session_id) is not None
        assert (
            await comparison_crud.get_active(
                test_db, session.session_id, populate_existing=True
            )
            is not None
        )
        assert (
            await comparison_crud.get_active_by_item(test_db, test_item.item_id)
            is not None
        )

    async def test_completed_session_is_not_active(
        self, test_db: AsyncSession, test_list: ListModel, test_item: ItemModel
    ) -> None:
        session = ComparisonSessionModel(
            list_id=test_list.list_id,
            new_item_id=test_item.item_id,
            target_item_id=None,
            tier_set="good",
            status="completed",
        )
        test_db.add(session)
        await test_db.commit()

        assert await comparison_crud.get_active(test_db, session.session_id) is None
        assert (
            await comparison_crud.get_active_by_item(test_db, test_item.item_id) is None
        )

    async def test_create_session(self, test_db, test_list, test_item) -> None:
        session = ComparisonSessionModel(
            list_id=test_list.list_id,
            new_item_id=test_item.item_id,
            target_item_id=test_item.item_id,
            tier_set="good",
        )
        created = await comparison_crud.create(test_db, session)
        await test_db.commit()
        assert created.session_id == session.session_id
        assert created.list_id == test_list.list_id


@pytest.mark.asyncio
class TestItemCRUD:
    """Tests for item CRUD operations."""

    async def test_get_by_id_with_ownership_success(
        self, test_db: AsyncSession, test_item: ItemModel, test_user: User
    ):
        """Test getting item with ownership verification."""
        result = await item_crud.get_by_id_with_ownership(
            test_db, test_item.item_id, test_user.user_id
        )
        assert result is not None
        assert result.item_id == test_item.item_id

    async def test_get_by_id_with_ownership_wrong_user(
        self, test_db: AsyncSession, test_item: ItemModel, test_user2: User
    ):
        """Test getting item with wrong user returns None."""
        result = await item_crud.get_by_id_with_ownership(
            test_db, test_item.item_id, test_user2.user_id
        )
        assert result is None

    async def test_get_by_list_id(
        self, test_db: AsyncSession, test_list: ListModel, test_item: ItemModel
    ):
        """Test getting all items for a list."""
        result = await item_crud.get_by_list_id(test_db, test_list.list_id)
        assert len(result) >= 1
        assert any(item.item_id == test_item.item_id for item in result)

    async def test_get_by_list_id_empty(
        self, test_db: AsyncSession, test_list: ListModel
    ):
        """Test getting items from list with no items."""
        # Delete any existing items
        result = await test_db.execute(
            select(ItemModel).where(ItemModel.list_id == test_list.list_id)
        )
        for item in result.scalars().all():
            await test_db.delete(item)
        await test_db.commit()

        result = await item_crud.get_by_list_id(test_db, test_list.list_id)
        assert result == []

    async def test_get_by_list_and_tier_set(
        self, test_db: AsyncSession, test_list: ListModel, test_item: ItemModel
    ):
        """Test getting items by list and tier_set."""
        result = await item_crud.get_by_list_and_tier_set(
            test_db, test_list.list_id, "good"
        )
        assert len(result) >= 1

    async def test_get_by_list_and_tier_set_no_match(
        self, test_db: AsyncSession, test_list: ListModel
    ):
        """Test getting items with tier_set that doesn't exist."""
        result = await item_crud.get_by_list_and_tier_set(
            test_db, test_list.list_id, "nonexistent"
        )
        assert result == []

    async def test_create_item(self, test_db: AsyncSession, test_list: ListModel):
        """Test creating an item."""
        item = ItemModel(
            item_id=uuid.uuid4(),
            list_id=test_list.list_id,
            name="New CRUD Item",
            description="Created via CRUD",
            image_url="https://example.com/crud.jpg",
            position="a0",
            rating=None,
            tier_set="good",
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        result = await item_crud.create(test_db, item)
        await test_db.commit()

        assert result.name == "New CRUD Item"
        assert result.item_id is not None

    async def test_update_item(self, test_db: AsyncSession, test_item: ItemModel):
        """Test updating an item."""
        original_name = test_item.name
        result = await item_crud.update(
            test_db, test_item, {"name": "Updated CRUD Name"}
        )
        await test_db.commit()

        assert result.name == "Updated CRUD Name"
        assert result.name != original_name

    async def test_update_item_with_image_url(
        self, test_db: AsyncSession, test_item: ItemModel
    ):
        """Test updating item with image_url."""

        result = await item_crud.update(
            test_db,
            test_item,
            {"image_url": "https://example.com/updated.jpg"},
        )
        await test_db.commit()

        assert result.image_url == "https://example.com/updated.jpg"

    async def test_delete_item(self, test_db: AsyncSession, test_list: ListModel):
        """Test deleting an item."""
        # Create an item to delete
        item = ItemModel(
            item_id=uuid.uuid4(),
            list_id=test_list.list_id,
            name="To Delete",
            description="Will be deleted",
            image_url=None,
            position="a0",
            rating=None,
            tier_set="good",
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        test_db.add(item)
        await test_db.commit()

        item_id = item.item_id
        await item_crud.delete(test_db, item)
        await test_db.commit()

        # Verify deleted
        result = await item_crud.get_by_id(test_db, item_id)
        assert result is None

    async def test_get_by_normalized_name_and_exclude_self(
        self, test_db: AsyncSession, test_list: ListModel, test_item: ItemModel
    ) -> None:
        found = await item_crud.get_by_name_key(test_db, test_list.list_id, "test item")
        assert found is not None and found.item_id == test_item.item_id
        assert (
            await item_crud.get_by_name_key(
                test_db, test_list.list_id, "test item", exclude_id=test_item.item_id
            )
            is None
        )

    async def test_sqlite_duplicate_name_error_classification(
        self, test_db: AsyncSession, test_item: ItemModel
    ) -> None:
        duplicate = ItemModel(
            list_id=test_item.list_id,
            name="  TEST ITEM  ",
            tier_set="mid",
        )
        with pytest.raises(IntegrityError) as caught:
            await item_crud.create(test_db, duplicate)
        assert item_crud.is_duplicate_name_error(caught.value)
        await test_db.rollback()

        unrelated = IntegrityError("insert", {}, Exception("unique conflict"))
        assert not item_crud.is_duplicate_name_error(unrelated)


def test_postgresql_duplicate_name_error_classification() -> None:
    class _Diagnostics:
        constraint_name = "ix_items_list_name_key"

    class _DiagViolation(Exception):
        diag = _Diagnostics()

    class _AttributeViolation(Exception):
        constraint_name = "ix_items_list_name_key"

    class _OtherViolation(Exception):
        constraint_name = "ix_items_list_tier_position"

    assert item_crud.is_duplicate_name_error(
        IntegrityError("insert", {}, _DiagViolation())
    )
    assert item_crud.is_duplicate_name_error(
        IntegrityError("insert", {}, _AttributeViolation())
    )
    assert not item_crud.is_duplicate_name_error(
        IntegrityError("insert", {}, _OtherViolation())
    )


@pytest.mark.asyncio
class TestListCRUD:
    """Tests for list CRUD operations."""

    async def test_get_by_id_and_user(
        self, test_db: AsyncSession, test_list: ListModel, test_user: User
    ):
        """Test getting list by ID with user verification."""
        result = await list_crud.get_by_id_and_user(
            test_db, test_list.list_id, test_user.user_id
        )
        assert result is not None
        assert result.list_id == test_list.list_id

    async def test_get_by_id_and_user_wrong_user(
        self, test_db: AsyncSession, test_list: ListModel, test_user2: User
    ):
        """Test getting list with wrong user returns None."""
        result = await list_crud.get_by_id_and_user(
            test_db, test_list.list_id, test_user2.user_id
        )
        assert result is None

    async def test_get_by_title_and_user(
        self, test_db: AsyncSession, test_list: ListModel, test_user: User
    ):
        """Test getting list by title and user."""
        result = await list_crud.get_by_title_and_user(
            test_db, test_list.title, test_user.user_id
        )
        assert result is not None
        assert result.title == test_list.title

    async def test_get_by_title_and_user_not_found(
        self, test_db: AsyncSession, test_user: User
    ):
        """Test getting list by title that doesn't exist."""
        result = await list_crud.get_by_title_and_user(
            test_db, "Nonexistent Title", test_user.user_id
        )
        assert result is None

    async def test_get_by_user_with_stats(
        self, test_db: AsyncSession, test_list: ListModel, test_user: User
    ):
        """Test getting lists with stats for a user."""
        result = await list_crud.get_by_user_with_stats(test_db, test_user.user_id)
        assert len(result) >= 1
        list_obj = result[0][0]
        assert list_obj.user_id == test_user.user_id

    async def test_create_list(self, test_db: AsyncSession, test_user: User):
        """Test creating a list."""
        list_obj = ListModel(
            list_id=uuid.uuid4(),
            user_id=test_user.user_id,
            title="CRUD Created List",
            description="Created via CRUD",
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        result = await list_crud.create(test_db, list_obj)

        assert result.title == "CRUD Created List"
        assert result.list_id is not None

    async def test_update_list(self, test_db: AsyncSession, test_list: ListModel):
        """Test updating a list."""
        result = await list_crud.update(
            test_db, test_list, {"title": "CRUD Updated Title"}
        )

        assert result.title == "CRUD Updated Title"

    async def test_delete_list(
        self, test_db: AsyncSession, test_user: User, multiple_items: list[ItemModel]
    ):
        list_obj = ListModel(
            list_id=uuid.uuid4(),
            user_id=test_user.user_id,
            title="To Delete List",
        )
        test_db.add(list_obj)
        await test_db.flush()
        new_item = ItemModel(list_id=list_obj.list_id, name="New", position="a1")
        target_item = ItemModel(list_id=list_obj.list_id, name="Target", position="a0")
        test_db.add_all([new_item, target_item])
        await test_db.flush()
        related = ComparisonSessionModel(
            list_id=list_obj.list_id,
            new_item_id=new_item.item_id,
            target_item_id=target_item.item_id,
            tier_set="good",
            status="completed",
        )
        unrelated = ComparisonSessionModel(
            list_id=multiple_items[0].list_id,
            new_item_id=multiple_items[0].item_id,
            target_item_id=multiple_items[1].item_id,
            tier_set="good",
        )
        test_db.add_all([related, unrelated])
        await test_db.commit()

        list_id = list_obj.list_id
        await list_crud.delete(test_db, list_obj)

        assert await list_crud.get_by_id(test_db, list_id) is None
        assert await item_crud.get_by_id(test_db, new_item.item_id) is None
        sessions = await test_db.execute(select(ComparisonSessionModel.session_id))
        assert list(sessions.scalars()) == [unrelated.session_id]
