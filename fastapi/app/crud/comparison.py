import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ComparisonSession as ComparisonSessionModel


async def get_list_id(db: AsyncSession, session_id: uuid.UUID) -> uuid.UUID | None:
    result = await db.execute(
        select(ComparisonSessionModel.list_id).where(
            ComparisonSessionModel.session_id == session_id
        )
    )
    return result.scalar_one_or_none()


async def get_by_id(
    db: AsyncSession, session_id: uuid.UUID, *, populate_existing: bool = False
) -> ComparisonSessionModel | None:
    query = select(ComparisonSessionModel).where(
        ComparisonSessionModel.session_id == session_id
    )
    if populate_existing:
        query = query.execution_options(populate_existing=True)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_active(
    db: AsyncSession, session_id: uuid.UUID, *, populate_existing: bool = False
) -> ComparisonSessionModel | None:
    query = select(ComparisonSessionModel).where(
        ComparisonSessionModel.session_id == session_id,
        ComparisonSessionModel.status.in_(("active", "ready_to_commit")),
    )
    if populate_existing:
        query = query.execution_options(populate_existing=True)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_active_by_item(
    db: AsyncSession, item_id: uuid.UUID, *, populate_existing: bool = False
) -> ComparisonSessionModel | None:
    query = select(ComparisonSessionModel).where(
        ComparisonSessionModel.new_item_id == item_id,
        ComparisonSessionModel.status.in_(("active", "ready_to_commit")),
    )
    if populate_existing:
        query = query.execution_options(populate_existing=True)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def create(
    db: AsyncSession, session: ComparisonSessionModel
) -> ComparisonSessionModel:
    db.add(session)
    await db.flush()
    return session
