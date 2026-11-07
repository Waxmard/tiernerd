"""Tests for item endpoints."""

import uuid
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import func, insert, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.endpoints import items as items_endpoints
from app.core.constants import ITEM_NAME_ALREADY_EXISTS_ERROR
from app.crud import item as item_crud
from app.db.models import Item as ItemModel, List as ListModel, User


class TestCreateItem:
    """Tests for creating items endpoint."""

    async def test_create_first_item_success(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        """Test creating first item in an empty list."""
        response = await client.post(
            "/api/items/",
            params={"list_id": str(test_list.list_id)},
            json={
                "name": "First Item",
                "description": "The first item",
                "image_url": "https://example.com/first.jpg",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "First Item"
        assert data["description"] == "The first item"
        assert "item_id" in data
        assert data["position"] is not None
        assert data["rating"] == 6.5
        assert data["manual_rating"] is None

        result = await test_db.execute(
            select(ItemModel).where(ItemModel.list_id == test_list.list_id)
        )
        db_items = result.scalars().all()
        assert len(db_items) == 1
        assert db_items[0].name == "First Item"
        assert db_items[0].description == "The first item"
        assert db_items[0].list_id == test_list.list_id
        assert str(db_items[0].item_id) == data["item_id"]
        assert db_items[0].position == data["position"]
        assert db_items[0].rating == 6.5
        assert db_items[0].manual_rating is None

    async def test_create_second_item_is_unranked(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        """Test creating a second item leaves it unranked for the client to place."""
        first = await client.post(
            "/api/items/",
            params={"list_id": str(test_list.list_id)},
            json={"name": "First Item"},
            headers=auth_headers,
        )
        assert first.status_code == 200
        assert first.json()["rating"] == 6.5

        response = await client.post(
            "/api/items/",
            params={"list_id": str(test_list.list_id)},
            json={
                "name": "Second Item",
                "description": "The second item",
                "image_url": "https://example.com/second.jpg",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Second Item"
        assert data["position"] is None
        assert data["rating"] is None

        result = await test_db.execute(
            select(ItemModel).where(ItemModel.list_id == test_list.list_id)
        )
        items_after = result.scalars().all()
        assert len(items_after) == 2
        candidate = next(item for item in items_after if item.name == "Second Item")
        assert candidate.position is None
        assert candidate.rating is None

    async def test_create_item_unauthenticated(
        self, client: AsyncClient, test_list: ListModel
    ):
        """Test creating item without authentication fails."""
        response = await client.post(
            "/api/items/",
            params={"list_id": str(test_list.list_id)},
            json={
                "name": "New Item",
                "description": "Description",
                "image_url": "https://example.com/image.jpg",
            },
        )
        assert response.status_code == 401

    async def test_create_item_list_not_found(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test creating item in non-existent list fails."""
        response = await client.post(
            "/api/items/",
            params={"list_id": str(uuid.uuid4())},
            json={
                "name": "New Item",
                "description": "Description",
                "image_url": "https://example.com/image.jpg",
            },
            headers=auth_headers,
        )
        assert response.status_code == 404

    async def test_create_item_wrong_user_list(
        self, client: AsyncClient, test_list: ListModel, auth_headers_user2: dict
    ):
        """Test creating item in another user's list fails."""
        response = await client.post(
            "/api/items/",
            params={"list_id": str(test_list.list_id)},
            json={
                "name": "New Item",
                "description": "Description",
                "image_url": "https://example.com/image.jpg",
            },
            headers=auth_headers_user2,
        )
        assert response.status_code == 404


class TestReadItem:
    """Tests for reading a specific item endpoint."""

    async def test_read_item_success(
        self,
        client: AsyncClient,
        test_item: ItemModel,
        auth_headers: dict,
    ):
        response = await client.get(
            f"/api/items/items/{test_item.item_id}", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert str(data["item_id"]) == str(test_item.item_id)
        assert data["name"] == test_item.name
        assert data["description"] == test_item.description

    async def test_read_item_unauthenticated(
        self, client: AsyncClient, test_item: ItemModel
    ):
        """Test reading item without authentication fails."""
        response = await client.get(f"/api/items/items/{test_item.item_id}")
        assert response.status_code == 401

    async def test_read_item_not_found(self, client: AsyncClient, auth_headers: dict):
        """Test reading non-existent item fails."""
        import uuid

        fake_id = uuid.uuid4()
        response = await client.get(f"/api/items/items/{fake_id}", headers=auth_headers)
        assert response.status_code == 404

    async def test_read_item_wrong_user(
        self, client: AsyncClient, test_item: ItemModel, auth_headers_user2: dict
    ):
        """Test reading another user's item fails."""
        response = await client.get(
            f"/api/items/items/{test_item.item_id}", headers=auth_headers_user2
        )
        assert response.status_code == 404


class TestUpdateItem:
    """Tests for updating items endpoint."""

    async def test_update_item_success(
        self,
        client: AsyncClient,
        test_item: ItemModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        original_name = test_item.name
        original_description = test_item.description

        response = await client.put(
            f"/api/items/items/{test_item.item_id}",
            json={
                "name": "Updated Name",
                "description": "Updated description",
                "image_url": "https://example.com/updated.jpg",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Updated Name"
        assert data["description"] == "Updated description"
        assert data["image_url"] == "https://example.com/updated.jpg"

        await test_db.refresh(test_item)
        assert test_item.name == "Updated Name"
        assert test_item.description == "Updated description"
        assert test_item.image_url == "https://example.com/updated.jpg"
        assert test_item.name != original_name
        assert test_item.description != original_description

    async def test_update_item_partial(
        self, client: AsyncClient, test_item: ItemModel, auth_headers: dict
    ):
        """Test partial item update (only name)."""
        response = await client.put(
            f"/api/items/items/{test_item.item_id}",
            json={
                "name": "New Name Only",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "New Name Only"

    async def test_update_item_unauthenticated(
        self, client: AsyncClient, test_item: ItemModel
    ):
        """Test updating item without authentication fails."""
        response = await client.put(
            f"/api/items/items/{test_item.item_id}",
            json={
                "name": "Updated Name",
            },
        )
        assert response.status_code == 401

    async def test_update_item_not_found(self, client: AsyncClient, auth_headers: dict):
        """Test updating non-existent item fails."""
        import uuid

        fake_id = uuid.uuid4()
        response = await client.put(
            f"/api/items/items/{fake_id}",
            json={
                "name": "Updated Name",
            },
            headers=auth_headers,
        )
        assert response.status_code == 404

    async def test_update_item_wrong_user(
        self, client: AsyncClient, test_item: ItemModel, auth_headers_user2: dict
    ):
        """Test updating another user's item fails."""
        response = await client.put(
            f"/api/items/items/{test_item.item_id}",
            json={
                "name": "Trying to update",
            },
            headers=auth_headers_user2,
        )
        assert response.status_code == 404

    async def test_item_update_changes_list_recency_only_on_success(
        self,
        client: AsyncClient,
        test_db: AsyncSession,
        test_list: ListModel,
        test_item: ItemModel,
        test_user2: User,
        auth_headers: dict,
        auth_headers_user2: dict,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        test_list.updated_at = datetime(2020, 1, 1, tzinfo=UTC)
        newer_list = ListModel(
            list_id=uuid.uuid4(),
            user_id=test_list.user_id,
            title="Newer list",
            created_at=datetime(2021, 1, 1, tzinfo=UTC),
            updated_at=datetime(2021, 1, 1, tzinfo=UTC),
        )
        foreign_list = ListModel(
            list_id=uuid.uuid4(),
            user_id=test_user2.user_id,
            title="Another owner's list",
            created_at=datetime(2022, 1, 1, tzinfo=UTC),
            updated_at=datetime(2022, 1, 1, tzinfo=UTC),
        )
        duplicate_item = ItemModel(
            item_id=uuid.uuid4(),
            list_id=test_list.list_id,
            name="Other",
        )
        test_db.add_all([newer_list, foreign_list, duplicate_item])
        await test_db.commit()
        await test_db.refresh(test_list)
        await test_db.refresh(newer_list)
        original_updated_at = test_list.updated_at
        newer_updated_at = newer_list.updated_at
        old_id = str(test_list.list_id)
        new_id = str(newer_list.list_id)
        item_url = f"/api/items/items/{test_item.item_id}"

        initial = await client.get("/api/lists/", headers=auth_headers)
        assert initial.status_code == 200
        assert [row["list_id"] for row in initial.json()] == [new_id, old_id]

        empty = await client.put(item_url, json={}, headers=auth_headers)
        assert empty.status_code == 200
        await test_db.refresh(test_list)
        assert test_list.updated_at == original_updated_at

        duplicate = await client.put(
            item_url, json={"name": " other "}, headers=auth_headers
        )
        assert duplicate.status_code == 409
        await test_db.refresh(test_list)
        assert test_list.updated_at == original_updated_at

        unauthorized = await client.put(
            item_url, json={"name": "Forbidden"}, headers=auth_headers_user2
        )
        assert unauthorized.status_code == 404
        await test_db.refresh(test_list)
        assert test_list.updated_at == original_updated_at

        async def no_match(db, list_id, name_key, exclude_id=None):
            return None

        with monkeypatch.context() as patch:
            patch.setattr(item_crud, "get_by_name_key", no_match)
            conflict = await client.put(
                item_url, json={"name": "OTHER"}, headers=auth_headers
            )
        assert conflict.status_code == 409
        await test_db.refresh(test_list)
        assert test_list.updated_at == original_updated_at

        updated = await client.put(
            item_url, json={"name": "Edited"}, headers=auth_headers
        )
        assert updated.status_code == 200
        assert updated.json()["name"] == "Edited"
        await test_db.refresh(test_list)
        assert test_list.updated_at > original_updated_at
        assert test_list.updated_at > newer_updated_at

        ordered = await client.get("/api/lists/", headers=auth_headers)
        assert ordered.status_code == 200
        assert [row["list_id"] for row in ordered.json()] == [old_id, new_id]

    async def test_manual_rating_rescales_neighbors_resets_and_validates_bounds(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
    ) -> None:
        created = []
        names = ["Spot A", "Spot B", "Spot C", "Spot D", "Spot E"]
        for index, name in enumerate(names):
            res = await client.post(
                "/api/items/",
                params={"list_id": str(test_list.list_id)},
                json={"name": name},
                headers=auth_headers,
            )
            assert res.status_code == 200
            item = res.json()
            if index > 0:
                rank_res = await client.put(
                    f"/api/lists/{test_list.list_id}/ranking",
                    json={"item_id": item["item_id"], "gap": 0},
                    headers=auth_headers,
                )
                assert rank_res.status_code == 200
            created.append(item)

        unranked_res = await client.post(
            "/api/items/",
            params={"list_id": str(test_list.list_id)},
            json={"name": "Unranked Spot"},
            headers=auth_headers,
        )
        assert unranked_res.status_code == 200
        unranked_id = unranked_res.json()["item_id"]

        unranked_pin = await client.put(
            f"/api/items/items/{unranked_id}",
            json={"manual_rating": 7.0},
            headers=auth_headers,
        )
        assert unranked_pin.status_code == 422
        assert (
            unranked_pin.json()["detail"]
            == "Rank this item before setting a manual score."
        )

        unranked_noop = await client.put(
            f"/api/items/items/{unranked_id}",
            json={"manual_rating": None},
            headers=auth_headers,
        )
        assert unranked_noop.status_code == 200

        pin_e = await client.put(
            f"/api/items/items/{created[4]['item_id']}",
            json={"manual_rating": 7.2},
            headers=auth_headers,
        )
        assert pin_e.status_code == 200
        list_items = (
            await client.get(
                f"/api/lists/{test_list.list_id}/items", headers=auth_headers
            )
        ).json()
        ranked_rows = [row for row in list_items if row["position"] is not None]
        assert [
            (row["name"], row["rating"], row["manual_rating"]) for row in ranked_rows
        ] == [
            ("Spot A", 9.1, None),
            ("Spot B", 8.6, None),
            ("Spot C", 8.1, None),
            ("Spot D", 7.7, None),
            ("Spot E", 7.2, 7.2),
        ]

        low_err = await client.put(
            f"/api/items/items/{created[3]['item_id']}",
            json={"manual_rating": 6.0},
            headers=auth_headers,
        )
        assert low_err.status_code == 422
        assert low_err.json()["detail"] == (
            "Score must be 7.2 or higher "
            "(Spot E is pinned below it), or re-rank this item."
        )

        pin_b = await client.put(
            f"/api/items/items/{created[1]['item_id']}",
            json={"manual_rating": 8.0},
            headers=auth_headers,
        )
        assert pin_b.status_code == 200

        high_err = await client.put(
            f"/api/items/items/{created[0]['item_id']}",
            json={"manual_rating": 7.5},
            headers=auth_headers,
        )
        assert high_err.status_code == 422
        assert high_err.json()["detail"] == (
            "Score must be 8.0 or higher "
            "(Spot B is pinned below it), or re-rank this item."
        )

        both_err = await client.put(
            f"/api/items/items/{created[3]['item_id']}",
            json={"manual_rating": 8.5},
            headers=auth_headers,
        )
        assert both_err.status_code == 422
        assert both_err.json()["detail"] == (
            "Score must be between 7.2 (Spot E) and 8.0 (Spot B), or re-rank this item."
        )

        reset_e = await client.put(
            f"/api/items/items/{created[4]['item_id']}",
            json={"manual_rating": None},
            headers=auth_headers,
        )
        assert reset_e.status_code == 200

        upper_only_err = await client.put(
            f"/api/items/items/{created[3]['item_id']}",
            json={"manual_rating": 8.5},
            headers=auth_headers,
        )
        assert upper_only_err.status_code == 422
        assert upper_only_err.json()["detail"] == (
            "Score must be 8.0 or lower "
            "(Spot B is pinned above it), or re-rank this item."
        )

        reset_b = await client.put(
            f"/api/items/items/{created[1]['item_id']}",
            json={"manual_rating": None},
            headers=auth_headers,
        )
        assert reset_b.status_code == 200
        restored = (
            await client.get(
                f"/api/lists/{test_list.list_id}/items", headers=auth_headers
            )
        ).json()
        assert [row["rating"] for row in restored if row["position"] is not None] == [
            8.5,
            7.5,
            6.5,
            5.3,
            3.8,
        ]


class TestDeleteItem:
    """Tests for deleting items endpoint."""

    async def test_delete_item_success(
        self,
        client: AsyncClient,
        test_item: ItemModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        item_id = test_item.item_id
        list_id = test_item.list_id

        result = await test_db.execute(
            select(ItemModel).where(ItemModel.item_id == item_id)
        )
        assert result.scalar_one_or_none() is not None

        result = await test_db.execute(
            select(ItemModel).where(ItemModel.list_id == list_id)
        )
        items_before = len(result.scalars().all())

        response = await client.delete(
            f"/api/items/items/{item_id}", headers=auth_headers
        )
        assert response.status_code == 204

        result = await test_db.execute(
            select(ItemModel).where(ItemModel.item_id == item_id)
        )
        assert result.scalar_one_or_none() is None

        result = await test_db.execute(
            select(ItemModel).where(ItemModel.list_id == list_id)
        )
        items_after = len(result.scalars().all())
        assert items_after == items_before - 1

        response = await client.get(f"/api/items/items/{item_id}", headers=auth_headers)
        assert response.status_code == 404

    async def test_delete_ranked_item_rescores_list(
        self,
        client: AsyncClient,
        multiple_items: list[ItemModel],
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        list_id = multiple_items[0].list_id
        unranked = ItemModel(list_id=list_id, name="Abandoned")
        test_db.add(unranked)
        await test_db.commit()
        response = await client.delete(
            f"/api/items/items/{multiple_items[2].item_id}", headers=auth_headers
        )
        assert response.status_code == 204

        result = await test_db.execute(
            select(ItemModel.item_id, ItemModel.position, ItemModel.rating)
            .where(ItemModel.list_id == list_id, ItemModel.position.isnot(None))
            .order_by(ItemModel.position)
        )
        assert list(result.all()) == [
            (multiple_items[0].item_id, "a0", 4.1),
            (multiple_items[1].item_id, "a1", 5.8),
            (multiple_items[3].item_id, "a3", 7.1),
            (multiple_items[4].item_id, "a4", 8.3),
        ]
        await test_db.refresh(unranked)
        assert unranked.rating is None
        assert unranked.position is None

        for item in (multiple_items[1], multiple_items[3], multiple_items[4]):
            response = await client.delete(
                f"/api/items/items/{item.item_id}", headers=auth_headers
            )
            assert response.status_code == 204
        await test_db.refresh(multiple_items[0])
        await test_db.refresh(unranked)
        assert multiple_items[0].position == "a0"
        assert multiple_items[0].rating == 6.5
        assert unranked.position is None
        assert unranked.rating is None

    async def test_delete_item_unauthenticated(
        self, client: AsyncClient, test_item: ItemModel
    ):
        """Test deleting item without authentication fails."""
        response = await client.delete(f"/api/items/items/{test_item.item_id}")
        assert response.status_code == 401

    async def test_delete_item_not_found(self, client: AsyncClient, auth_headers: dict):
        """Test deleting non-existent item fails."""
        import uuid

        fake_id = uuid.uuid4()
        response = await client.delete(
            f"/api/items/items/{fake_id}", headers=auth_headers
        )
        assert response.status_code == 404

    async def test_delete_item_wrong_user(
        self, client: AsyncClient, test_item: ItemModel, auth_headers_user2: dict
    ):
        """Test deleting another user's item fails."""
        response = await client.delete(
            f"/api/items/items/{test_item.item_id}", headers=auth_headers_user2
        )
        assert response.status_code == 404


class TestItemOwnership:
    """Tests for item ownership verification edge cases."""

    async def test_read_item_from_deleted_list(
        self,
        client: AsyncClient,
        test_item: ItemModel,
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        """Test reading item after its list is deleted."""
        item_id = test_item.item_id

        await test_db.delete(test_list)
        await test_db.commit()

        response = await client.get(f"/api/items/items/{item_id}", headers=auth_headers)
        # Item should be gone (cascade delete) or ownership check fails
        assert response.status_code == 404


class TestItemCreateValidation:
    """Tests for item creation validation."""

    async def test_names_trim_and_casefold_across_list(
        self, client: AsyncClient, test_list: ListModel, auth_headers: dict
    ) -> None:
        first = await client.post(
            "/api/items/",
            params={"list_id": str(test_list.list_id)},
            json={"name": "  Blue Bottle  "},
            headers=auth_headers,
        )
        assert first.status_code == 200
        assert first.json()["name"] == "Blue Bottle"

        duplicate = await client.post(
            "/api/items/",
            params={"list_id": str(test_list.list_id)},
            json={"name": "blue bottle"},
            headers=auth_headers,
        )
        assert duplicate.status_code == 409
        assert (
            duplicate.json()["detail"]
            == "An item with this name already exists in this list."
        )

        unicode_name = await client.post(
            "/api/items/",
            params={"list_id": str(test_list.list_id)},
            json={"name": "Straße"},
            headers=auth_headers,
        )
        assert unicode_name.status_code == 200
        unicode_duplicate = await client.post(
            "/api/items/",
            params={"list_id": str(test_list.list_id)},
            json={"name": "STRASSE"},
            headers=auth_headers,
        )
        assert unicode_duplicate.status_code == 409

    async def test_name_validation_rejects_blank_and_overlength(
        self, client: AsyncClient, test_list: ListModel, auth_headers: dict
    ) -> None:
        for name in ("   ", "x" * 101):
            response = await client.post(
                "/api/items/",
                params={"list_id": str(test_list.list_id)},
                json={"name": name},
                headers=auth_headers,
            )
            assert response.status_code == 422

    async def test_self_rename_and_duplicate_rename(
        self,
        client: AsyncClient,
        test_list: ListModel,
        test_item: ItemModel,
        auth_headers: dict,
    ) -> None:
        created = await client.post(
            "/api/items/",
            params={"list_id": str(test_list.list_id)},
            json={"name": "Other"},
            headers=auth_headers,
        )
        assert created.status_code == 200
        duplicate = await client.put(
            f"/api/items/items/{test_item.item_id}",
            json={"name": " Other "},
            headers=auth_headers,
        )
        assert duplicate.status_code == 409
        self_rename = await client.put(
            f"/api/items/items/{test_item.item_id}",
            json={"name": "  test item  "},
            headers=auth_headers,
        )
        assert self_rename.status_code == 200
        assert self_rename.json()["name"] == "test item"

    async def test_update_name_rejects_blank_and_null(
        self,
        client: AsyncClient,
        test_item: ItemModel,
        auth_headers: dict,
    ) -> None:
        for name in ("   ", None):
            response = await client.put(
                f"/api/items/items/{test_item.item_id}",
                json={"name": name},
                headers=auth_headers,
            )
            assert response.status_code == 422


class TestDuplicateNameRace:
    """Name conflicts enforced by the database when the pre-check misses."""

    @staticmethod
    def bypass_precheck(monkeypatch: pytest.MonkeyPatch) -> None:
        """Pretend the pre-check found nothing, as a concurrent insert would."""

        async def no_match(db, list_id, name_key, exclude_id=None):
            return None

        monkeypatch.setattr(item_crud, "get_by_name_key", no_match)

    async def test_create_without_ranked_items_reports_database_conflict(
        self,
        client: AsyncClient,
        test_list: ListModel,
        test_item: ItemModel,
        auth_headers: dict,
        test_db: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        test_item.position = None
        test_item.rating = None
        await test_db.commit()
        self.bypass_precheck(monkeypatch)
        response = await client.post(
            "/api/items/",
            params={"list_id": str(test_list.list_id)},
            json={"name": "test item"},
            headers=auth_headers,
        )
        assert response.status_code == 409
        assert response.json()["detail"] == ITEM_NAME_ALREADY_EXISTS_ERROR

    async def test_create_with_ranked_items_reports_database_conflict(
        self,
        client: AsyncClient,
        test_list: ListModel,
        test_item: ItemModel,
        auth_headers: dict,
        test_db: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        self.bypass_precheck(monkeypatch)
        list_id = test_list.list_id
        response = await client.post(
            "/api/items/",
            params={"list_id": str(test_list.list_id)},
            json={"name": "  TEST ITEM  "},
            headers=auth_headers,
        )
        assert response.status_code == 409
        assert response.json()["detail"] == ITEM_NAME_ALREADY_EXISTS_ERROR
        stored = await test_db.scalar(
            select(func.count())
            .select_from(ItemModel)
            .where(ItemModel.list_id == list_id)
        )
        assert stored == 1

    async def test_update_reports_database_conflict(
        self,
        client: AsyncClient,
        test_list: ListModel,
        test_item: ItemModel,
        auth_headers: dict,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        created = await client.post(
            "/api/items/",
            params={"list_id": str(test_list.list_id)},
            json={"name": "Other"},
            headers=auth_headers,
        )
        assert created.status_code == 200

        self.bypass_precheck(monkeypatch)
        response = await client.put(
            f"/api/items/items/{test_item.item_id}",
            json={"name": "other"},
            headers=auth_headers,
        )
        assert response.status_code == 409
        assert response.json()["detail"] == ITEM_NAME_ALREADY_EXISTS_ERROR

    async def test_unrelated_integrity_error_is_reraised(
        self,
        test_db: AsyncSession,
        test_item: ItemModel,
    ) -> None:
        item_id = test_item.item_id
        list_id = test_item.list_id
        statement = insert(ItemModel).values(
            item_id=item_id,
            list_id=list_id,
            name="Clashing primary key",
            name_key="clashing primary key",
        )
        with pytest.raises(IntegrityError) as caught:
            await test_db.execute(statement)
        await test_db.rollback()
        assert not item_crud.is_duplicate_name_error(caught.value)
        with pytest.raises(IntegrityError):
            await items_endpoints._raise_item_name_error(test_db, caught.value)


class TestClientSuppliedItemId:
    """Creates are idempotent for a client-generated item id."""

    async def test_create_uses_supplied_id_and_retry_returns_same_item(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ) -> None:
        item_id = uuid.uuid4()
        payload = {"item_id": str(item_id), "name": "Offline item"}
        first = await client.post(
            "/api/items/",
            params={"list_id": str(test_list.list_id)},
            json=payload,
            headers=auth_headers,
        )
        assert first.status_code == 200
        assert first.json()["item_id"] == str(item_id)

        retry = await client.post(
            "/api/items/",
            params={"list_id": str(test_list.list_id)},
            json=payload,
            headers=auth_headers,
        )
        assert retry.status_code == 200
        assert retry.json() == first.json()
        stored = await test_db.scalar(
            select(func.count())
            .select_from(ItemModel)
            .where(ItemModel.list_id == test_list.list_id)
        )
        assert stored == 1

    async def test_item_id_reuse_across_lists_is_rejected(
        self,
        client: AsyncClient,
        test_db: AsyncSession,
        test_list: ListModel,
        test_user: User,
        auth_headers: dict,
    ) -> None:
        item_id = uuid.uuid4()
        first = await client.post(
            "/api/items/",
            params={"list_id": str(test_list.list_id)},
            json={"item_id": str(item_id), "name": "First list item"},
            headers=auth_headers,
        )
        assert first.status_code == 200

        other_list = ListModel(
            list_id=uuid.uuid4(),
            user_id=test_user.user_id,
            title="Another list",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        test_db.add(other_list)
        await test_db.commit()

        conflict = await client.post(
            "/api/items/",
            params={"list_id": str(other_list.list_id)},
            json={"item_id": str(item_id), "name": "Second list item"},
            headers=auth_headers,
        )
        assert conflict.status_code == 409
        assert conflict.json()["detail"] == "Item ID already in use"
