import uuid
from datetime import UTC, datetime
from typing import cast

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.algorithm import find_next_comparison
from app.core.fractional_index import generate_key_between
from app.crud import comparison as comparison_crud, item as item_crud, list as list_crud
from app.db.models import ComparisonSession as ComparisonSessionModel, Item as ItemModel
from app.schemas.item import (
    Comparison,
    ComparisonPreview,
    ComparisonResult,
    ComparisonSession,
    ComparisonStatus,
    Item as ItemSchema,
    TierSet,
)
from app.services.list_service import get_items_best_first
from app.services.ranking import SCORE_BANDS, assign_scores_for_set, filter_ranked_items
from app.utils.helper import sort_items_by_position

RANKING_CHANGED = "Ranking changed. Reload the current question."
LIST_CHANGED = "The list changed. Restart ranking to continue."


class ComparisonConflict(ValueError):
    pass


class ComparisonItemNotFound(LookupError):
    pass


def _candidate_snapshot(item: ItemModel) -> dict[str, str | None]:
    return {"position": item.position, "tier_set": item.tier_set}


def _peer_snapshot(peers: list[ItemModel]) -> list[dict[str, str]]:
    return [
        {"item_id": str(item.item_id), "position": item.position}
        for item in peers
        if item.position is not None
    ]


async def _ranked_peers(
    db: AsyncSession, item: ItemModel, tier_set: str
) -> list[ItemModel]:
    items = await item_crud.get_by_list_and_tier_set(db, item.list_id, tier_set)
    return sort_items_by_position(filter_ranked_items(items, item.item_id))


def _set_draft_state(
    session: ComparisonSessionModel,
    item: ItemModel,
    tier_set: str,
    peers: list[ItemModel],
) -> None:
    session.tier_set = tier_set
    session.peer_snapshot = _peer_snapshot(peers)
    session.candidate_snapshot = _candidate_snapshot(item)
    session.min_index = 0
    session.max_index = len(peers)
    session.comparisons_answered = 0
    session.previous_state = None
    if peers:
        session.status = "active"
        session.comparison_index = len(peers) // 2
        session.target_item_id = peers[session.comparison_index].item_id
    else:
        session.status = "ready_to_commit"
        session.comparison_index = 0
        session.target_item_id = None


async def start_comparison(
    db: AsyncSession,
    item: ItemModel,
    tier_set: str,
    *,
    discard_on_cancel: bool = False,
    restart: bool = False,
    revision: int | None = None,
) -> ComparisonSessionModel:
    session = await comparison_crud.get_active_by_item(db, item.item_id)
    if session is not None:
        if not restart:
            if session.tier_set != tier_set:
                raise ComparisonConflict("Finish or cancel the current ranking first.")
            return session
        if revision is None or revision != session.revision:
            raise ComparisonConflict(RANKING_CHANGED)
        peers = await _ranked_peers(db, item, tier_set)
        _set_draft_state(session, item, tier_set, peers)
        session.revision += 1
        await db.flush()
        return session
    if restart:
        raise ComparisonConflict(RANKING_CHANGED)

    peers = await _ranked_peers(db, item, tier_set)
    session = ComparisonSessionModel(
        session_id=uuid.uuid4(),
        list_id=item.list_id,
        new_item_id=item.item_id,
        tier_set=tier_set,
        discard_on_cancel=discard_on_cancel,
    )
    _set_draft_state(session, item, tier_set, peers)
    await comparison_crud.create(db, session)
    return session


async def _fresh_live_state(
    db: AsyncSession,
    session: ComparisonSessionModel,
    item: ItemModel | None = None,
) -> tuple[ItemModel, list[ItemModel], bool]:
    if item is None:
        item = await item_crud.get_by_id(db, session.new_item_id)
    if item is None:
        raise ComparisonItemNotFound
    peers = await _ranked_peers(db, item, session.tier_set)
    stale = (
        _candidate_snapshot(item) != session.candidate_snapshot
        or _peer_snapshot(peers) != session.peer_snapshot
    )
    return item, peers, stale


def _position_for_gap(peers: list[ItemModel], gap: int) -> str:
    if not 0 <= gap <= len(peers):
        raise ComparisonConflict(RANKING_CHANGED)
    lower = peers[gap - 1].position if gap else None
    upper = peers[gap].position if gap < len(peers) else None
    return generate_key_between(lower, upper)


async def _draft_preview(
    db: AsyncSession,
    session: ComparisonSessionModel,
    item: ItemModel,
    peers: list[ItemModel],
    gap: int,
) -> ComparisonPreview:
    band = SCORE_BANDS.get(session.tier_set)
    if band is None:
        raise ComparisonConflict(RANKING_CHANGED)
    low, high = band
    ranked_count = len(peers) + 1
    score = round(low + (high - low) * (gap + 0.5) / ranked_count, 1)
    position = _position_for_gap(peers, gap)
    preview_item = ItemModel(
        item_id=item.item_id,
        list_id=item.list_id,
        name=item.name,
        position=position,
        rating=score,
        tier_set=session.tier_set,
    )
    items = await item_crud.get_by_list_id(db, item.list_id)
    hypothetical = [
        candidate for candidate in items if candidate.item_id != item.item_id
    ]
    hypothetical.append(preview_item)
    best_first = get_items_best_first(hypothetical)
    rank = next(
        index
        for index, candidate in enumerate(best_first, start=1)
        if candidate.item_id == item.item_id
    )
    return ComparisonPreview(
        score=score,
        rank=rank,
        ranked_count=sum(candidate.position is not None for candidate in hypothetical),
        tier_set=TierSet(session.tier_set),
    )


def _completed_preview(
    session: ComparisonSessionModel, item: ItemModel, items: list[ItemModel]
) -> ComparisonPreview | None:
    if item.position is None or item.rating is None or item.tier_set is None:
        return None
    best_first = get_items_best_first(items)
    rank = next(
        index
        for index, candidate in enumerate(best_first, start=1)
        if candidate.item_id == item.item_id
    )
    return ComparisonPreview(
        score=item.rating,
        rank=rank,
        ranked_count=sum(candidate.position is not None for candidate in items),
        tier_set=TierSet(item.tier_set),
    )


async def build_comparison_session_response(
    db: AsyncSession, session: ComparisonSessionModel
) -> ComparisonSession:
    await db.refresh(session)
    item = await item_crud.get_by_id(db, session.new_item_id)
    if item is None:
        raise ComparisonItemNotFound

    is_stale = False
    current_comparison = None
    preview = None
    if session.status in {"active", "ready_to_commit"}:
        item, peers, is_stale = await _fresh_live_state(db, session, item)
        if not is_stale and session.status == "active":
            index = session.comparison_index
            if (
                not 0 <= index < len(peers)
                or peers[index].item_id != session.target_item_id
            ):
                is_stale = True
            else:
                current_comparison = Comparison(
                    reference_item=ItemSchema.model_validate(item),
                    target_item=ItemSchema.model_validate(peers[index]),
                )
        elif not is_stale:
            if session.min_index != session.max_index:
                is_stale = True
            else:
                preview = await _draft_preview(
                    db, session, item, peers, session.comparison_index
                )
        if is_stale:
            current_comparison = None
            preview = None
    elif session.status == "completed":
        items = await item_crud.get_by_list_id(db, item.list_id)
        preview = _completed_preview(session, item, items)

    return ComparisonSession(
        session_id=str(session.session_id),
        list_id=session.list_id,
        item_id=session.new_item_id,
        status=cast(ComparisonStatus, session.status),
        tier_set=TierSet(session.tier_set),
        revision=session.revision,
        comparisons_answered=session.comparisons_answered,
        comparison_limit=len(session.peer_snapshot).bit_length(),
        can_undo=(
            session.previous_state is not None
            and session.status in {"active", "ready_to_commit"}
        ),
        discard_on_cancel=session.discard_on_cancel,
        is_stale=is_stale,
        item=ItemSchema.model_validate(item),
        current_comparison=current_comparison,
        preview=preview,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


def _check_revision(session: ComparisonSessionModel, revision: int) -> None:
    if revision != session.revision:
        raise ComparisonConflict(RANKING_CHANGED)


async def process_comparison_result(
    db: AsyncSession,
    session: ComparisonSessionModel,
    result: ComparisonResult,
    revision: int,
) -> ComparisonSessionModel:
    _check_revision(session, revision)
    if session.status != "active":
        raise ComparisonConflict(RANKING_CHANGED)
    _, peers, stale = await _fresh_live_state(db, session)
    if stale:
        raise ComparisonConflict(LIST_CHANGED)
    index = session.comparison_index
    if not 0 <= index < len(peers) or peers[index].item_id != session.target_item_id:
        raise ComparisonConflict(RANKING_CHANGED)

    session.previous_state = {
        "min_index": session.min_index,
        "max_index": session.max_index,
        "comparison_index": session.comparison_index,
        "target_item_id": str(session.target_item_id),
        "status": session.status,
        "comparisons_answered": session.comparisons_answered,
    }
    low, high = find_next_comparison(
        session.min_index,
        session.max_index,
        index,
        result == "better",
    )
    session.min_index = low
    session.max_index = high
    session.comparisons_answered += 1
    session.revision += 1
    if low == high:
        session.status = "ready_to_commit"
        session.comparison_index = low
        session.target_item_id = None
    else:
        session.status = "active"
        session.comparison_index = (low + high) // 2
        session.target_item_id = peers[session.comparison_index].item_id
    await db.flush()
    return session


async def undo_comparison(
    db: AsyncSession, session: ComparisonSessionModel, revision: int
) -> ComparisonSessionModel:
    _check_revision(session, revision)
    if session.status not in {"active", "ready_to_commit"}:
        raise ComparisonConflict(RANKING_CHANGED)
    if session.previous_state is None:
        raise ComparisonConflict("There is no answer to undo.")
    _, _, stale = await _fresh_live_state(db, session)
    if stale:
        raise ComparisonConflict(LIST_CHANGED)

    previous = session.previous_state
    session.min_index = cast(int, previous["min_index"])
    session.max_index = cast(int, previous["max_index"])
    session.comparison_index = cast(int, previous["comparison_index"])
    previous_target = previous["target_item_id"]
    session.target_item_id = uuid.UUID(str(previous_target))
    session.status = str(previous["status"])
    session.comparisons_answered = cast(int, previous["comparisons_answered"])
    session.previous_state = None
    session.revision += 1
    await db.flush()
    return session


async def finalize_comparison(
    db: AsyncSession, session: ComparisonSessionModel, revision: int
) -> ComparisonSessionModel:
    if session.status == "completed":
        return session
    _check_revision(session, revision)
    if session.status != "ready_to_commit":
        raise ComparisonConflict(RANKING_CHANGED)
    item, peers, stale = await _fresh_live_state(db, session)
    if stale:
        raise ComparisonConflict(LIST_CHANGED)
    if session.min_index != session.max_index:
        raise ComparisonConflict(RANKING_CHANGED)

    source_tier = session.candidate_snapshot.get("tier_set")
    item.position = _position_for_gap(peers, session.comparison_index)
    item.tier_set = session.tier_set
    item.updated_at = datetime.now(UTC)
    list_obj = await list_crud.get_by_id(db, session.list_id, populate_existing=True)
    if list_obj is None:
        raise ComparisonItemNotFound
    list_obj.updated_at = datetime.now(UTC)
    await db.flush()

    destination_items = await item_crud.get_ranked_by_list_and_tier_set(
        db, session.list_id, session.tier_set
    )
    assign_scores_for_set(destination_items, session.tier_set)
    if source_tier is not None and source_tier != session.tier_set:
        source_items = await item_crud.get_ranked_by_list_and_tier_set(
            db, session.list_id, source_tier
        )
        assign_scores_for_set(source_items, source_tier)

    session.status = "completed"
    session.target_item_id = None
    session.previous_state = None
    session.revision += 1
    await db.flush()
    return session


async def cancel_comparison(db: AsyncSession, session: ComparisonSessionModel) -> None:
    if session.status == "completed":
        raise ComparisonConflict("Ranking has already been saved.")
    if session.status == "cancelled":
        return
    if session.discard_on_cancel:
        item = await item_crud.get_by_id(db, session.new_item_id)
        if item is not None:
            await item_crud.delete(db, item)
        return
    session.status = "cancelled"
    session.target_item_id = None
    session.previous_state = None
    await db.flush()
