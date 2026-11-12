import math
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator


class ItemBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    image_url: HttpUrl | None = None
    icon: str | None = Field(None, min_length=1, max_length=16)

    @field_validator("name", mode="before")
    @classmethod
    def trim_name(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class ItemCreate(ItemBase):
    item_id: uuid.UUID | None = None


class ItemUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    image_url: HttpUrl | None = None
    icon: str | None = Field(None, min_length=1, max_length=16)
    manual_rating: float | None = None

    @field_validator("name", mode="before")
    @classmethod
    def trim_name(cls, value: object) -> object:
        if value is None:
            raise ValueError("name may not be null")
        return value.strip() if isinstance(value, str) else value

    @field_validator("manual_rating", mode="before")
    @classmethod
    def validate_manual_rating(cls, value: object) -> float | None:
        if value is None:
            return None
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("Score must be between 0.0 and 10.0")
        num = float(value)
        if not math.isfinite(num) or num < 0.0 or num > 10.0:
            raise ValueError("Score must be between 0.0 and 10.0")
        scaled = num * 10
        floor = math.floor(scaled)
        diff = scaled - floor
        if diff > 0.5:
            rounded = floor + 1
        elif diff < 0.5 or floor % 2 == 0:
            rounded = floor
        else:
            rounded = floor + 1
        return rounded / 10


class Item(ItemBase):
    item_id: uuid.UUID
    list_id: uuid.UUID
    position: str | None = None
    rating: float | None = None
    manual_rating: float | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RankingSetRequest(BaseModel):
    item_id: uuid.UUID
    gap: int = 0

    model_config = ConfigDict(extra="forbid")
