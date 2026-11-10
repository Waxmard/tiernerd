import asyncio
import logging
import uuid
from typing import Any
from urllib.parse import urlsplit

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Response,
    UploadFile,
    status,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.bounded_route import bounded_write_route
from app.core.constants import (
    BACKGROUND_PHOTO_NOT_FOUND_ERROR,
    GOOGLE_AUTH_NOT_CONFIGURED_ERROR,
    INVALID_GOOGLE_TOKEN_ERROR,
)
from app.crud.crud_user import (
    create_user as crud_create_user,
    get_user_by_email,
    set_background_photo,
)
from app.db.database import get_db
from app.db.models import User as UserModel
from app.schemas.user import (
    GoogleLogin,
    Token,
    User,
)
from app.services import photo_upload_service
from app.services.auth import (
    create_access_token,
    get_current_user,
)
from app.services.google_auth import verify_google_id_token
from app.settings import get_settings

logger = logging.getLogger(__name__)

MAX_USER_WRITE_BYTES = photo_upload_service.MAX_UPLOAD_BYTES + 64 * 1024

router = APIRouter(
    route_class=bounded_write_route(
        lambda: MAX_USER_WRITE_BYTES, "Request exceeds size limit"
    )
)


async def _discard_photo(user_id: uuid.UUID, photo_id: uuid.UUID | None) -> None:
    if photo_id is None:
        return
    try:
        await photo_upload_service.delete_upload(user_id, photo_id)
    except Exception:
        logger.warning(
            "Failed to clean up background photo %s for user %s",
            photo_id,
            user_id,
            exc_info=True,
        )


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


@router.get("/me", response_model=User)
async def read_users_me(current_user: UserModel = Depends(get_current_user)) -> Any:
    """
    Get current user.
    """
    return current_user


@router.put("/me/background", response_model=User)
async def set_background(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
) -> Any:
    """
    Replace the current user's app background photo.
    """
    previous = current_user.background_photo_id
    photo_id = await photo_upload_service.create_upload(file, current_user.user_id)
    user = await set_background_photo(db, current_user, photo_id)
    await _discard_photo(user.user_id, previous)
    return user


@router.delete("/me/background", response_model=User)
async def clear_background(
    db: AsyncSession = Depends(get_db),
    current_user: UserModel = Depends(get_current_user),
) -> Any:
    """
    Remove the current user's app background photo.
    """
    previous = current_user.background_photo_id
    if previous is None:
        return current_user
    user = await set_background_photo(db, current_user, None)
    await _discard_photo(user.user_id, previous)
    return user


@router.get("/me/background/{photo_id}")
async def read_background(
    photo_id: uuid.UUID, current_user: UserModel = Depends(get_current_user)
) -> Response:
    """
    Download the current user's app background photo.
    """
    content = None
    if current_user.background_photo_id == photo_id:
        content = await photo_upload_service.read_upload(current_user.user_id, photo_id)
    if content is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=BACKGROUND_PHOTO_NOT_FOUND_ERROR,
        )
    return Response(
        content=content,
        media_type="image/jpeg",
        headers={"Cache-Control": "private, no-store"},
    )
