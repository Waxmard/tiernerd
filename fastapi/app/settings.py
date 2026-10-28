import functools

from pydantic import PostgresDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings."""

    # App configuration
    APP_ENV: str = "development"
    DEBUG: bool = True
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days

    # Database - allow string for test mode (SQLite)
    DATABASE_URL: PostgresDsn | str

    # Google sign-in: the public OAuth Web client ID the ID token must be minted for.
    GOOGLE_CLIENT_ID: str = ""

    # Logging
    LOG_LEVEL: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"), case_sensitive=True, extra="ignore"
    )


@functools.lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Read application settings once and share the instance."""
    return Settings()  # type: ignore[call-arg]
