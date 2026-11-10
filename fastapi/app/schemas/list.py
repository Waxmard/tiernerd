from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

RankingMode = Literal["rank", "score"]
ListColor = Literal["blue", "teal", "amber", "pink", "violet", "coral"]
ListIcon = Annotated[str, Field(min_length=1, max_length=16)]


class ListCreate(BaseModel):
    list_id: UUID | None = None
    title: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    color: ListColor | None = None
    icon: ListIcon | None = None
    ranking_mode: RankingMode = "score"

    model_config = ConfigDict(extra="forbid")


class ListBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    color: ListColor | None = None
    icon: ListIcon | None = None
    ranking_mode: RankingMode = "score"


class LegacyListUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    ranking_mode: RankingMode = "score"


class ListUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = None
    color: ListColor | None = None
    icon: ListIcon | None = None
    ranking_mode: RankingMode | None = None

    model_config = ConfigDict(extra="forbid")


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
