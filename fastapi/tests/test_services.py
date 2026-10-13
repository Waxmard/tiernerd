import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Item as ItemModel
from app.services.comparison_service import (
    LIST_CHANGED,
    ComparisonConflict,
    build_comparison_session_response,
    finalize_comparison,
    process_comparison_result,
    start_comparison,
    undo_comparison,
)
from app.services.ranking import assign_scores_for_set, filter_ranked_items
from app.utils.helper import sort_items_by_position


def create_item(
    name: str = "Test Item",
    tier_set: str = "good",
    list_id: uuid.UUID | None = None,
    position: str | None = "a0",
    rating: float | None = None,
) -> ItemModel:
    now = datetime.now(UTC)
    return ItemModel(
        item_id=uuid.uuid4(),
        list_id=list_id or uuid.uuid4(),
        name=name,
        description="",
        image_url=None,
        position=position,
        rating=rating,
        tier_set=tier_set,
        created_at=now,
        updated_at=now,
    )


@pytest.mark.asyncio
async def test_empty_range_starts_ready_with_valid_preview(
    test_db: AsyncSession, item_factory
) -> None:
    candidate = item_factory(name="New", tier_set="bad", position=None)
    test_db.add(candidate)
    await test_db.commit()

    session = await start_comparison(test_db, candidate, "bad", discard_on_cancel=True)
    response = await build_comparison_session_response(test_db, session)

    assert response.status == "ready_to_commit"
    assert response.comparisons_answered == 0
    assert response.comparison_limit == 0
    assert response.preview is not None
    assert response.preview.score == 2.5
    assert response.preview.rank == 1
    assert response.discard_on_cancel is True


@pytest.mark.asyncio
async def test_answer_undo_and_commit_preserve_draft_until_commit(
    test_db: AsyncSession, test_item: ItemModel, item_factory
) -> None:
    assign_scores_for_set([test_item], "good")
    candidate = item_factory(name="Candidate", position=None)
    test_db.add(candidate)
    await test_db.commit()

    session = await start_comparison(test_db, candidate, "good")
    await process_comparison_result(test_db, session, "better", revision=0)
    response = await build_comparison_session_response(test_db, session)

    assert response.status == "ready_to_commit"
    assert response.preview is not None
    assert response.preview.score == 9.2
    assert response.preview.rank == 1
    assert candidate.position is None
    assert candidate.rating is None
    assert test_item.position == "a0"
    assert test_item.rating == 8.5

    await undo_comparison(test_db, session, revision=1)
    assert session.status == "active"
    assert session.revision == 2
    assert candidate.position is None
    assert candidate.rating is None

    await process_comparison_result(test_db, session, "worse", revision=2)
    await finalize_comparison(test_db, session, revision=3)
    assert session.status == "completed"
    assert session.revision == 4
    assert candidate.position < test_item.position
    assert candidate.rating == 7.8
    assert test_item.rating == 9.2

    await finalize_comparison(test_db, session, revision=0)
    assert session.revision == 4


@pytest.mark.asyncio
async def test_changed_peer_makes_draft_stale_without_mutation(
    test_db: AsyncSession, test_item: ItemModel, item_factory
) -> None:
    candidate = item_factory(name="Candidate", position=None)
    test_db.add(candidate)
    await test_db.commit()
    session = await start_comparison(test_db, candidate, "good")

    test_item.position = "z0"
    await test_db.commit()
    response = await build_comparison_session_response(test_db, session)
    assert response.is_stale is True
    assert response.current_comparison is None

    with pytest.raises(ComparisonConflict, match=LIST_CHANGED):
        await process_comparison_result(test_db, session, "better", revision=0)
    assert candidate.position is None
    assert candidate.rating is None


class TestRankingService:
    def test_filter_ranked_items_empty(self) -> None:
        assert filter_ranked_items([]) == []

    def test_filter_ranked_items_all_ranked(self) -> None:
        items = [create_item(name=f"Item {i}", position=f"a{i}") for i in range(3)]
        assert len(filter_ranked_items(items)) == 3

    def test_filter_ranked_items_excludes_unranked(self) -> None:
        items = [
            create_item(name="Ranked"),
            create_item(name="Unranked", position=None),
        ]
        assert [item.name for item in filter_ranked_items(items)] == ["Ranked"]

    def test_filter_ranked_items_excludes_specific_id(self) -> None:
        excluded_id = uuid.uuid4()
        items = [
            create_item(name="Kept"),
            create_item(name="Excluded", position="a1"),
        ]
        items[1].item_id = excluded_id
        assert filter_ranked_items(items, excluded_id) == [items[0]]

    @pytest.mark.parametrize(
        ("tier_set", "expected"),
        [("good", [7.4, 8.1, 8.9, 9.6]), ("mid", [4.4, 5.1, 5.9, 6.6])],
    )
    def test_assign_scores_for_set(self, tier_set: str, expected: list[float]) -> None:
        items = [create_item(name=f"Item {i}", position=f"a{i}") for i in range(4)]
        assign_scores_for_set(items, tier_set)
        assert [item.rating for item in items] == expected

    def test_assign_scores_for_set_empty_or_unknown(self) -> None:
        item = create_item(tier_set="unknown")
        assign_scores_for_set([], "good")
        assign_scores_for_set([item], "unknown")
        assert item.rating is None

    def test_sort_items_by_position(self) -> None:
        items = [
            create_item(name="Second", position="a1"),
            create_item(name="First", position="a0"),
        ]
        assert sort_items_by_position(items) == [items[1], items[0]]
