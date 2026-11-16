import functools

import google.auth
from google.auth.transport.requests import AuthorizedSession

from app.settings import get_settings

REQUEST_TIMEOUT = 8


@functools.cache
def _session() -> AuthorizedSession:
    credentials, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    return AuthorizedSession(credentials)  # type: ignore[no-untyped-call]


def generate_text(system_prompt: str, prompt: str, temperature: float = 0) -> str:
    settings = get_settings()
    response = _session().post(
        f"https://aiplatform.googleapis.com/v1/projects/{settings.AI_PROJECT}"
        f"/locations/global/publishers/google/models/{settings.AI_MODEL}:generateContent",
        timeout=REQUEST_TIMEOUT,
        json={
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": temperature, "maxOutputTokens": 64},
        },
    )
    response.raise_for_status()
    text: str = response.json()["candidates"][0]["content"]["parts"][0]["text"]
    return text
