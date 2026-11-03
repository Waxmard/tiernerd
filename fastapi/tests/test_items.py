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
from app.db.models import (
    ComparisonSession as ComparisonSessionModel,
    Item as ItemModel,
    List as ListModel,
    User,
)


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
            params={"list_title": test_list.title},
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
        assert "tier_set" not in data
        assert data["position"] is not None
        assert data["rating"] == 10.0

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
        assert db_items[0].rating == 10.0

    async def test_create_second_item_starts_comparison(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        """Test creating second item starts a comparison session."""
        first = await client.post(
            "/api/items/",
            params={"list_title": test_list.title},
            json={"name": "First Item"},
            headers=auth_headers,
        )
        assert first.status_code == 200
        assert first.json()["rating"] == 10.0

        result = await test_db.execute(
            select(ItemModel).where(ItemModel.list_id == test_list.list_id)
        )
        items_before = result.scalars().all()
        assert len(items_before) == 1

        response = await client.post(
            "/api/items/",
            params={"list_title": test_list.title},
            json={
                "name": "Second Item",
                "description": "The second item",
                "image_url": "https://example.com/second.jpg",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "tier_set" not in data
        assert "session_id" in data
        assert data["status"] == "active"
        assert data["discard_on_cancel"] is True
        comparison = data["current_comparison"]
        assert "reference_item" in comparison
        assert "target_item" in comparison
        assert comparison["reference_item"]["name"] == "Second Item"
        assert comparison["reference_item"]["position"] is None
        assert comparison["reference_item"]["rating"] is None
        assert comparison["target_item"]["item_id"] == first.json()["item_id"]
        assert data["comparisons_answered"] == 0
        assert data["revision"] == 0

        # Second item is saved to database during comparison (but not yet ranked)
        result = await test_db.execute(
            select(ItemModel).where(ItemModel.list_id == test_list.list_id)
        )
        items_after = result.scalars().all()
        assert len(items_after) == 2  # Both items exist now
        candidate = next(item for item in items_after if item.name == "Second Item")
        assert candidate.position is None
        assert candidate.rating is None

    async def test_create_item_unauthenticated(
        self, client: AsyncClient, test_list: ListModel
    ):
        """Test creating item without authentication fails."""
        response = await client.post(
            "/api/items/",
            params={"list_title": test_list.title},
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
            params={"list_title": "Nonexistent List"},
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
            params={"list_title": test_list.title},
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
        victim = multiple_items[2]
        unranked = ItemModel(list_id=list_id, name="Abandoned")
        new_reference = ComparisonSessionModel(
            list_id=list_id,
            new_item_id=victim.item_id,
            target_item_id=multiple_items[0].item_id,
            status="completed",
        )
        target_reference = ComparisonSessionModel(
            list_id=list_id,
            new_item_id=multiple_items[3].item_id,
            target_item_id=victim.item_id,
        )
        unrelated = ComparisonSessionModel(
            list_id=list_id,
            new_item_id=multiple_items[0].item_id,
            target_item_id=multiple_items[1].item_id,
        )
        test_db.add_all([unranked, new_reference, target_reference, unrelated])
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
            (multiple_items[0].item_id, "a0", 0.0),
            (multiple_items[1].item_id, "a1", 3.3),
            (multiple_items[3].item_id, "a3", 6.7),
            (multiple_items[4].item_id, "a4", 10.0),
        ]
        sessions = await test_db.execute(select(ComparisonSessionModel.session_id))
        assert list(sessions.scalars()) == [unrelated.session_id]
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
        assert multiple_items[0].rating == 10.0
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

    async def test_update_item_ownership_enforced(
        self,
        client: AsyncClient,
        test_user2,
        auth_headers_user2: dict,
        test_db: AsyncSession,
    ):
        """Test that user can't update item in list they don't own."""
        user2_list = ListModel(
            list_id=uuid.uuid4(),
            user_id=test_user2.user_id,
            title="User2 List",
            description="List owned by user2",
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        test_db.add(user2_list)

        user2_item = ItemModel(
            item_id=uuid.uuid4(),
            list_id=user2_list.list_id,
            name="User2 Item",
            description="Item in user2's list",
            image_url="https://example.com/user2.jpg",
            position="a0",
            rating=10.0,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        test_db.add(user2_item)
        await test_db.commit()

        response = await client.get(
            f"/api/items/items/{user2_item.item_id}",
            headers=auth_headers_user2,
        )
        assert response.status_code == 200

        response = await client.put(
            f"/api/items/items/{user2_item.item_id}",
            json={"name": "Updated Name"},
            headers=auth_headers_user2,
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Updated Name"


class TestItemCreateValidation:
    """Tests for item creation validation."""

    async def test_create_item_without_image_url(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
    ):
        """Test creating item without optional image_url."""
        response = await client.post(
            "/api/items/",
            params={"list_title": test_list.title},
            json={
                "name": "Item Without Image",
                "description": "No image provided",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Item Without Image"
        assert data["image_url"] is None

    async def test_create_item_empty_description(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
    ):
        """Test creating item with empty description."""
        response = await client.post(
            "/api/items/",
            params={"list_title": test_list.title},
            json={
                "name": "Item With Empty Desc",
                "description": "",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["description"] == ""

    async def test_names_trim_and_casefold_across_list(
        self, client: AsyncClient, test_list: ListModel, auth_headers: dict
    ) -> None:
        first = await client.post(
            "/api/items/",
            params={"list_title": test_list.title},
            json={"name": "  Blue Bottle  "},
            headers=auth_headers,
        )
        assert first.status_code == 200
        assert first.json()["name"] == "Blue Bottle"

        duplicate = await client.post(
            "/api/items/",
            params={"list_title": test_list.title},
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
            params={"list_title": test_list.title},
            json={"name": "Straße"},
            headers=auth_headers,
        )
        assert unicode_name.status_code == 200
        unicode_duplicate = await client.post(
            "/api/items/",
            params={"list_title": test_list.title},
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
                params={"list_title": test_list.title},
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
            params={"list_title": test_list.title},
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


class TestItemComparisonSessionRoutes:
    """Item-addressable comparison-session routes stay inside item ownership."""

    async def test_lookup_rejects_unknown_and_foreign_items(
        self,
        client: AsyncClient,
        test_item: ItemModel,
        auth_headers: dict,
        auth_headers_user2: dict,
    ) -> None:
        unknown = uuid.uuid4()
        responses = (
            await client.get(
                f"/api/items/items/{unknown}/comparison-session", headers=auth_headers
            ),
            await client.post(
                f"/api/items/items/{unknown}/comparison-session",
                json={},
                headers=auth_headers,
            ),
            await client.get(
                f"/api/items/items/{test_item.item_id}/comparison-session",
                headers=auth_headers_user2,
            ),
            await client.post(
                f"/api/items/items/{test_item.item_id}/comparison-session",
                json={},
                headers=auth_headers_user2,
            ),
        )
        assert [response.status_code for response in responses] == [404, 404, 404, 404]


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
            params={"list_title": test_list.title},
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
            params={"list_title": test_list.title},
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
            params={"list_title": test_list.title},
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
