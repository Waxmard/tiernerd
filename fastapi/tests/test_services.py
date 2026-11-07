import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Item as ItemModel, List as ListModel
from app.services.list_service import get_items_best_first
from app.services.ranking import (
    assign_scores,
    filter_ranked_items,
    score_for_rank,
    set_item_ranking,
    sort_items_by_position,
)


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


class TestRankingService:
    def test_filter_ranked_items(self) -> None:
        excluded_id = uuid.uuid4()
        ranked = create_item(name="Ranked")
        excluded = create_item(name="Excluded", position="a1")
        excluded.item_id = excluded_id
        unranked = create_item(name="Unranked", position=None)
        items = [ranked, excluded, unranked]
        assert filter_ranked_items([]) == []
        assert filter_ranked_items(items) == [ranked, excluded]
        assert filter_ranked_items(items, excluded_id) == [ranked]

    @pytest.mark.parametrize(
        "best_first_scores",
        [
            [],
            [6.5],
            [7.5, 5.3],
            [8.0, 6.5, 4.6],
            [8.3, 7.1, 5.8, 4.1],
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


class TestSetItemRanking:
    async def test_inserts_between_peers_and_rescores(
        self,
        test_db: AsyncSession,
        test_list: ListModel,
        item_factory,
    ) -> None:
        peers = [
            item_factory(name="Worst", position="a0", rating=0.0),
            item_factory(name="Third", position="a1", rating=5.0),
            item_factory(name="Best", position="a2", rating=10.0),
        ]
        mover = item_factory(name="Mover", position=None)
        test_db.add_all([*peers, mover])
        await test_db.commit()

        items = await set_item_ranking(test_db, test_list, mover, 2)

        assert [item.name for item in items] == [
            "Best",
            "Mover",
            "Third",
            "Worst",
        ]
        assert peers[0].position < peers[1].position < peers[2].position
        assert peers[1].position < mover.position < peers[2].position
        assert [item.rating for item in items] == [8.3, 7.1, 5.8, 4.1]

    async def test_gap_is_clamped_to_the_peer_range(
        self,
        test_db: AsyncSession,
        test_list: ListModel,
        item_factory,
    ) -> None:
        peers = [
            item_factory(name="Worst", position="a0", rating=0.0),
            item_factory(name="Best", position="a1", rating=10.0),
        ]
        mover = item_factory(name="Mover", position=None)
        test_db.add_all([*peers, mover])
        await test_db.commit()

        too_high = await set_item_ranking(test_db, test_list, mover, 99)
        assert too_high[0].item_id == mover.item_id
        assert too_high[0].rating == 8.0

        too_low = await set_item_ranking(test_db, test_list, mover, -3)
        assert too_low[-1].item_id == mover.item_id
        assert too_low[-1].rating == 4.6

    async def test_updates_list_and_item_timestamps(
        self,
        test_db: AsyncSession,
        test_list: ListModel,
        item_factory,
    ) -> None:
        stale = datetime(2020, 1, 1)
        test_list.updated_at = stale
        mover = item_factory(name="Mover", position=None)
        mover.updated_at = stale
        test_db.add(mover)
        await test_db.commit()

        await set_item_ranking(test_db, test_list, mover, 0)

        assert test_list.updated_at.replace(tzinfo=None) > datetime(2020, 1, 2)
        assert mover.updated_at.replace(tzinfo=None) > datetime(2020, 1, 2)

    async def test_first_item_becomes_the_only_ranked_entry(
        self,
        test_db: AsyncSession,
        test_list: ListModel,
        item_factory,
    ) -> None:
        mover = item_factory(name="Only", position=None)
        test_db.add(mover)
        await test_db.commit()

        items = await set_item_ranking(test_db, test_list, mover, 0)

        assert items == [mover]
        assert mover.position == "a0"
        assert mover.rating == 6.5
