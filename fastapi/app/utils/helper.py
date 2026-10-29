from app.db.models import Item as ItemModel


def sort_items_by_position(items: list[ItemModel]) -> list[ItemModel]:
    """Sort ranked items lexicographically by position; put unranked items last."""
    if not items:
        return []

    ranked = [item for item in items if item.position is not None]
    unranked = [item for item in items if item.position is None]

    sorted_ranked = sorted(ranked, key=lambda x: x.position)  # type: ignore[arg-type, return-value]

    return sorted_ranked + unranked
