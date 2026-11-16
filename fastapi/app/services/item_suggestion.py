from collections.abc import Sequence

from app.services.gemini import generate_text

MAX_NAME_LENGTH = 60
MAX_PROMPT_NAMES = 300
SYSTEM_PROMPT = (
    "You suggest items for a ranking app. Given a list's title and the items "
    "already in it, reply with one more item that belongs in the list, is not "
    "already in it, and that someone who made this list would likely know well "
    "enough to rank. Output only the item's name, at most 60 characters, with "
    "no quotes, numbering or explanation."
)


def suggest_next_item(
    list_title: str, description: str, existing: Sequence[str]
) -> str:
    """Ask Gemini for one new item name that fits a list."""
    lines = [f"List: {list_title}"]
    if description:
        lines.append(f"Description: {description}")
    if existing:
        lines.append("Already in the list:")
        lines.extend(f"- {name}" for name in existing[:MAX_PROMPT_NAMES])
    return _pick_name(
        generate_text(SYSTEM_PROMPT, "\n".join(lines), temperature=0.8), existing
    )


LIST_SYSTEM_PROMPT = (
    "You suggest lists for a ranking app, where people rank things they know "
    "well, such as movies, foods or places. Given the titles of the lists "
    "someone already has, reply with one new list title that is not already "
    "there and that they would likely enjoy ranking. Output only the title, at "
    "most 60 characters, with no quotes, numbering or explanation."
)


def suggest_next_list(existing: Sequence[str]) -> str:
    """Ask Gemini for one new list title that fits someone's existing lists."""
    lines = (
        ["Existing lists:", *(f"- {title}" for title in existing[:MAX_PROMPT_NAMES])]
        if existing
        else ["No lists yet."]
    )
    return _pick_name(
        generate_text(LIST_SYSTEM_PROMPT, "\n".join(lines), temperature=0.8),
        existing,
    )


def _pick_name(text: str, existing: Sequence[str]) -> str:
    name = next(iter(text.strip().splitlines()), "").strip(' "')
    if (
        not name
        or len(name) > MAX_NAME_LENGTH
        or name.casefold() in {entry.casefold() for entry in existing}
    ):
        raise ValueError("no usable name")
    return name
