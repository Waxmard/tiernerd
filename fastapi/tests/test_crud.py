"""Tests for CRUD operations."""

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.crud import item as item_crud
from app.db.models import Item as ItemModel, List as ListModel


class TestItemCRUD:
    """Tests for item CRUD operations."""

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
