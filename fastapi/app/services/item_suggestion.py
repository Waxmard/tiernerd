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
    text = generate_text(SYSTEM_PROMPT, "\n".join(lines), temperature=0.8)
    name = next(iter(text.strip().splitlines()), "").strip(' "')
    if (
        not name
        or len(name) > MAX_NAME_LENGTH
        or name.casefold() in {item.casefold() for item in existing}
    ):
        raise ValueError("no usable item")
    return name
