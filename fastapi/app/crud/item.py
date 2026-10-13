import sqlite3
import uuid
from typing import Any

from sqlalchemy import delete as sql_delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ComparisonSession as ComparisonSessionModel,
    Item as ItemModel,
    List as ListModel,
)


async def get_by_id(
    db: AsyncSession, item_id: uuid.UUID, *, populate_existing: bool = True
) -> ItemModel | None:
    query = select(ItemModel).where(ItemModel.item_id == item_id)
    if populate_existing:
        query = query.execution_options(populate_existing=True)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_by_id_with_ownership(
    db: AsyncSession,
    item_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    populate_existing: bool = True,
) -> ItemModel | None:
    query = (
        select(ItemModel)
        .join(ListModel, ItemModel.list_id == ListModel.list_id)
        .where(ItemModel.item_id == item_id, ListModel.user_id == user_id)
    )
    if populate_existing:
        query = query.execution_options(populate_existing=True)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_list_id_by_id_with_ownership(
    db: AsyncSession, item_id: uuid.UUID, user_id: uuid.UUID
) -> uuid.UUID | None:
    result = await db.execute(
        select(ItemModel.list_id)
        .join(ListModel, ItemModel.list_id == ListModel.list_id)
        .where(ItemModel.item_id == item_id, ListModel.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def get_by_name_key(
    db: AsyncSession,
    list_id: uuid.UUID,
    name_key: str,
    exclude_id: uuid.UUID | None = None,
) -> ItemModel | None:
    query = select(ItemModel).where(
        ItemModel.list_id == list_id, ItemModel.name_key == name_key
    )
    if exclude_id is not None:
        query = query.where(ItemModel.item_id != exclude_id)
    result = await db.execute(query.execution_options(populate_existing=True))
    return result.scalar_one_or_none()


def is_duplicate_name_error(error: IntegrityError) -> bool:
    original = error.orig
    constraint = getattr(getattr(original, "diag", None), "constraint_name", None)
    if (
        constraint == "ix_items_list_name_key"
        or getattr(original, "constraint_name", None) == "ix_items_list_name_key"
    ):
        return True
    return (
        getattr(original, "sqlite_errorcode", None) == sqlite3.SQLITE_CONSTRAINT_UNIQUE
        and str(original) == "UNIQUE constraint failed: items.list_id, items.name_key"
    )


async def get_by_list_id(
    db: AsyncSession, list_id: uuid.UUID, *, populate_existing: bool = True
) -> list[ItemModel]:
    query = select(ItemModel).where(ItemModel.list_id == list_id)
    if populate_existing:
        query = query.execution_options(populate_existing=True)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_by_list_and_tier_set(
    db: AsyncSession,
    list_id: uuid.UUID,
    tier_set: str,
    *,
    populate_existing: bool = True,
) -> list[ItemModel]:
    query = select(ItemModel).where(
        ItemModel.list_id == list_id,
        ItemModel.tier_set == tier_set,
    )
    if populate_existing:
        query = query.execution_options(populate_existing=True)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_ranked_by_list_and_tier_set(
    db: AsyncSession,
    list_id: uuid.UUID,
    tier_set: str,
    *,
    populate_existing: bool = True,
) -> list[ItemModel]:
    query = (
        select(ItemModel)
        .where(
            ItemModel.list_id == list_id,
            ItemModel.tier_set == tier_set,
            ItemModel.position.isnot(None),
        )
        .order_by(ItemModel.position)
    )
    if populate_existing:
        query = query.execution_options(populate_existing=True)
    result = await db.execute(query)
    return list(result.scalars().all())


async def create(db: AsyncSession, item: ItemModel) -> ItemModel:
    db.add(item)
    await db.flush()
    return item


async def update(
    db: AsyncSession, item: ItemModel, update_data: dict[str, Any]
) -> ItemModel:
    for field, value in update_data.items():
        new_value = str(value) if field == "image_url" and value is not None else value
        setattr(item, field, new_value)
    db.add(item)
    await db.flush()
    return item


async def delete(db: AsyncSession, item: ItemModel) -> None:
    await db.execute(
        sql_delete(ComparisonSessionModel).where(
            (ComparisonSessionModel.new_item_id == item.item_id)
            | (ComparisonSessionModel.target_item_id == item.item_id)
        )
    )
    await db.delete(item)
