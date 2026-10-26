import asyncio
from typing import Any
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import (
    GOOGLE_AUTH_NOT_CONFIGURED_ERROR,
    INVALID_GOOGLE_TOKEN_ERROR,
)
from app.crud.crud_user import (
    create_user as crud_create_user,
    get_user_by_email,
    update_user as crud_update_user,
)
from app.db.database import get_db
from app.db.models import User as UserModel
from app.schemas.user import (
    GoogleLogin,
    Token,
    User,
    UserPublic,
    UserUpdate,
)
from app.services.auth import (
    create_access_token,
    get_current_admin_user,
    get_current_user,
)
from app.services.google_auth import verify_google_id_token
from app.settings import get_settings

router = APIRouter()


@router.post("/google", response_model=Token)
async def login_with_google(
    payload: GoogleLogin, db: AsyncSession = Depends(get_db)
) -> Any:
    """
    Exchange a Google ID token for an application access token.
    """
    if not get_settings().GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=GOOGLE_AUTH_NOT_CONFIGURED_ERROR,
        )

    try:
        claims = await asyncio.to_thread(verify_google_id_token, payload.id_token)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=INVALID_GOOGLE_TOKEN_ERROR,
        ) from None

    email = claims.get("email")
    if not email or not claims.get("email_verified"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=INVALID_GOOGLE_TOKEN_ERROR,
        )

    picture = claims.get("picture")
    photo_url = None
    if (
        isinstance(picture, str)
        and picture
        and picture.isprintable()
        and not any(char.isspace() for char in picture)
    ):
        try:
            parsed_picture = urlsplit(picture)
            if (
                parsed_picture.scheme == "https"
                and parsed_picture.hostname
                and parsed_picture.username is None
                and parsed_picture.password is None
            ):
                _ = parsed_picture.port
                photo_url = picture
        except ValueError:
            photo_url = None

    user = await get_user_by_email(db, email)
    if user is None:
        user = await crud_create_user(db, email=email, photo_url=photo_url)
    else:
        user.photo_url = photo_url
        await db.commit()
        await db.refresh(user)

    return {
        "access_token": create_access_token(user.user_id),
        "token_type": "bearer",
    }


@router.get("/", response_model=list[UserPublic])
async def read_users(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_admin_user),
) -> Any:
    """
    Retrieve users. Requires authentication.
    """
    query = select(UserModel).offset(skip).limit(limit)
    result = await db.execute(query)
    users = result.scalars().all()

    return [
        {
            "user_id": user.user_id,
            "email": user.email,
            "username": user.username,
            "created_at": user.created_at,
        }
        for user in users
    ]


@router.get("/me", response_model=User)
async def read_users_me(current_user: UserModel = Depends(get_current_user)) -> Any:
    """
    Get current user.
    """
    return current_user


@router.put("/me", response_model=User)
async def update_current_user(
    user_in: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
) -> Any:
    """
    Update current user profile.
    """
    updated_user = await crud_update_user(db, current_user, user_in)
    return updated_user
