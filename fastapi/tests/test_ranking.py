"""Tests for placing an item at the requested ranking gap."""

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Item as ItemModel, List as ListModel, User


def ranked_item(
    list_id: uuid.UUID, name: str, position: str, rating: float
) -> ItemModel:
    now = datetime.now(UTC)
    return ItemModel(
        item_id=uuid.uuid4(),
        list_id=list_id,
        name=name,
        position=position,
        rating=rating,
        created_at=now,
        updated_at=now,
    )


@pytest.fixture
async def ranked_list(test_db: AsyncSession, test_list: ListModel) -> list[ItemModel]:
    items = [
        ranked_item(test_list.list_id, "Worst", "a0", 0.0),
        ranked_item(test_list.list_id, "Fourth", "a1", 2.5),
        ranked_item(test_list.list_id, "Third", "a2", 5.0),
        ranked_item(test_list.list_id, "Second", "a3", 7.5),
        ranked_item(test_list.list_id, "Best", "a4", 10.0),
    ]
    test_db.add_all(items)
    await test_db.commit()
    for item in items:
        await test_db.refresh(item)
    return items


def ordered(rows: list[dict]) -> list[tuple[str, float | None]]:
    return [(row["name"], row["rating"]) for row in rows]


class TestSetRanking:
    async def test_gap_zero_places_item_last_and_rescores(
        self,
        client: AsyncClient,
        ranked_list: list[ItemModel],
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ) -> None:
        mover = ranked_item(test_list.list_id, "Mover", "a2z", 1.0)
        test_db.add(mover)
        await test_db.commit()

        response = await client.put(
            f"/api/lists/{test_list.list_id}/ranking",
            json={"item_id": str(mover.item_id), "gap": 0},
            headers=auth_headers,
        )
        assert response.status_code == 200
        rows = response.json()
        assert ordered(rows) == [
            ("Best", 8.7),
            ("Second", 7.8),
            ("Third", 6.9),
            ("Fourth", 6.0),
            ("Worst", 4.9),
            ("Mover", 3.5),
        ]
        positions = [row["position"] for row in rows]
        assert len(set(positions)) == len(positions)

    async def test_gap_equal_to_ranked_count_places_item_first(
        self,
        client: AsyncClient,
        ranked_list: list[ItemModel],
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ) -> None:
        mover = ranked_item(test_list.list_id, "Mover", "a2z", 1.0)
        test_db.add(mover)
        await test_db.commit()

        response = await client.put(
            f"/api/lists/{test_list.list_id}/ranking",
            json={"item_id": str(mover.item_id), "gap": len(ranked_list)},
            headers=auth_headers,
        )
        assert response.status_code == 200
        rows = response.json()
        assert rows[0]["name"] == "Mover"
        assert rows[0]["rating"] == 8.7
        assert [row["rating"] for row in rows[1:]] == [7.8, 6.9, 6.0, 4.9, 3.5]

    async def test_gap_between_peers_reorders(
        self,
        client: AsyncClient,
        ranked_list: list[ItemModel],
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ) -> None:
        response = await client.put(
            f"/api/lists/{test_list.list_id}/ranking",
            json={"item_id": str(ranked_list[0].item_id), "gap": 4},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert [row["name"] for row in response.json()] == [
            "Worst",
            "Best",
            "Second",
            "Third",
            "Fourth",
        ]

        response = await client.put(
            f"/api/lists/{test_list.list_id}/ranking",
            json={"item_id": str(ranked_list[0].item_id), "gap": 1},
            headers=auth_headers,
        )
        assert response.status_code == 200
        rows = response.json()
        assert [row["name"] for row in rows] == [
            "Best",
            "Second",
            "Third",
            "Worst",
            "Fourth",
        ]
        assert [row["rating"] for row in rows] == [8.5, 7.5, 6.5, 5.3, 3.8]

    async def test_out_of_range_gap_is_clamped(
        self,
        client: AsyncClient,
        ranked_list: list[ItemModel],
        test_list: ListModel,
        auth_headers: dict,
    ) -> None:
        lowest = await client.put(
            f"/api/lists/{test_list.list_id}/ranking",
            json={"item_id": str(ranked_list[0].item_id), "gap": -5},
            headers=auth_headers,
        )
        assert lowest.status_code == 200
        assert lowest.json()[-1]["name"] == "Worst"

        highest = await client.put(
            f"/api/lists/{test_list.list_id}/ranking",
            json={"item_id": str(ranked_list[4].item_id), "gap": 99},
            headers=auth_headers,
        )
        assert highest.status_code == 200
        assert highest.json()[0]["name"] == "Best"

    async def test_replaying_the_same_request_is_stable(
        self,
        client: AsyncClient,
        ranked_list: list[ItemModel],
        test_list: ListModel,
        auth_headers: dict,
    ) -> None:
        payload = {"item_id": str(ranked_list[2].item_id), "gap": 1}
        first = await client.put(
            f"/api/lists/{test_list.list_id}/ranking",
            json=payload,
            headers=auth_headers,
        )
        second = await client.put(
            f"/api/lists/{test_list.list_id}/ranking",
            json=payload,
            headers=auth_headers,
        )
        assert first.status_code == 200
        assert second.status_code == 200
        assert ordered(first.json()) == ordered(second.json())

    async def test_item_from_another_list_is_not_found(
        self,
        client: AsyncClient,
        test_db: AsyncSession,
        test_list: ListModel,
        test_user: User,
        auth_headers: dict,
    ) -> None:
        other_list = ListModel(
            list_id=uuid.uuid4(),
            user_id=test_user.user_id,
            title="Other list",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        test_db.add(other_list)
        await test_db.commit()
        foreign_item = ranked_item(other_list.list_id, "Elsewhere", "a0", 10.0)
        test_db.add(foreign_item)
        await test_db.commit()

        response = await client.put(
            f"/api/lists/{test_list.list_id}/ranking",
            json={"item_id": str(foreign_item.item_id), "gap": 0},
            headers=auth_headers,
        )
        assert response.status_code == 404

    async def test_unknown_list_is_not_found(
        self, client: AsyncClient, test_item: ItemModel, auth_headers: dict
    ) -> None:
        response = await client.put(
            f"/api/lists/{uuid.uuid4()}/ranking",
            json={"item_id": str(test_item.item_id), "gap": 0},
            headers=auth_headers,
        )
        assert response.status_code == 404

    async def test_extra_fields_are_rejected(
        self,
        client: AsyncClient,
        ranked_list: list[ItemModel],
        test_list: ListModel,
        auth_headers: dict,
    ) -> None:
        response = await client.put(
            f"/api/lists/{test_list.list_id}/ranking",
            json={"item_id": str(ranked_list[0].item_id), "gap": 0, "extra": 1},
            headers=auth_headers,
        )
        assert response.status_code == 422

    async def test_positions_stay_unique_after_placement(
        self,
        client: AsyncClient,
        ranked_list: list[ItemModel],
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ) -> None:
        for index, item in enumerate(ranked_list):
            response = await client.put(
                f"/api/lists/{test_list.list_id}/ranking",
                json={"item_id": str(item.item_id), "gap": index},
                headers=auth_headers,
            )
            assert response.status_code == 200
        rows = await test_db.execute(
            select(ItemModel.position).where(ItemModel.list_id == test_list.list_id)
        )
        positions = list(rows.scalars())
        assert len(set(positions)) == len(positions)
        assert None not in positions

    async def test_reranking_clears_moved_item_manual_rating_and_preserves_other_pins(
        self,
        client: AsyncClient,
        ranked_list: list[ItemModel],
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ) -> None:
        ranked_list[0].manual_rating = 4.0
        ranked_list[3].manual_rating = 8.0
        await test_db.commit()

        response = await client.put(
            f"/api/lists/{test_list.list_id}/ranking",
            json={"item_id": str(ranked_list[0].item_id), "gap": 4},
            headers=auth_headers,
        )
        assert response.status_code == 200
        rows = response.json()
        by_name = {row["name"]: row for row in rows}
        assert rows[0]["name"] == "Worst"
        assert by_name["Worst"]["manual_rating"] is None
        assert by_name["Second"]["manual_rating"] == 8.0
        assert by_name["Second"]["rating"] == 8.0
