#!/usr/bin/env python3
"""
Database seed script for local development.

Creates dev users for testing.
Run with: make seed
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

import uuid
from datetime import datetime

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import SessionLocal, engine
from app.db.models import Base, User

DEV_USERS = [
    {
        "email": "dev@tiernerd.com",
        "username": "devuser",
        "is_admin": True,
    },
    {
        "email": "user@tiernerd.com",
        "username": "testuser",
        "is_admin": False,
    },
]


async def clear_database(session: AsyncSession) -> None:
    """Clear all data from the database."""
    # Delete in order to respect foreign keys
    await session.execute(text("DELETE FROM items"))
    await session.execute(text("DELETE FROM lists"))
    await session.execute(text("DELETE FROM users"))
    await session.commit()
    print("Cleared all data from database")


async def seed_users(session: AsyncSession) -> None:
    """Create dev users if they don't exist."""
    for user_data in DEV_USERS:
        result = await session.execute(
            select(User).where(User.email == user_data["email"])
        )
        if result.scalar_one_or_none():
            print(f"User already exists: {user_data['email']}")
            continue

        user = User(
            user_id=uuid.uuid4(),
            email=user_data["email"],
            username=user_data["username"],
            is_admin=user_data.get("is_admin", False),
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        session.add(user)
        print(f"Created user: {user_data['email']}")

    await session.commit()


async def main(clear: bool = False) -> None:
    """Main seed function."""
    print("Starting database seed...")

    # Create tables if they don't exist
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as session:
        if clear:
            await clear_database(session)

        await seed_users(session)

    print("Seed complete!")


if __name__ == "__main__":
    clear = "--clear" in sys.argv or "-c" in sys.argv
    asyncio.run(main(clear=clear))
