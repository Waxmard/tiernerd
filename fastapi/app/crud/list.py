import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Item as ItemModel, List as ListModel


async def get_by_id(
    db: AsyncSession, list_id: uuid.UUID, *, populate_existing: bool = False
) -> ListModel | None:
    query = select(ListModel).where(ListModel.list_id == list_id)
    if populate_existing:
        query = query.execution_options(populate_existing=True)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_by_id_and_user(
    db: AsyncSession,
    list_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    for_update: bool = False,
) -> ListModel | None:
    query = select(ListModel).where(
        ListModel.list_id == list_id, ListModel.user_id == user_id
    )
    if for_update:
        query = query.with_for_update(of=ListModel)
    result = await db.execute(query.execution_options(populate_existing=True))
    return result.scalar_one_or_none()


async def get_by_title_and_user(
    db: AsyncSession,
    title: str,
    user_id: uuid.UUID,
    *,
    for_update: bool = False,
) -> ListModel | None:
    query = select(ListModel).where(
        ListModel.title == title,
        ListModel.user_id == user_id,
    )
    if for_update:
        query = query.with_for_update(of=ListModel)
    result = await db.execute(query.execution_options(populate_existing=True))
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
        .order_by(ListModel.updated_at.desc(), ListModel.list_id.asc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(query)
    return list(result.tuples().all())


async def create(db: AsyncSession, list_obj: ListModel) -> ListModel:
    db.add(list_obj)
    await db.flush()
    await db.refresh(list_obj)
    await db.commit()
    return list_obj


async def update(
    db: AsyncSession, list_obj: ListModel, update_data: dict[str, Any]
) -> ListModel:
    for field, value in update_data.items():
        setattr(list_obj, field, value)
    if update_data:
        list_obj.updated_at = datetime.now(UTC)
    db.add(list_obj)
    await db.flush()
    await db.refresh(list_obj)
    await db.commit()
    return list_obj


async def delete(db: AsyncSession, list_obj: ListModel) -> None:
    """Delete a list and its items."""
    await db.delete(list_obj)
    await db.commit()
