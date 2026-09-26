from typing import Any

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token

from app.settings import settings


def verify_google_id_token(token: str) -> dict[str, Any]:
    """Verify a Google-issued ID token and return its claims."""
    claims: dict[str, Any] = google_id_token.verify_oauth2_token(  # type: ignore[no-untyped-call]
        token, google_requests.Request(), settings.GOOGLE_CLIENT_ID
    )
    return claims
