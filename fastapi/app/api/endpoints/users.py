import asyncio
import secrets
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import (
    GOOGLE_AUTH_NOT_CONFIGURED_ERROR,
    INCORRECT_LOGIN_ERROR,
    INVALID_GOOGLE_TOKEN_ERROR,
    USER_ALREADY_EXISTS_ERROR,
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
    UserCreate,
    UserPublic,
    UserUpdate,
)
from app.services.auth import (
    authenticate_user,
    create_access_token,
    get_current_admin_user,
    get_current_user,
)
from app.services.google_auth import verify_google_id_token
from app.settings import get_settings

router = APIRouter()


@router.post("/", response_model=User, status_code=status.HTTP_201_CREATED)
async def create_user(user_in: UserCreate, db: AsyncSession = Depends(get_db)) -> Any:
    """
    Create a new user.
    """
    # Check if user exists
    user = await get_user_by_email(db, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=USER_ALREADY_EXISTS_ERROR,
        )

    # Create new user
    user = await crud_create_user(db, obj_in=user_in)
    return user


@router.post("/token", response_model=Token)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
) -> Any:
    """
    OAuth2 compatible token login, get an access token for future requests.
    """
    user = await authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=INCORRECT_LOGIN_ERROR,
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=get_settings().ACCESS_TOKEN_EXPIRE_MINUTES)
    return {
        "access_token": create_access_token(
            user.user_id, expires_delta=access_token_expires
        ),
        "token_type": "bearer",
    }


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

    user = await get_user_by_email(db, email)
    if user is None:
        # Google-only accounts still need a password_hash: the column is NOT
        # NULL and `authenticate_user` runs passlib against it unconditionally.
        # An unguessable random password keeps password login working (it always
        # fails) without touching verify_password or the user schema.
        user = await crud_create_user(
            db,
            UserCreate(email=email, username=None, password=secrets.token_urlsafe(32)),
        )

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
