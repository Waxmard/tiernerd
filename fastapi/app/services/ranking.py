"""Ranking and score assignment business logic."""

import uuid
from collections.abc import Iterable, Sequence
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.fractional_index import generate_key_between
from app.core.rounding import half_even_1
from app.crud import item as item_crud
from app.db.models import Item as ItemModel, List as ListModel
from app.services.list_service import get_items_best_first

CURVE_ALPHA = 0.7
CURVE_BETA = 0.54
AUTO_MIN_SCORE = 0.1
AUTO_MAX_SCORE = 9.9


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
            s = half_even_1(manual)
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
            scores[rk - 1] = min(max(half_even_1(score_from_u(u)), lo_cap), hi_cap)
        if 1 <= r_lo <= n:
            scores[r_lo - 1] = s_lo
    return scores


def _format_score(value: float) -> str:
    return f"{value:.1f}".removesuffix(".0")


def _pinned_neighbor(
    items: Sequence[ItemModel], indexes: Iterable[int]
) -> tuple[str, float] | None:
    for index in indexes:
        item = items[index]
        if item.manual_rating is not None:
            return item.name, half_even_1(item.manual_rating)
    return None


def manual_rating_bounds_error(
    best_first_items: Sequence[ItemModel], target_item_id: uuid.UUID, value: float
) -> str | None:
    target_index = next(
        (
            i
            for i, item in enumerate(best_first_items)
            if item.item_id == target_item_id
        ),
        None,
    )
    if target_index is None:
        return None
    upper = _pinned_neighbor(best_first_items, range(target_index - 1, -1, -1))
    lower = _pinned_neighbor(
        best_first_items, range(target_index + 1, len(best_first_items))
    )
    rounded = half_even_1(value)
    if not (upper and rounded > upper[1]) and not (lower and rounded < lower[1]):
        return None
    if upper and lower:
        return (
            f"Score must be between {_format_score(lower[1])} ({lower[0]}) "
            f"and {_format_score(upper[1])} ({upper[0]}), or re-rank this item."
        )
    if upper:
        return (
            f"Score must be {_format_score(upper[1])} or lower "
            f"({upper[0]} has a manual score above it), or re-rank this item."
        )
    if lower:
        return (
            f"Score must be {_format_score(lower[1])} or higher "
            f"({lower[0]} has a manual score below it), or re-rank this item."
        )
    return None


def assign_scores(sorted_items: list[ItemModel]) -> None:
    """Assign scores to items ordered by ascending position."""
    best_first = list(reversed(sorted_items))
    scores = compute_scores([item.manual_rating for item in best_first])
    for item, score in zip(best_first, scores, strict=True):
        item.rating = score


def place_item(items: list[ItemModel], item: ItemModel, gap: int) -> None:
    """Place item so that `gap` worse-ranked items sit below it; rescore the list."""
    peers = sorted(
        (peer for peer in items if peer.item_id != item.item_id),
        key=lambda peer: peer.position,
    )
    clamped = max(0, min(gap, len(peers)))
    lower = peers[clamped - 1].position if clamped else None
    upper = peers[clamped].position if clamped < len(peers) else None
    item.position = generate_key_between(lower, upper)
    item.manual_rating = None
    peers.insert(clamped, item)
    assign_scores(peers)


async def set_item_ranking(
    db: AsyncSession, list_obj: ListModel, item: ItemModel, gap: int
) -> list[ItemModel]:
    """Place item so that `gap` worse-ranked peers sit below it; rescore the list."""
    place_item(await item_crud.get_by_list_id(db, list_obj.list_id), item, gap)
    now = datetime.now(UTC)
    item.updated_at = now
    list_obj.updated_at = now
    await db.flush()
    return get_items_best_first(await item_crud.get_by_list_id(db, list_obj.list_id))
