import uuid
from typing import Any

from sqlalchemy import delete as sql_delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ComparisonSession as ComparisonSessionModel,
    Item as ItemModel,
    List as ListModel,
)


async def get_by_id(db: AsyncSession, list_id: uuid.UUID) -> ListModel | None:
    """Get a list by ID."""
    result = await db.execute(select(ListModel).where(ListModel.list_id == list_id))
    return result.scalar_one_or_none()


async def get_by_id_and_user(
    db: AsyncSession, list_id: uuid.UUID, user_id: uuid.UUID
) -> ListModel | None:
    """Get a list by ID, verifying user ownership."""
    result = await db.execute(
        select(ListModel).where(
            ListModel.list_id == list_id,
            ListModel.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def get_by_title_and_user(
    db: AsyncSession, title: str, user_id: uuid.UUID
) -> ListModel | None:
    """Get a list by title for a specific user."""
    result = await db.execute(
        select(ListModel).where(
            ListModel.title == title,
            ListModel.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def get_by_user_with_stats(
    db: AsyncSession, user_id: uuid.UUID, skip: int = 0, limit: int = 100
) -> list[tuple[Any, ...]]:
    """Get all lists for a user with item counts."""
    query = (
        select(
            ListModel,
            func.count(ItemModel.item_id).label("item_count"),
        )
        .outerjoin(ItemModel)
        .where(ListModel.user_id == user_id)
        .group_by(ListModel.list_id)
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(query)
    return list(result.tuples().all())


async def create(db: AsyncSession, list_obj: ListModel) -> ListModel:
    """Create a new list."""
    db.add(list_obj)
    await db.commit()
    await db.refresh(list_obj)
    return list_obj


async def update(
    db: AsyncSession, list_obj: ListModel, update_data: dict[str, Any]
) -> ListModel:
    """Update a list with the given data."""
    for field, value in update_data.items():
        setattr(list_obj, field, value)
    db.add(list_obj)
    await db.commit()
    await db.refresh(list_obj)
    return list_obj


async def delete(db: AsyncSession, list_obj: ListModel) -> None:
    """Delete a list, its items, and every comparison session that references it.

    Items cascade via the relationship, but comparison_sessions holds
    non-cascading FKs to lists, so those rows go first.
    """
    await db.execute(
        sql_delete(ComparisonSessionModel).where(
            ComparisonSessionModel.list_id == list_obj.list_id
        )
    )
    await db.delete(list_obj)
    await db.commit()
