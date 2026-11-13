from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class EmojiSuggestionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=100)
    kind: Literal["list", "item"]
    description: str = Field("", max_length=500)
    list_title: str = Field("", max_length=100)


class EmojiSuggestions(BaseModel):
    emojis: list[str]


class EmojiFillResult(BaseModel):
    updated: int
    remaining: int


class ItemSuggestionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    exclude: list[Annotated[str, Field(max_length=60)]] = Field(
        default_factory=list, max_length=50
    )


class ItemSuggestion(BaseModel):
    name: str
