from typing import Literal

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
