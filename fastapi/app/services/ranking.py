"""Ranking and score assignment business logic."""

import uuid

from app.db.models import Item as ItemModel


def score_for_rank(rank: int, ranked_count: int) -> float:
    """Return the score for a valid best-first rank in a nonempty list."""
    if ranked_count == 1:
        return 10.0
    return round(10 * (ranked_count - rank) / (ranked_count - 1), 1)


def assign_scores(sorted_items: list[ItemModel]) -> None:
    """Assign scores to items ordered by ascending position."""
    ranked_count = len(sorted_items)
    for index, item in enumerate(sorted_items):
        item.rating = score_for_rank(ranked_count - index, ranked_count)


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
