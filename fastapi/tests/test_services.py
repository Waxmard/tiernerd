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
from app.services.list_service import get_items_best_first
from app.services.ranking import assign_scores, filter_ranked_items, score_for_rank
from app.utils.helper import sort_items_by_position


def create_item(
    name: str = "Test Item",
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
        created_at=now,
        updated_at=now,
    )


async def test_without_peers_starts_ready_with_valid_preview(
    test_db: AsyncSession, item_factory
) -> None:
    candidate = item_factory(name="New", position=None)
    test_db.add(candidate)
    await test_db.commit()

    session = await start_comparison(test_db, candidate, discard_on_cancel=True)
    response = await build_comparison_session_response(test_db, session)

    assert response.status == "ready_to_commit"
    assert response.comparisons_answered == 0
    assert response.comparison_limit == 0
    assert response.preview is not None
    assert response.preview.score == 10.0
    assert response.preview.rank == 1
    assert response.preview.ranked_count == 1
    assert response.item.position is None
    assert response.item.rating is None
    assert response.discard_on_cancel is True


async def test_answer_undo_and_commit_preserve_draft_until_commit(
    test_db: AsyncSession, test_item: ItemModel, item_factory
) -> None:
    assign_scores([test_item])
    candidate = item_factory(name="Candidate", position=None)
    test_db.add(candidate)
    await test_db.commit()

    session = await start_comparison(test_db, candidate)
    await process_comparison_result(test_db, session, "better", revision=0)
    response = await build_comparison_session_response(test_db, session)

    assert response.status == "ready_to_commit"
    assert response.preview is not None
    assert response.preview.score == 10.0
    assert response.preview.rank == 1
    assert response.preview.ranked_count == 2
    assert candidate.position is None
    assert candidate.rating is None
    assert test_item.position == "a0"
    assert test_item.rating == 10.0

    await undo_comparison(test_db, session, revision=1)
    assert session.status == "active"
    assert session.revision == 2
    assert candidate.position is None
    assert candidate.rating is None

    await process_comparison_result(test_db, session, "worse", revision=2)
    response = await build_comparison_session_response(test_db, session)
    assert response.preview is not None
    assert response.preview.score == 0.0
    assert response.preview.rank == 2
    assert candidate.position is None
    assert candidate.rating is None
    await finalize_comparison(test_db, session, revision=3)
    assert session.status == "completed"
    assert session.revision == 4
    assert candidate.position < test_item.position
    assert candidate.rating == 0.0
    assert test_item.rating == 10.0

    await finalize_comparison(test_db, session, revision=0)
    assert session.revision == 4


async def test_changed_peer_makes_draft_stale_without_mutation(
    test_db: AsyncSession, test_item: ItemModel, item_factory
) -> None:
    candidate = item_factory(name="Candidate", position=None)
    test_db.add(candidate)
    await test_db.commit()
    session = await start_comparison(test_db, candidate)

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
        "best_first_scores",
        [
            [],
            [10.0],
            [10.0, 0.0],
            [10.0, 5.0, 0.0],
            [10.0, 6.7, 3.3, 0.0],
        ],
    )
    def test_assign_scores(self, best_first_scores: list[float]) -> None:
        items = [
            create_item(name=f"Item {i}", position=f"a{i}")
            for i in range(len(best_first_scores))
        ]
        assign_scores(items)
        best_first = get_items_best_first(items)
        assert best_first == list(reversed(items))
        assert [item.rating for item in best_first] == best_first_scores
        assert [
            score_for_rank(rank, len(items)) for rank in range(1, len(items) + 1)
        ] == best_first_scores

    def test_sort_items_by_position(self) -> None:
        items = [
            create_item(name="Second", position="a1"),
            create_item(name="First", position="a0"),
        ]
        assert sort_items_by_position(items) == [items[1], items[0]]
