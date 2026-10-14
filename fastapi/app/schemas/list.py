from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# Shared properties
class ListBase(BaseModel):
    """Base list schema with shared properties."""

    title: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    color: str | None = None


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

    model_config = ConfigDict(from_attributes=True)
