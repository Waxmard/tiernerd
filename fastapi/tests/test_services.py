import uuid
from datetime import UTC, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Item as ItemModel, List as ListModel
from app.services.list_service import get_items_best_first
from app.services.ranking import (
    assign_scores,
    set_item_ranking,
)


def create_item(
    name: str = "Test Item",
    list_id: uuid.UUID | None = None,
    position: str = "a0",
    rating: float = 0.0,
) -> ItemModel:
    now = datetime.now(UTC)
    return ItemModel(
        item_id=uuid.uuid4(),
        list_id=list_id or uuid.uuid4(),
        name=name,
        description="",
        position=position,
        rating=rating,
        created_at=now,
        updated_at=now,
    )


class TestRankingService:
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


class TestSetItemRanking:
    async def test_updates_list_and_item_timestamps(
        self,
        test_db: AsyncSession,
        test_list: ListModel,
        item_factory,
    ) -> None:
        stale = datetime(2020, 1, 1)
        test_list.updated_at = stale
        mover = item_factory(name="Mover")
        mover.updated_at = stale
        test_db.add(mover)
        await test_db.commit()

        await set_item_ranking(test_db, test_list, mover, 0)

        assert test_list.updated_at.replace(tzinfo=None) > datetime(2020, 1, 2)
        assert mover.updated_at.replace(tzinfo=None) > datetime(2020, 1, 2)
