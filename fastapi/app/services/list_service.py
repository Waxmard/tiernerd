"""List-related business logic."""

from typing import Any

from app.db.models import Item as ItemModel


def get_items_best_first(items: list[ItemModel]) -> list[ItemModel]:
    """Order ranked items by descending position, then append unranked items."""
    ranked = [i for i in items if i.position is not None]
    unranked = [i for i in items if i.position is None]
    ranked.sort(key=lambda i: i.position or "", reverse=True)
    return ranked + unranked


def build_list_simple_response(row: tuple[Any, ...]) -> dict[str, Any]:
    """Build a ListSimple response from a (ListModel, item_count) row."""
    list_obj = row[0]
    item_count = row[1] or 0
    return {
        "list_id": list_obj.list_id,
        "user_id": list_obj.user_id,
        "title": list_obj.title,
        "description": list_obj.description,
        "color": list_obj.color,
        "icon": list_obj.icon,
        "cover": list_obj.cover,
        "ranking_mode": list_obj.ranking_mode,
        "created_at": list_obj.created_at,
        "updated_at": list_obj.updated_at,
        "item_count": item_count,
    }
