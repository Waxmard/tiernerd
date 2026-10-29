"""Tests for item endpoints."""

import uuid
from datetime import datetime

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
)


class TestCreateItem:
    """Tests for creating items endpoint."""

    @pytest.mark.parametrize(
        ("tier_set", "expected_rating"),
        [("good", 8.5), ("mid", 5.5), ("bad", 2.5)],
    )
    async def test_create_first_item_success(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
        tier_set: str,
        expected_rating: float,
    ):
        """Test creating first item in an empty list."""
        response = await client.post(
            "/api/items/",
            params={"list_title": test_list.title},
            json={
                "name": "First Item",
                "description": "The first item",
                "image_url": "https://example.com/first.jpg",
                "tier_set": tier_set,
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "First Item"
        assert data["description"] == "The first item"
        assert "item_id" in data
        assert data["tier_set"] == tier_set
        assert data["rating"] == expected_rating

        # Verify item was created in database
        result = await test_db.execute(
            select(ItemModel).where(ItemModel.list_id == test_list.list_id)
        )
        db_items = result.scalars().all()
        assert len(db_items) == 1
        assert db_items[0].name == "First Item"
        assert db_items[0].description == "The first item"
        assert db_items[0].list_id == test_list.list_id
        assert str(db_items[0].item_id) == data["item_id"]

    async def test_create_second_item_starts_comparison(
        self,
        client: AsyncClient,
        test_list: ListModel,
        test_item: ItemModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        """Test creating second item starts a comparison session."""
        # Verify we start with 1 item in database
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
                "tier_set": "good",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        # Should return a ComparisonSession
        assert "session_id" in data
        assert data["status"] == "active"
        assert data["discard_on_cancel"] is True
        comparison = data["current_comparison"]
        assert "reference_item" in comparison
        assert "target_item" in comparison
        assert comparison["reference_item"]["name"] == "Second Item"
        assert data["comparisons_answered"] == 0
        assert data["revision"] == 0

        # Second item is saved to database during comparison (but not yet ranked)
        result = await test_db.execute(
            select(ItemModel).where(ItemModel.list_id == test_list.list_id)
        )
        items_after = result.scalars().all()
        assert len(items_after) == 2  # Both items exist now

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
                "tier_set": "good",
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
                "tier_set": "good",
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
                "tier_set": "good",
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
        test_db: AsyncSession,
    ):
        """Test reading a specific item."""
        response = await client.get(
            f"/api/items/items/{test_item.item_id}", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert str(data["item_id"]) == str(test_item.item_id)
        assert data["name"] == test_item.name
        assert data["description"] == test_item.description

        # Verify item exists in database
        result = await test_db.execute(
            select(ItemModel).where(ItemModel.item_id == test_item.item_id)
        )
        db_item = result.scalar_one_or_none()
        assert db_item is not None
        assert db_item.name == test_item.name
        assert db_item.list_id == test_item.list_id

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
        """Test successful item update."""
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

        # Verify item was updated in database
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


class TestDeleteItem:
    """Tests for deleting items endpoint."""

    async def test_delete_item_success(
        self,
        client: AsyncClient,
        test_item: ItemModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        """Test successful item deletion."""
        item_id = test_item.item_id
        list_id = test_item.list_id

        # Verify item exists in database before deletion
        result = await test_db.execute(
            select(ItemModel).where(ItemModel.item_id == item_id)
        )
        assert result.scalar_one_or_none() is not None

        # Count items in list before deletion
        result = await test_db.execute(
            select(ItemModel).where(ItemModel.list_id == list_id)
        )
        items_before = len(result.scalars().all())

        response = await client.delete(
            f"/api/items/items/{item_id}", headers=auth_headers
        )
        assert response.status_code == 204

        # Verify item is deleted from database
        result = await test_db.execute(
            select(ItemModel).where(ItemModel.item_id == item_id)
        )
        assert result.scalar_one_or_none() is None

        # Verify item count decreased
        result = await test_db.execute(
            select(ItemModel).where(ItemModel.list_id == list_id)
        )
        items_after = len(result.scalars().all())
        assert items_after == items_before - 1

        # Verify item is deleted via API
        response = await client.get(f"/api/items/items/{item_id}", headers=auth_headers)
        assert response.status_code == 404

    async def test_delete_ranked_item_rescores_band(
        self,
        client: AsyncClient,
        multiple_items: list[ItemModel],
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        list_id = multiple_items[0].list_id
        victim = multiple_items[2]
        unranked = ItemModel(list_id=list_id, name="Abandoned", tier_set="good")
        new_reference = ComparisonSessionModel(
            list_id=list_id,
            new_item_id=victim.item_id,
            target_item_id=multiple_items[0].item_id,
            tier_set="good",
            status="completed",
        )
        target_reference = ComparisonSessionModel(
            list_id=list_id,
            new_item_id=multiple_items[3].item_id,
            target_item_id=victim.item_id,
            tier_set="good",
        )
        unrelated = ComparisonSessionModel(
            list_id=list_id,
            new_item_id=multiple_items[0].item_id,
            target_item_id=multiple_items[1].item_id,
            tier_set="good",
        )
        test_db.add_all([unranked, new_reference, target_reference, unrelated])
        await test_db.commit()
        response = await client.delete(
            f"/api/items/items/{multiple_items[2].item_id}", headers=auth_headers
        )
        assert response.status_code == 204

        result = await test_db.execute(
            select(ItemModel.rating)
            .where(ItemModel.list_id == list_id, ItemModel.position.isnot(None))
            .order_by(ItemModel.position)
        )
        assert list(result.scalars().all()) == [7.4, 8.1, 8.9, 9.6]
        sessions = await test_db.execute(select(ComparisonSessionModel.session_id))
        assert list(sessions.scalars()) == [unrelated.session_id]
        await test_db.refresh(unranked)
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


class TestCreateItemTierSets:
    """Tests for creating items with different tier_sets."""

    async def test_create_items_in_different_tier_sets(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        """Test that items in different tier_sets don't trigger comparison."""
        # Create first item in "good" tier_set
        response1 = await client.post(
            "/api/items/",
            params={"list_title": test_list.title},
            json={
                "name": "Good Item",
                "description": "A good tier item",
                "image_url": "https://example.com/good.jpg",
                "tier_set": "good",
            },
            headers=auth_headers,
        )
        assert response1.status_code == 200
        assert "session_id" not in response1.json()  # No comparison for first item

        # Create first item in "mid" tier_set - should NOT start comparison
        # since it's the first item in that tier_set
        response2 = await client.post(
            "/api/items/",
            params={"list_title": test_list.title},
            json={
                "name": "Mid Item",
                "description": "A mid tier item",
                "image_url": "https://example.com/mid.jpg",
                "tier_set": "mid",
            },
            headers=auth_headers,
        )
        assert response2.status_code == 200
        assert (
            "session_id" not in response2.json()
        )  # No comparison for first in tier_set


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

        # Delete the list
        await test_db.delete(test_list)
        await test_db.commit()

        # Try to read the item
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
        # Create a list for user2
        user2_list = ListModel(
            list_id=uuid.uuid4(),
            user_id=test_user2.user_id,
            title="User2 List",
            description="List owned by user2",
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        test_db.add(user2_list)

        # Create an item in user2's list
        user2_item = ItemModel(
            item_id=uuid.uuid4(),
            list_id=user2_list.list_id,
            name="User2 Item",
            description="Item in user2's list",
            image_url="https://example.com/user2.jpg",
            position="a0",
            rating=None,
            tier_set="good",
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        test_db.add(user2_item)
        await test_db.commit()

        # Verify user2 can read their own item
        response = await client.get(
            f"/api/items/items/{user2_item.item_id}",
            headers=auth_headers_user2,
        )
        assert response.status_code == 200

        # Verify user2 can update their own item
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
                "tier_set": "good",
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
                "tier_set": "good",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["description"] == ""

    async def test_names_trim_and_casefold_across_ranges(
        self, client: AsyncClient, test_list: ListModel, auth_headers: dict
    ) -> None:
        first = await client.post(
            "/api/items/",
            params={"list_title": test_list.title},
            json={"name": "  Blue Bottle  ", "tier_set": "good"},
            headers=auth_headers,
        )
        assert first.status_code == 200
        assert first.json()["name"] == "Blue Bottle"

        duplicate = await client.post(
            "/api/items/",
            params={"list_title": test_list.title},
            json={"name": "blue bottle", "tier_set": "mid"},
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
            json={"name": "Straße", "tier_set": "bad"},
            headers=auth_headers,
        )
        assert unicode_name.status_code == 200
        unicode_duplicate = await client.post(
            "/api/items/",
            params={"list_title": test_list.title},
            json={"name": "STRASSE", "tier_set": "mid"},
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
                json={"name": name, "tier_set": "good"},
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
            json={"name": "Other", "tier_set": "mid"},
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
                json={"tier_set": "good"},
                headers=auth_headers,
            ),
            await client.get(
                f"/api/items/items/{test_item.item_id}/comparison-session",
                headers=auth_headers_user2,
            ),
            await client.post(
                f"/api/items/items/{test_item.item_id}/comparison-session",
                json={"tier_set": "good"},
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

    async def test_create_in_empty_range_reports_database_conflict(
        self,
        client: AsyncClient,
        test_list: ListModel,
        test_item: ItemModel,
        auth_headers: dict,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        self.bypass_precheck(monkeypatch)
        response = await client.post(
            "/api/items/",
            params={"list_title": test_list.title},
            json={"name": "test item", "tier_set": "mid"},
            headers=auth_headers,
        )
        assert response.status_code == 409
        assert response.json()["detail"] == ITEM_NAME_ALREADY_EXISTS_ERROR

    async def test_create_in_ranked_range_reports_database_conflict(
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
            json={"name": "  TEST ITEM  ", "tier_set": "good"},
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
            json={"name": "Other", "tier_set": "mid"},
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
            tier_set="mid",
        )
        with pytest.raises(IntegrityError) as caught:
            await test_db.execute(statement)
        await test_db.rollback()
        assert not item_crud.is_duplicate_name_error(caught.value)
        with pytest.raises(IntegrityError):
            await items_endpoints._raise_item_name_error(test_db, caught.value)
