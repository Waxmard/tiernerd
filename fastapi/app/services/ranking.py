"""Ranking and score assignment business logic."""

import uuid

from app.db.models import Item as ItemModel

SCORE_BANDS: dict[str, tuple[float, float]] = {
    "good": (7.0, 10.0),
    "mid": (4.0, 7.0),
    "bad": (1.0, 4.0),
}


def assign_scores_for_set(sorted_items: list[ItemModel], tier_set: str) -> None:
    """
    Assign each ranked item a score within its tier_set's band, by rank.

    Args:
        sorted_items: Ranked items sorted from lowest to highest position
        tier_set: The tier set (good, mid, bad)
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
    """
    Filter items to only those that have been ranked (have a position assigned).

    Args:
        items: List of items to filter
        exclude_id: Optional item ID to exclude from the result

    Returns:
        List of ranked items, optionally excluding the specified item
    """
    if exclude_id is None:
        return [item for item in items if item.position is not None]
    return [
        item
        for item in items
        if item.position is not None and item.item_id != exclude_id
    ]
