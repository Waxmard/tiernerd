from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserBase(BaseModel):
    email: EmailStr
    username: str | None = Field(None, min_length=3, max_length=50)


class GoogleLogin(BaseModel):
    id_token: str


class UserUpdate(BaseModel):
    username: str | None = Field(None, min_length=3, max_length=50)

    model_config = ConfigDict(extra="forbid")


class User(UserBase):
    user_id: UUID
    created_at: datetime
    updated_at: datetime
    is_admin: bool
    photo_url: str | None = None
    background_photo_id: UUID | None = None

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenPayload(BaseModel):
    sub: str | None = None
