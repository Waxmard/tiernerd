import uuid
from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator


class TierSet(StrEnum):
    """Enum for tier sets. Each set maps to a score band."""

    GOOD = "good"
    MID = "mid"
    BAD = "bad"


class ItemBase(BaseModel):
    """Base item schema with shared properties."""

    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    image_url: HttpUrl | None = None

    @field_validator("name", mode="before")
    @classmethod
    def trim_name(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class ItemCreate(ItemBase):
    """Schema for item creation."""

    tier_set: TierSet


class ItemUpdate(BaseModel):
    """Schema for item update."""

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    image_url: HttpUrl | None = None

    @field_validator("name", mode="before")
    @classmethod
    def trim_name(cls, value: object) -> object:
        if value is None:
            raise ValueError("name may not be null")
        return value.strip() if isinstance(value, str) else value


class Item(ItemBase):
    """Schema for item response."""

    item_id: uuid.UUID
    list_id: uuid.UUID
    position: str | None = None
    rating: float | None = None
    tier_set: TierSet | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


ComparisonResult = Literal["better", "worse"]
ComparisonStatus = Literal["active", "ready_to_commit", "completed", "cancelled"]


class Comparison(BaseModel):
    reference_item: Item
    target_item: Item


class ComparisonPreview(BaseModel):
    score: float
    rank: int
    ranked_count: int
    tier_set: TierSet


class ComparisonSession(BaseModel):
    session_id: str
    list_id: uuid.UUID
    item_id: uuid.UUID
    status: ComparisonStatus
    tier_set: TierSet
    revision: int
    comparisons_answered: int
    comparison_limit: int
    can_undo: bool
    discard_on_cancel: bool
    is_stale: bool
    item: Item
    current_comparison: Comparison | None
    preview: ComparisonPreview | None
    created_at: datetime
    updated_at: datetime


class ComparisonSessionStartRequest(BaseModel):
    tier_set: TierSet
    restart: bool = False
    revision: int | None = None


class ComparisonResultRequest(BaseModel):
    result: ComparisonResult
    revision: int


class ComparisonRevisionRequest(BaseModel):
    revision: int
