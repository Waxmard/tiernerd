from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

RankingMode = Literal["rank", "score"]
ListIcon = Annotated[str, Field(min_length=1, max_length=16)]


def _drop_retired_color(data: Any) -> Any:
    if isinstance(data, dict):
        return {key: value for key, value in data.items() if key != "color"}
    return data


class ListCreate(BaseModel):
    list_id: UUID | None = None
    title: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    icon: ListIcon | None = None
    ranking_mode: RankingMode = "score"

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def _ignore_color(cls, data: Any) -> Any:
        return _drop_retired_color(data)


class ListBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    icon: ListIcon | None = None
    ranking_mode: RankingMode = "score"


class LegacyListUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    ranking_mode: RankingMode = "score"


class ListUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    icon: ListIcon | None = None
    ranking_mode: RankingMode | None = None

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def _ignore_color(cls, data: Any) -> Any:
        return _drop_retired_color(data)


class List(ListBase):
    list_id: UUID
    user_id: UUID
    title: str
    description: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ListSimple(ListBase):
    list_id: UUID
    user_id: UUID
    title: str
    description: str | None = None
    created_at: datetime
    updated_at: datetime
    item_count: int = 0

    model_config = ConfigDict(from_attributes=True)
