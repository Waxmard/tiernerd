"""Comparison session business logic."""

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.algorithm import find_next_comparison
from app.core.fractional_index import generate_key_between
from app.crud import comparison as comparison_crud, item as item_crud
from app.db.models import ComparisonSession as ComparisonSessionModel, Item as ItemModel
from app.schemas.item import Comparison, ComparisonSession
from app.services.ranking import assign_scores_for_set
from app.utils.helper import sort_items_by_position


async def start_comparison(
    db: AsyncSession,
    new_item: ItemModel,
    list_id: uuid.UUID,
    tier_set: str,
    ranked_items: list[ItemModel],
) -> ComparisonSessionModel:
    """
    Start a new comparison session for ranking an item.

    Args:
        db: Database session
        new_item: The new item being ranked
        list_id: ID of the list
        tier_set: The tier set (good, mid, bad)
        ranked_items: Already ranked items in the same tier_set

    Returns:
        The created comparison session model
    """
    all_items = sort_items_by_position(ranked_items)

    middle = len(all_items) // 2
    target_item = all_items[middle]

    session_id = uuid.uuid4()
    db_session = ComparisonSessionModel(
        session_id=session_id,
        list_id=list_id,
        new_item_id=new_item.item_id,
        target_item_id=target_item.item_id,
        tier_set=tier_set,
        min_index=0,
        max_index=len(all_items) - 1,
        comparison_index=middle,
        is_complete=False,
    )

    await comparison_crud.create(db, db_session)
    return db_session


def build_comparison_session_response(
    db_session: ComparisonSessionModel,
    new_item: ItemModel,
    target_item: ItemModel | None,
    comparison: Comparison | None = None,
) -> ComparisonSession:
    """
    Build a ComparisonSession response from database models.

    Args:
        db_session: The database session model
        new_item: The new item being ranked
        target_item: The current target item for comparison
        comparison: Optional pre-built comparison object

    Returns:
        ComparisonSession schema object
    """
    if comparison is None and target_item is not None and not db_session.is_complete:
        comparison = Comparison(
            reference_item=new_item,  # type: ignore[arg-type]
            target_item=target_item,  # type: ignore[arg-type]
            min_index=db_session.min_index,
            comparison_index=db_session.comparison_index,
            max_index=db_session.max_index,
            is_winner=None,
            done=False,
        )

    return ComparisonSession(
        session_id=str(db_session.session_id),
        list_id=db_session.list_id,
        item_id=db_session.new_item_id,
        current_comparison=comparison,
        is_complete=db_session.is_complete,
        created_at=db_session.created_at,
        updated_at=db_session.updated_at,
    )


def process_comparison_result(
    db_session: ComparisonSessionModel,
    is_winner: bool,
    new_item: ItemModel,
    target_item: ItemModel,
    ranked_items: list[ItemModel],
) -> Comparison:
    """
    Process a comparison result and determine the next step.

    Args:
        db_session: The comparison session
        is_winner: Whether the new item won the comparison
        new_item: The new item being ranked
        target_item: The current target item
        ranked_items: Already ranked items (excluding new_item)

    Returns:
        Updated Comparison object
    """
    sorted_items = sort_items_by_position(ranked_items)

    comparison = Comparison(
        reference_item=new_item,  # type: ignore[arg-type]
        target_item=target_item,  # type: ignore[arg-type]
        min_index=db_session.min_index,
        comparison_index=db_session.comparison_index,
        max_index=db_session.max_index,
        is_winner=is_winner,
        done=False,
    )

    return find_next_comparison(sorted_items, comparison)


async def finalize_comparison(
    db: AsyncSession,
    db_session: ComparisonSessionModel,
    comparison: Comparison,
    new_item: ItemModel,
    target_item: ItemModel,
    list_id: uuid.UUID,
    tier_set: str,
) -> None:
    """
    Finalize a comparison by setting item position and recalculating scores.

    Args:
        db: Database session
        db_session: The comparison session
        comparison: The final comparison result
        new_item: The new item being ranked
        target_item: The target item from the final comparison
        list_id: ID of the list
        tier_set: The tier set (good, mid, bad)
    """
    # Query adjacent item instead of using array indexing
    # Semantics: "better" items have HIGHER positions
    if target_item.position is None:
        raise ValueError(
            f"Target item {target_item.item_id} has no position; "
            "cannot finalize comparison"
        )

    target_position: str = target_item.position

    if comparison.is_winner:
        # New item is BETTER than target → goes AFTER target (higher position)
        # Need position between target and the next item
        lower_bound: str | None = target_position
        next_item = await item_crud.get_next_item_by_position(
            db, list_id, tier_set, target_position
        )
        upper_bound: str | None = next_item.position if next_item else None
    else:
        # New item is WORSE than target → goes BEFORE target (lower position)
        # Need position between the previous item and target
        prev_item = await item_crud.get_prev_item_by_position(
            db, list_id, tier_set, target_position
        )
        lower_bound = prev_item.position if prev_item else None
        upper_bound = target_position

    new_item.position = generate_key_between(lower_bound, upper_bound)
    new_item.updated_at = datetime.now(UTC)
    db.add(new_item)
    await db.flush()

    ranked = await item_crud.get_ranked_by_list_and_tier_set(db, list_id, tier_set)
    assign_scores_for_set(ranked, tier_set)

    # Mark session as complete
    await comparison_crud.mark_complete(db, db_session)
