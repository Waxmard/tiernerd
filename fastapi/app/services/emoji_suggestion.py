import functools
from typing import Literal

import google.auth
from google.auth.transport.requests import AuthorizedSession

from app.settings import get_settings

SuggestionKind = Literal["list", "item"]

REQUEST_TIMEOUT = 8
MAX_EMOJI_LENGTH = 16
SYSTEM_PROMPT = (
    "Reply with exactly one emoji that best represents the name of this {kind} "
    "in a ranking app. Output only the emoji and nothing else."
)


@functools.lru_cache(maxsize=1024)
def suggest_emoji(name: str, kind: SuggestionKind) -> str:
    """Ask Gemini for one emoji that represents a list or item name."""
    credentials, _ = google.auth.default(
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    session = AuthorizedSession(credentials)  # type: ignore[no-untyped-call]
    settings = get_settings()
    response = session.post(
        f"https://aiplatform.googleapis.com/v1/projects/{settings.AI_PROJECT}"
        f"/locations/global/publishers/google/models/{settings.AI_MODEL}:generateContent",
        timeout=REQUEST_TIMEOUT,
        json={
            "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT.format(kind=kind)}]},
            "contents": [{"role": "user", "parts": [{"text": name}]}],
            "generationConfig": {"temperature": 0, "maxOutputTokens": 64},
        },
    )
    response.raise_for_status()
    text: str = response.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
    if not 1 <= len(text) <= MAX_EMOJI_LENGTH or any(char.isascii() for char in text):
        raise ValueError("not an emoji")
    return text
