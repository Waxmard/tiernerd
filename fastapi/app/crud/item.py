import uuid
from typing import Any

from sqlalchemy import delete as sql_delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ComparisonSession as ComparisonSessionModel,
    Item as ItemModel,
    List as ListModel,
)


async def get_by_id(db: AsyncSession, item_id: uuid.UUID) -> ItemModel | None:
    """Get an item by ID."""
    result = await db.execute(select(ItemModel).where(ItemModel.item_id == item_id))
    return result.scalar_one_or_none()


async def get_by_id_with_ownership(
    db: AsyncSession, item_id: uuid.UUID, user_id: uuid.UUID
) -> ItemModel | None:
    """Get an item by ID, verifying the user owns the list it belongs to."""
    query = (
        select(ItemModel)
        .join(ListModel, ItemModel.list_id == ListModel.list_id)
        .where(ItemModel.item_id == item_id, ListModel.user_id == user_id)
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_by_list_id(db: AsyncSession, list_id: uuid.UUID) -> list[ItemModel]:
    """Get all items for a list."""
    result = await db.execute(select(ItemModel).where(ItemModel.list_id == list_id))
    return list(result.scalars().all())


async def get_by_list_and_tier_set(
    db: AsyncSession, list_id: uuid.UUID, tier_set: str
) -> list[ItemModel]:
    """Get all items in a list with a specific tier_set."""
    result = await db.execute(
        select(ItemModel).where(
            ItemModel.list_id == list_id,
            ItemModel.tier_set == tier_set,
        )
    )
    return list(result.scalars().all())


async def get_ranked_by_list_and_tier_set(
    db: AsyncSession, list_id: uuid.UUID, tier_set: str
) -> list[ItemModel]:
    """Get ranked items in a list with a specific tier_set, sorted by position."""
    result = await db.execute(
        select(ItemModel)
        .where(
            ItemModel.list_id == list_id,
            ItemModel.tier_set == tier_set,
            ItemModel.position.isnot(None),
        )
        .order_by(ItemModel.position)
    )
    return list(result.scalars().all())


async def create(db: AsyncSession, item: ItemModel) -> ItemModel:
    """Create a new item (add to session, commit not performed)."""
    db.add(item)
    await db.flush()
    return item


async def update(
    db: AsyncSession, item: ItemModel, update_data: dict[str, Any]
) -> ItemModel:
    """Update an item with the given data."""
    for field, value in update_data.items():
        new_value = str(value) if field == "image_url" and value is not None else value
        setattr(item, field, new_value)
    db.add(item)
    await db.flush()
    return item


async def delete(db: AsyncSession, item: ItemModel) -> None:
    """Delete an item."""
    await db.execute(
        sql_delete(ComparisonSessionModel).where(
            (ComparisonSessionModel.new_item_id == item.item_id)
            | (ComparisonSessionModel.target_item_id == item.item_id)
        )
    )
    await db.delete(item)


async def get_next_item_by_position(
    db: AsyncSession,
    list_id: uuid.UUID,
    tier_set: str,
    current_position: str,
) -> ItemModel | None:
    """Get item with next higher position (lexicographically)."""
    result = await db.execute(
        select(ItemModel)
        .where(
            ItemModel.list_id == list_id,
            ItemModel.tier_set == tier_set,
            ItemModel.position > current_position,
            ItemModel.position.isnot(None),
        )
        .order_by(ItemModel.position.asc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_prev_item_by_position(
    db: AsyncSession,
    list_id: uuid.UUID,
    tier_set: str,
    current_position: str,
) -> ItemModel | None:
    """Get item with next lower position (lexicographically)."""
    result = await db.execute(
        select(ItemModel)
        .where(
            ItemModel.list_id == list_id,
            ItemModel.tier_set == tier_set,
            ItemModel.position < current_position,
            ItemModel.position.isnot(None),
        )
        .order_by(ItemModel.position.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()
