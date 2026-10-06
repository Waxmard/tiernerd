from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TierDistribution(BaseModel):
    """Schema for tier distribution counts."""

    S: int = 0
    A: int = 0
    B: int = 0
    C: int = 0
    D: int = 0
    F: int = 0


# Shared properties
class ListBase(BaseModel):
    """Base list schema with shared properties."""

    title: str = Field(..., min_length=1, max_length=100)
    description: str | None = None


# Properties to receive via API on creation
class ListCreate(ListBase):
    """Schema for list creation."""

    pass


# Properties to receive via API on update
class ListUpdate(BaseModel):
    """Schema for list update."""

    title: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None


# Properties to return to client
class List(ListBase):
    """Schema for list response."""

    list_id: UUID
    user_id: UUID
    title: str
    description: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Simple list (without items) for listing purposes
class ListSimple(ListBase):
    """Schema for simple list response (without items)."""

    list_id: UUID
    user_id: UUID
    title: str
    description: str | None = None
    created_at: datetime
    updated_at: datetime
    item_count: int = 0
    tier_distribution: TierDistribution = Field(default_factory=TierDistribution)

    model_config = ConfigDict(from_attributes=True)
