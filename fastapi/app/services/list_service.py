"""List-related business logic."""

from typing import Any

from app.db.models import Item as ItemModel


def get_items_best_first(items: list[ItemModel]) -> list[ItemModel]:
    """Order items by descending position."""
    return sorted(items, key=lambda i: i.position, reverse=True)


def build_list_simple_response(row: tuple[Any, ...]) -> dict[str, Any]:
    """Build a ListSimple response from a (ListModel, item_count) row."""
    list_obj = row[0]
    item_count = row[1] or 0
    return {
        "list_id": list_obj.list_id,
        "user_id": list_obj.user_id,
        "title": list_obj.title,
        "description": list_obj.description,
        "icon": list_obj.icon,
        "ranking_mode": list_obj.ranking_mode,
        "created_at": list_obj.created_at,
        "updated_at": list_obj.updated_at,
        "item_count": item_count,
    }
