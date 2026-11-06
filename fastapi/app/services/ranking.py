"""Ranking and score assignment business logic."""

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.fractional_index import generate_key_between
from app.crud import item as item_crud
from app.db.models import Item as ItemModel, List as ListModel
from app.services.list_service import get_items_best_first


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


def sort_items_by_position(items: list[ItemModel]) -> list[ItemModel]:
    """Sort ranked items lexicographically by position; put unranked items last."""
    if not items:
        return []
    ranked = [item for item in items if item.position is not None]
    unranked = [item for item in items if item.position is None]
    ranked.sort(key=lambda x: x.position or "")
    return ranked + unranked


async def set_item_ranking(
    db: AsyncSession, list_obj: ListModel, item: ItemModel, gap: int
) -> list[ItemModel]:
    """Place item so that `gap` worse-ranked peers sit below it; rescore the list."""
    items = await item_crud.get_by_list_id(db, list_obj.list_id)
    peers = sort_items_by_position(filter_ranked_items(items, exclude_id=item.item_id))
    clamped = max(0, min(gap, len(peers)))
    lower = peers[clamped - 1].position if clamped else None
    upper = peers[clamped].position if clamped < len(peers) else None
    now = datetime.now(UTC)
    item.position = generate_key_between(lower, upper)
    item.updated_at = now
    list_obj.updated_at = now
    peers.insert(clamped, item)
    assign_scores(peers)
    await db.flush()
    return get_items_best_first(await item_crud.get_by_list_id(db, list_obj.list_id))
