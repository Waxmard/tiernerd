"""Ranking and score assignment business logic."""

import math
import uuid
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import TypedDict

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.fractional_index import generate_key_between
from app.crud import item as item_crud
from app.db.models import Item as ItemModel, List as ListModel
from app.services.list_service import get_items_best_first

CURVE_ALPHA = 0.7
CURVE_BETA = 0.54
AUTO_MIN_SCORE = 0.1
AUTO_MAX_SCORE = 9.9


class PinnedNeighbor(TypedDict):
    name: str
    rating: float


class ManualRatingBounds(TypedDict):
    upper: PinnedNeighbor | None
    lower: PinnedNeighbor | None


def _half_even_1(value: float) -> float:
    scaled = value * 10
    floor = math.floor(scaled)
    diff = scaled - floor
    if diff > 0.5:
        rounded = floor + 1
    elif diff < 0.5 or floor % 2 == 0:
        rounded = floor
    else:
        rounded = floor + 1
    return rounded / 10


def score_from_u(u: float) -> float:
    if u <= 0:
        return 0.0
    if u >= 1:
        return 10.0
    u_pow = u**CURVE_ALPHA
    return float((10 * u_pow) / (u_pow + CURVE_BETA * ((1 - u) ** CURVE_ALPHA)))


def u_from_score(score: float) -> float:
    if score <= 0:
        return 0.0
    if score >= 10:
        return 1.0
    return float(1 / (1 + (((10 - score) / (CURVE_BETA * score)) ** (1 / CURVE_ALPHA))))


def compute_scores(manual_ratings_best_first: Sequence[float | None]) -> list[float]:
    n = len(manual_ratings_best_first)
    if n == 0:
        return []
    anchors: list[tuple[int, float, float]] = [(0, 10.0, 1.0)]
    for index, manual in enumerate(manual_ratings_best_first):
        if manual is not None:
            s = _half_even_1(manual)
            anchors.append((index + 1, s, u_from_score(s)))
    anchors.append((n + 1, 0.0, 0.0))

    scores = [0.0] * n
    for i in range(len(anchors) - 1):
        r_hi, s_hi, u_hi = anchors[i]
        r_lo, s_lo, u_lo = anchors[i + 1]
        span = r_lo - r_hi
        hi_cap = AUTO_MAX_SCORE if (r_hi == 0 and s_lo <= AUTO_MAX_SCORE) else s_hi
        lo_cap = AUTO_MIN_SCORE if (r_lo == n + 1 and s_hi >= AUTO_MIN_SCORE) else s_lo
        for rk in range(r_hi + 1, r_lo):
            u = u_lo + (u_hi - u_lo) * (r_lo - rk) / span
            scores[rk - 1] = min(max(_half_even_1(score_from_u(u)), lo_cap), hi_cap)
        if 1 <= r_lo <= n:
            scores[r_lo - 1] = s_lo
    return scores


def score_for_rank(rank: int, ranked_count: int) -> float:
    """Return the score for a valid best-first rank in a nonempty list."""
    return compute_scores([None] * ranked_count)[rank - 1]


def manual_rating_bounds(
    best_first_items: Sequence[ItemModel], target_item_id: uuid.UUID
) -> ManualRatingBounds:
    target_index = next(
        (
            index
            for index, item in enumerate(best_first_items)
            if item.item_id == target_item_id
        ),
        -1,
    )
    if target_index == -1:
        return {"upper": None, "lower": None}
    upper: PinnedNeighbor | None = None
    for index in range(target_index - 1, -1, -1):
        candidate = best_first_items[index]
        if candidate.manual_rating is not None:
            upper = {
                "name": candidate.name,
                "rating": _half_even_1(candidate.manual_rating),
            }
            break
    lower: PinnedNeighbor | None = None
    for index in range(target_index + 1, len(best_first_items)):
        candidate = best_first_items[index]
        if candidate.manual_rating is not None:
            lower = {
                "name": candidate.name,
                "rating": _half_even_1(candidate.manual_rating),
            }
            break
    return {"upper": upper, "lower": lower}


def _format_score(value: float) -> str:
    return f"{value:.1f}".removesuffix(".0")


def manual_rating_bounds_error(
    best_first_items: Sequence[ItemModel], target_item_id: uuid.UUID, value: float
) -> str | None:
    bounds = manual_rating_bounds(best_first_items, target_item_id)
    upper = bounds["upper"]
    lower = bounds["lower"]
    rounded = _half_even_1(value)
    violates_upper = upper is not None and rounded > upper["rating"]
    violates_lower = lower is not None and rounded < lower["rating"]
    if not violates_upper and not violates_lower:
        return None
    if upper is not None and lower is not None:
        return (
            f"Score must be between {_format_score(lower['rating'])} "
            f"({lower['name']}) and {_format_score(upper['rating'])} "
            f"({upper['name']}), or re-rank this item."
        )
    if upper is not None:
        return (
            f"Score must be {_format_score(upper['rating'])} or lower "
            f"({upper['name']} has a manual score above it), or re-rank this item."
        )
    if lower is not None:
        return (
            f"Score must be {_format_score(lower['rating'])} or higher "
            f"({lower['name']} has a manual score below it), or re-rank this item."
        )
    return None


def assign_scores(sorted_items: list[ItemModel]) -> None:
    """Assign scores to items ordered by ascending position."""
    best_first = list(reversed(sorted_items))
    scores = compute_scores(
        [getattr(item, "manual_rating", None) for item in best_first]
    )
    for item, score in zip(best_first, scores, strict=True):
        item.rating = score


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
    item.manual_rating = None
    item.updated_at = now
    list_obj.updated_at = now
    peers.insert(clamped, item)
    assign_scores(peers)
    await db.flush()
    return get_items_best_first(await item_crud.get_by_list_id(db, list_obj.list_id))
