import uuid
from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


# Tier ranking enum
class TierRank(StrEnum):
    """Enum for tier rankings."""

    S = "S"
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    F = "F"


# Tier set enum - determines which tier pair an item can be ranked into
class TierSet(StrEnum):
    """Enum for tier sets. Each set maps to a pair of tiers."""

    GOOD = "good"  # S or A
    MID = "mid"  # B or C
    BAD = "bad"  # D or F


# Shared properties
class ItemBase(BaseModel):
    """Base item schema with shared properties."""

    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    image_url: HttpUrl | None = None


# Properties to receive via API on creation
class ItemCreate(ItemBase):
    """Schema for item creation."""

    name: str
    description: str | None = None
    image_url: HttpUrl | None = None
    tier_set: TierSet  # Required - determines which tier pair (S/A, B/C, D/F)


# Properties to receive via API on update
class ItemUpdate(BaseModel):
    """Schema for item update."""

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    image_url: HttpUrl | None = None


# Properties to return to client
class Item(ItemBase):
    """Schema for item response."""

    item_id: uuid.UUID
    list_id: uuid.UUID
    name: str
    description: str | None = None
    image_url: HttpUrl | None = None
    position: str | None = None
    rating: float | None = None
    tier: TierRank | None = None
    tier_set: TierSet | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# Schema for comparison
class Comparison(BaseModel):
    """Schema for comparison."""

    reference_item: Item
    target_item: Item
    comparison_index: int
    min_index: int
    max_index: int
    is_winner: bool | None = None
    done: bool = False

    model_config = ConfigDict(from_attributes=True)


# Schema for comparison
ComparisonResult = Literal["better", "worse"]


class ComparisonSession(BaseModel):
    """Schema for comparison session."""

    session_id: str
    list_id: uuid.UUID
    item_id: uuid.UUID
    current_comparison: Comparison | None = None
    is_complete: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ComparisonResultRequest(BaseModel):
    """Schema for comparison result request."""

    result: ComparisonResult

    model_config = ConfigDict(from_attributes=True)
