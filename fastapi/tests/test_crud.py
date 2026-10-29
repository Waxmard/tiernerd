"""Tests for CRUD operations."""

import uuid

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

    async def test_get_by_list_and_tier_set_no_match(
        self, test_db: AsyncSession, test_list: ListModel
    ):
        """Test getting items with tier_set that doesn't exist."""
        result = await item_crud.get_by_list_and_tier_set(
            test_db, test_list.list_id, "nonexistent"
        )
        assert result == []

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
