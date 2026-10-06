import datetime
import uuid

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Base class for all database models."""

    pass


class User(Base):
    """User model."""

    __tablename__ = "users"

    user_id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, index=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    username: Mapped[str | None] = mapped_column(
        String(50), unique=True, index=True, nullable=True
    )
    password_hash: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    lists: Mapped[list[List]] = relationship(
        "List", back_populates="user", cascade="all, delete-orphan"
    )


class List(Base):
    """List model."""

    __tablename__ = "lists"

    list_id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, index=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.user_id"))
    title: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    user: Mapped[User] = relationship("User", back_populates="lists")
    items: Mapped[list[Item]] = relationship(
        "Item", back_populates="list", cascade="all, delete-orphan"
    )


class Item(Base):
    """Item model."""

    __tablename__ = "items"

    item_id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, index=True, default=uuid.uuid4
    )
    list_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lists.list_id"))
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    position: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rating: Mapped[float | None] = mapped_column(nullable=True)
    tier: Mapped[str | None] = mapped_column(String(1), nullable=True)
    tier_set: Mapped[str | None] = mapped_column(String(10), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    list: Mapped[List] = relationship("List", back_populates="items")


Index(
    "ix_items_list_tier_position",
    Item.list_id,
    Item.tier_set,
    Item.position,
    postgresql_where=Item.position.isnot(None),
    sqlite_where=Item.position.isnot(None),
    unique=True,
)


class ComparisonSession(Base):
    """Comparison session model for persisting active comparison sessions."""

    __tablename__ = "comparison_sessions"

    session_id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, index=True, default=uuid.uuid4
    )
    list_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lists.list_id"))
    new_item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("items.item_id"))
    target_item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("items.item_id"), nullable=True
    )
    tier_set: Mapped[str] = mapped_column(String(10))
    min_index: Mapped[int] = mapped_column(default=0)
    max_index: Mapped[int] = mapped_column(default=0)
    comparison_index: Mapped[int] = mapped_column(default=0)
    is_complete: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    list: Mapped[List] = relationship("List")
    new_item: Mapped[Item] = relationship(
        "Item", foreign_keys=[new_item_id], lazy="joined"
    )
    target_item: Mapped[Item | None] = relationship(
        "Item", foreign_keys=[target_item_id], lazy="joined"
    )
