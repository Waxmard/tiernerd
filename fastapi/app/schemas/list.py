from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

RankingMode = Literal["rank", "score"]
ListColor = Literal["blue", "teal", "amber", "pink", "violet", "coral"]
ListIcon = Literal["layers", "coffee", "film", "mountain", "star", "heart", "books"]
ListCover = Literal["landscape"]


class UploadCoverPhoto(BaseModel):
    source: Literal["upload"]
    id: UUID

    model_config = ConfigDict(extra="forbid")


class UnsplashCoverPhoto(BaseModel):
    source: Literal["unsplash"]
    id: str
    url: str
    photographer_name: str
    photographer_url: str
    photo_url: str

    model_config = ConfigDict(extra="forbid")


CoverPhoto = Annotated[
    UploadCoverPhoto | UnsplashCoverPhoto, Field(discriminator="source")
]


class UploadCoverSelection(BaseModel):
    source: Literal["upload"]
    id: UUID | None = None

    model_config = ConfigDict(extra="forbid")


class UnsplashCoverSelection(BaseModel):
    source: Literal["unsplash"]
    id: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")

    model_config = ConfigDict(extra="forbid")


CoverSelection = Annotated[
    UploadCoverSelection | UnsplashCoverSelection, Field(discriminator="source")
]


class CoverSearchAvailability(BaseModel):
    enabled: bool


class ListCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    color: ListColor | None = None
    icon: ListIcon | None = None
    cover: ListCover | None = None
    cover_photo: CoverSelection | None = None
    ranking_mode: RankingMode = "score"

    model_config = ConfigDict(extra="forbid")


class ListBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    description: str | None = None
    color: ListColor | None = None
    icon: ListIcon | None = None
    cover: ListCover | None = None
    cover_photo: CoverPhoto | None = None
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
    cover: ListCover | None = None
    cover_photo: CoverSelection | None = None
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
