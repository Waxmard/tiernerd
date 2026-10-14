"""List-related business logic."""

from typing import Any

from app.db.models import Item as ItemModel
from app.services.ranking import SCORE_BANDS


def get_items_best_first(items: list[ItemModel]) -> list[ItemModel]:
    """
    Order items best first: bands good, mid, bad, best position first within a
    band, then unranked items.

    Args:
        items: List of items to order

    Returns:
        List of items, best first, unranked last
    """
    ranked = [i for i in items if i.position is not None]
    unranked = [i for i in items if i.position is None]
    ranked.sort(
        key=lambda i: (
            SCORE_BANDS.get(i.tier_set or "", (0.0, 0.0))[0],
            i.position or "",
        ),
        reverse=True,
    )
    return ranked + unranked


def build_list_response(
    list_obj: Any, items: list[Any] | None = None
) -> dict[str, Any]:
    """
    Build a standard list response dictionary.

    Args:
        list_obj: The list model object
        items: Optional list of items to include

    Returns:
        Dictionary with list data
    """
    response: dict[str, Any] = {
        "list_id": list_obj.list_id,
        "user_id": list_obj.user_id,
        "title": list_obj.title,
        "description": list_obj.description,
        "color": list_obj.color,
        "created_at": list_obj.created_at,
        "updated_at": list_obj.updated_at,
    }
    if items is not None:
        response["items"] = items
    return response


def build_list_simple_response(row: tuple[Any, ...]) -> dict[str, Any]:
    """
    Build a ListSimple response from a database row with stats.

    Args:
        row: Tuple of (ListModel, item_count)

    Returns:
        Dictionary with list data and statistics
    """
    list_obj = row[0]
    item_count = row[1] or 0
    return {
        "list_id": list_obj.list_id,
        "user_id": list_obj.user_id,
        "title": list_obj.title,
        "description": list_obj.description,
        "color": list_obj.color,
        "created_at": list_obj.created_at,
        "updated_at": list_obj.updated_at,
        "item_count": item_count,
    }
