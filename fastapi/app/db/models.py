import datetime
import uuid

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
    validates,
)


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
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
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
    color: Mapped[str | None] = mapped_column(String(16), nullable=True)
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
    name_key: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    position: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rating: Mapped[float | None] = mapped_column(nullable=True)
    tier_set: Mapped[str | None] = mapped_column(String(10), nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    list: Mapped[List] = relationship("List", back_populates="items")

    @validates("name")
    def normalize_name(self, _key: str, value: str) -> str:
        display_name = value.strip()
        self.name_key = display_name.casefold()
        return display_name


Index(
    "ix_items_list_tier_position",
    Item.list_id,
    Item.tier_set,
    Item.position,
    postgresql_where=Item.position.isnot(None),
    sqlite_where=Item.position.isnot(None),
    unique=True,
)

Index("ix_items_list_name_key", Item.list_id, Item.name_key, unique=True)


class ComparisonSession(Base):
    __tablename__ = "comparison_sessions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'ready_to_commit', 'completed', 'cancelled')",
            name="ck_comparison_session_status",
        ),
    )

    session_id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, index=True, default=uuid.uuid4
    )
    list_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lists.list_id"))
    new_item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("items.item_id"))
    target_item_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("items.item_id"), nullable=True
    )
    tier_set: Mapped[str] = mapped_column(String(10))
    min_index: Mapped[int] = mapped_column(default=0)
    max_index: Mapped[int] = mapped_column(default=0)
    comparison_index: Mapped[int] = mapped_column(default=0)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    comparisons_answered: Mapped[int] = mapped_column(default=0, nullable=False)
    revision: Mapped[int] = mapped_column(default=0, nullable=False)
    discard_on_cancel: Mapped[bool] = mapped_column(default=False, nullable=False)
    peer_snapshot: Mapped[list[dict[str, str]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    candidate_snapshot: Mapped[dict[str, str | None]] = mapped_column(
        JSON, nullable=False, default=dict
    )
    previous_state: Mapped[dict[str, object] | None] = mapped_column(
        JSON, nullable=True
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    list: Mapped[List] = relationship("List")
    new_item: Mapped[Item] = relationship(
        "Item", foreign_keys=[new_item_id], lazy="joined"
    )
    target_item: Mapped[Item | None] = relationship(
        "Item", foreign_keys=[target_item_id], lazy="joined"
    )


Index(
    "ix_comparison_sessions_active_item",
    ComparisonSession.new_item_id,
    unique=True,
    postgresql_where=ComparisonSession.status.in_(("active", "ready_to_commit")),
    sqlite_where=ComparisonSession.status.in_(("active", "ready_to_commit")),
)
