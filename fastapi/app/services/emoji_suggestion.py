import functools
import re
from typing import Literal

from app.services.gemini import generate_text

SuggestionKind = Literal["list", "item"]

MAX_EMOJI_LENGTH = 16
MAX_SUGGESTIONS = 3
EMOJI_PATTERN = re.compile(
    "[\U0001f1e6-\U0001f1ff]{2}"
    "|[^\u200d](?:[\ufe0e\ufe0f\U0001f3fb-\U0001f3ff\U000e0020-\U000e007f]|\u200d[^\u200d])*"
)
SYSTEM_PROMPT = (
    "You pick emoji for a ranking app. Reply with exactly three different emoji "
    "that best represent the named list or item, best first, separated by single "
    "spaces. Output only the three emoji and nothing else."
)


@functools.lru_cache(maxsize=1024)
def suggest_emojis(
    name: str,
    kind: SuggestionKind,
    description: str = "",
    list_title: str = "",
) -> tuple[str, ...]:
    """Ask Gemini for up to three emoji that represent a list or item."""
    lines = [f"List: {name}" if kind == "list" else f"Item: {name}"]
    if kind == "item" and list_title:
        lines.append(f"List: {list_title}")
    if description:
        lines.append(f"Description: {description}")
    text = generate_text(SYSTEM_PROMPT, "\n".join(lines))
    emojis = tuple(
        dict.fromkeys(
            emoji
            for token in text.split()
            if not any(char.isascii() for char in token)
            for emoji in EMOJI_PATTERN.findall(token)
            if len(emoji) <= MAX_EMOJI_LENGTH
        )
    )[:MAX_SUGGESTIONS]
    if not emojis:
        raise ValueError("no emoji")
    return emojis
