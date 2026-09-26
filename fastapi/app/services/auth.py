from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import INVALID_CREDENTIALS_ERROR
from app.core.security import verify_password
from app.crud.crud_user import get_user_by_email, get_user_by_id, get_user_by_username
from app.db.database import get_db
from app.db.models import User as UserModel
from app.schemas.user import TokenPayload
from app.settings import get_settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/users/token")


async def authenticate_user(
    db: AsyncSession, username_or_email: str, password: str
) -> UserModel | None:
    """Authenticate a user with email or username."""
    # Check if it looks like an email
    if "@" in username_or_email and "." in username_or_email:
        user = await get_user_by_email(db, username_or_email)
    else:
        # Try username first, then email as fallback
        user = await get_user_by_username(db, username_or_email)
        if not user:
            user = await get_user_by_email(db, username_or_email)

    if not user:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def create_access_token(
    subject: UUID | str, expires_delta: timedelta | None = None
) -> str:
    """Create a JWT access token."""
    settings = get_settings()
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(
        to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
    )
    return encoded_jwt


async def get_current_user(
    db: AsyncSession = Depends(get_db), token: str = Depends(oauth2_scheme)
) -> UserModel:
    """Get the current authenticated user."""
    settings = get_settings()
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=INVALID_CREDENTIALS_ERROR,
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        token_data = TokenPayload(sub=user_id)
    except JWTError:
        raise credentials_exception from None

    user = await get_user_by_id(db, UUID(token_data.sub))
    if user is None:
        raise credentials_exception
    return user


def get_current_admin_user(
    current_user: UserModel = Depends(get_current_user),
) -> UserModel:
    """Require the current user to be an admin."""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user
