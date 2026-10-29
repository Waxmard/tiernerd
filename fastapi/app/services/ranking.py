"""Ranking and score assignment business logic."""

import uuid

from app.db.models import Item as ItemModel

SCORE_BANDS: dict[str, tuple[float, float]] = {
    "good": (7.0, 10.0),
    "mid": (4.0, 7.0),
    "bad": (1.0, 4.0),
}


def assign_scores_for_set(sorted_items: list[ItemModel], tier_set: str) -> None:
    """Assign ranked items scores within their tier set's band.

    Items must be sorted from lowest to highest position.
    """
    band = SCORE_BANDS.get(tier_set)
    if not sorted_items or band is None:
        return
    low, high = band
    total = len(sorted_items)
    for i, item in enumerate(sorted_items):
        item.rating = round(low + (high - low) * (i + 0.5) / total, 1)


def filter_ranked_items(
    items: list[ItemModel], exclude_id: uuid.UUID | None = None
) -> list[ItemModel]:
    """Return items with a position, excluding the item with exclude_id if provided."""
    if exclude_id is None:
        return [item for item in items if item.position is not None]
    return [
        item
        for item in items
        if item.position is not None and item.item_id != exclude_id
    ]
