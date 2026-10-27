import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User
from app.schemas.user import UserUpdate


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    """
    Get a user by email.
    """
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    """
    Get a user by ID.
    """
    result = await db.execute(select(User).where(User.user_id == user_id))
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    *,
    email: str,
    username: str | None = None,
    photo_url: str | None = None,
) -> User:
    """
    Create a new user.
    """
    db_obj = User(
        user_id=uuid.uuid4(),
        email=email,
        username=username,
        photo_url=photo_url,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)
    return db_obj


async def update_user(db: AsyncSession, db_obj: User, obj_in: UserUpdate) -> User:
    """
    Update a user.
    """
    update_data = obj_in.model_dump(exclude_unset=True)

    # Update attributes
    for field, value in update_data.items():
        setattr(db_obj, field, value)

    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)
    return db_obj


async def delete_user(db: AsyncSession, user_id: uuid.UUID) -> None:
    """
    Delete a user.
    """
    user = await get_user_by_id(db, user_id)
    if user:
        await db.delete(user)
        await db.commit()
