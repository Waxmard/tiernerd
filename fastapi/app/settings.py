from pydantic import PostgresDsn, computed_field
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

    # CORS - stored as comma-separated string, parsed via computed_field
    CORS_ORIGINS_STR: str = ""
    # Optional regex for origins that can't be listed (e.g. LAN IPs in dev)
    CORS_ORIGIN_REGEX: str = ""

    @computed_field  # type: ignore[prop-decorator]
    @property
    def CORS_ORIGINS(self) -> list[str]:
        if not self.CORS_ORIGINS_STR:
            return []
        return [
            origin.strip()
            for origin in self.CORS_ORIGINS_STR.split(",")
            if origin.strip()
        ]

    # Logging
    LOG_LEVEL: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"), case_sensitive=True, extra="ignore"
    )


settings = Settings()  # type: ignore[call-arg]
