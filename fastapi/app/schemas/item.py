import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator


class ItemBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    image_url: HttpUrl | None = None

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

    @field_validator("name", mode="before")
    @classmethod
    def trim_name(cls, value: object) -> object:
        if value is None:
            raise ValueError("name may not be null")
        return value.strip() if isinstance(value, str) else value


class Item(ItemBase):
    item_id: uuid.UUID
    list_id: uuid.UUID
    position: str | None = None
    rating: float | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RankingSetRequest(BaseModel):
    item_id: uuid.UUID
    gap: int = 0

    model_config = ConfigDict(extra="forbid")
