import datetime
import uuid

from sqlalchemy import (
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
    __tablename__ = "users"

    user_id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, index=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    username: Mapped[str | None] = mapped_column(
        String(50), unique=True, index=True, nullable=True
    )
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    background_photo_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    is_admin: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    lists: Mapped[list[List]] = relationship(
        "List", back_populates="user", cascade="all, delete-orphan"
    )


class List(Base):
    __tablename__ = "lists"
    __table_args__ = (
        CheckConstraint(
            "ranking_mode IN ('rank', 'score')", name="ck_lists_ranking_mode"
        ),
    )

    list_id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, index=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.user_id"))
    title: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    icon: Mapped[str | None] = mapped_column(String(16), nullable=True)
    ranking_mode: Mapped[str] = mapped_column(
        String(5), nullable=False, default="score", server_default="score"
    )
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship("User", back_populates="lists")
    items: Mapped[list[Item]] = relationship(
        "Item", back_populates="list", cascade="all, delete-orphan"
    )


class Item(Base):
    __tablename__ = "items"

    item_id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, index=True, default=uuid.uuid4
    )
    list_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("lists.list_id"))
    name: Mapped[str] = mapped_column(String(100))
    name_key: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(16), nullable=True)
    position: Mapped[str | None] = mapped_column(String(255), nullable=True)
    rating: Mapped[float | None] = mapped_column(nullable=True)
    manual_rating: Mapped[float | None] = mapped_column(nullable=True)
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
    "ix_items_list_position",
    Item.list_id,
    Item.position,
    postgresql_where=Item.position.isnot(None),
    sqlite_where=Item.position.isnot(None),
    unique=True,
)

Index("ix_items_list_name_key", Item.list_id, Item.name_key, unique=True)
