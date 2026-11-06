"""Tests for CRUD operations."""

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import item as item_crud, list as list_crud
from app.db.models import Item as ItemModel, List as ListModel, User


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
        result = await test_db.execute(
            select(ItemModel).where(ItemModel.list_id == test_list.list_id)
        )
        for item in result.scalars().all():
            await test_db.delete(item)
        await test_db.commit()

        result = await item_crud.get_by_list_id(test_db, test_list.list_id)
        assert result == []

    async def test_get_by_list_id_includes_ranked_and_unranked_items(
        self,
        test_db: AsyncSession,
        test_list: ListModel,
        multiple_items: list[ItemModel],
    ):
        unranked = ItemModel(list_id=test_list.list_id, name="Unranked")
        other_list = ListModel(user_id=test_list.user_id, title="Other list")
        test_db.add_all([unranked, other_list])
        await test_db.flush()
        other_item = ItemModel(list_id=other_list.list_id, name="Other item")
        test_db.add(other_item)
        await test_db.commit()

        result = await item_crud.get_by_list_id(test_db, test_list.list_id)
        assert {item.item_id for item in result} == {
            *(item.item_id for item in multiple_items),
            unranked.item_id,
        }
        assert unranked.position is None
        assert unranked.rating is None

    async def test_ranked_positions_are_unique_per_list(
        self, test_db: AsyncSession, test_list: ListModel, test_item: ItemModel
    ) -> None:
        other_list = ListModel(user_id=test_list.user_id, title="Other list")
        test_db.add(other_list)
        await test_db.flush()
        test_db.add_all(
            [
                ItemModel(list_id=test_list.list_id, name="Unranked one"),
                ItemModel(list_id=test_list.list_id, name="Unranked two"),
                ItemModel(
                    list_id=other_list.list_id,
                    name="Other list item",
                    position=test_item.position,
                    rating=10.0,
                ),
            ]
        )
        await test_db.commit()

        items = await item_crud.get_by_list_id(test_db, test_list.list_id)
        assert {item.name for item in items if item.position is None} == {
            "Unranked one",
            "Unranked two",
        }

        duplicate = ItemModel(
            list_id=test_list.list_id,
            name="Duplicate position",
            position=test_item.position,
            rating=0.0,
        )
        with pytest.raises(IntegrityError):
            await item_crud.create(test_db, duplicate)
        await test_db.rollback()

    async def test_sqlite_duplicate_name_error_classification(
        self, test_db: AsyncSession, test_item: ItemModel
    ) -> None:
        duplicate = ItemModel(
            list_id=test_item.list_id,
            name="  TEST ITEM  ",
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
        constraint_name = "ix_items_list_position"

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

    async def test_delete_list(self, test_db: AsyncSession, test_user: User):
        list_obj = ListModel(
            list_id=uuid.uuid4(),
            user_id=test_user.user_id,
            title="To Delete List",
        )
        test_db.add(list_obj)
        await test_db.flush()
        new_item = ItemModel(
            list_id=list_obj.list_id, name="New", position="a1", rating=10.0
        )
        test_db.add(new_item)
        await test_db.commit()

        list_id = list_obj.list_id
        await list_crud.delete(test_db, list_obj)

        assert await list_crud.get_by_id(test_db, list_id) is None
        assert await item_crud.get_by_id(test_db, new_item.item_id) is None
