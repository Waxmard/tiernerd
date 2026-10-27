from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# Shared properties
class UserBase(BaseModel):
    """Base user schema with shared properties."""

    email: EmailStr
    username: str | None = Field(None, min_length=3, max_length=50)


class GoogleLogin(BaseModel):
    """Schema for Google ID token login."""

    id_token: str


# Properties to receive via API on update
class UserUpdate(BaseModel):
    """Schema for user update."""

    username: str | None = Field(None, min_length=3, max_length=50)

    model_config = ConfigDict(extra="forbid")


# Properties to return to client
class User(UserBase):
    """Schema for user response."""

    user_id: UUID
    created_at: datetime
    updated_at: datetime
    is_admin: bool
    photo_url: str | None = None

    model_config = ConfigDict(from_attributes=True)


# Public user info (no sensitive data)
class UserPublic(BaseModel):
    """Schema for public user info."""

    user_id: UUID
    email: EmailStr
    username: str | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    """Schema for authentication token."""

    access_token: str
    token_type: str


class TokenPayload(BaseModel):
    """Schema for token payload."""

    sub: str | None = None
