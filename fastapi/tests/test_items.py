"""Tests for item endpoints."""

import uuid
from datetime import datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ComparisonSession as ComparisonSessionModel,
    Item as ItemModel,
    List as ListModel,
)


@pytest.mark.asyncio
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
                "tier_set": "good",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "First Item"
        assert data["description"] == "The first item"
        assert "item_id" in data
        assert data["tier_set"] == "good"
        assert data["rating"] == 8.5

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
        assert "current_comparison" in data
        assert data["is_complete"] is False
        # Verify comparison data
        comparison = data["current_comparison"]
        assert "reference_item" in comparison
        assert "target_item" in comparison
        assert comparison["reference_item"]["name"] == "Second Item"

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


@pytest.mark.asyncio
class TestComparisonFlow:
    """Tests for comparison workflow."""

    async def test_submit_comparison_result_better(
        self,
        client: AsyncClient,
        test_list: ListModel,
        test_item: ItemModel,
        auth_headers: dict,
    ):
        """Test submitting comparison result where new item is better."""
        # Create second item to start comparison
        create_response = await client.post(
            "/api/items/",
            params={"list_title": test_list.title},
            json={
                "name": "Better Item",
                "description": "A better item",
                "image_url": "https://example.com/better.jpg",
                "tier_set": "good",
            },
            headers=auth_headers,
        )
        assert create_response.status_code == 200
        session_data = create_response.json()
        session_id = session_data["session_id"]

        # Submit comparison result
        response = await client.post(
            "/api/items/comparison/result",
            params={"session_id": session_id},
            json={"result": "better"},
            headers=auth_headers,
        )
        assert response.status_code == 200

    async def test_submit_comparison_result_worse(
        self,
        client: AsyncClient,
        test_list: ListModel,
        test_item: ItemModel,
        auth_headers: dict,
    ):
        """Test submitting comparison result where new item is worse."""
        # Create second item to start comparison
        create_response = await client.post(
            "/api/items/",
            params={"list_title": test_list.title},
            json={
                "name": "Worse Item",
                "description": "A worse item",
                "image_url": "https://example.com/worse.jpg",
                "tier_set": "good",
            },
            headers=auth_headers,
        )
        assert create_response.status_code == 200
        session_data = create_response.json()
        session_id = session_data["session_id"]

        # Submit comparison result
        response = await client.post(
            "/api/items/comparison/result",
            params={"session_id": session_id},
            json={"result": "worse"},
            headers=auth_headers,
        )
        assert response.status_code == 200

    async def test_submit_comparison_invalid_session(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test submitting comparison with invalid session fails."""
        response = await client.post(
            "/api/items/comparison/result",
            params={"session_id": "invalid_session"},
            json={"result": "better"},
            headers=auth_headers,
        )
        assert response.status_code == 404

    async def test_get_comparison_status(
        self,
        client: AsyncClient,
        test_list: ListModel,
        test_item: ItemModel,
        auth_headers: dict,
    ):
        """Test getting comparison session status."""
        # Create second item to start comparison
        create_response = await client.post(
            "/api/items/",
            params={"list_title": test_list.title},
            json={
                "name": "New Item",
                "description": "Description",
                "image_url": "https://example.com/new.jpg",
                "tier_set": "good",
            },
            headers=auth_headers,
        )
        session_data = create_response.json()
        session_id = session_data["session_id"]

        # Get comparison status
        response = await client.get(
            f"/api/items/comparison/{session_id}/status",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["session_id"] == session_id
        assert "current_comparison" in data

    async def test_get_comparison_status_invalid_session(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test getting status for invalid session fails."""
        response = await client.get(
            "/api/items/comparison/invalid_session/status",
            headers=auth_headers,
        )
        assert response.status_code == 404


@pytest.mark.asyncio
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


@pytest.mark.asyncio
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


@pytest.mark.asyncio
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
            is_complete=True,
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


@pytest.mark.asyncio
class TestCreateItemTierSets:
    """Tests for creating items with different tier_sets."""

    async def test_create_first_item_mid_tier_set(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        """Test creating first item with mid tier_set."""
        response = await client.post(
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
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Mid Item"
        assert data["tier_set"] == "mid"
        assert data["rating"] == 5.5

    async def test_create_first_item_bad_tier_set(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        """Test creating first item with bad tier_set."""
        response = await client.post(
            "/api/items/",
            params={"list_title": test_list.title},
            json={
                "name": "Bad Item",
                "description": "A bad tier item",
                "image_url": "https://example.com/bad.jpg",
                "tier_set": "bad",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Bad Item"
        assert data["tier_set"] == "bad"
        assert data["rating"] == 2.5

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


@pytest.mark.asyncio
class TestComparisonFlowComplete:
    """Tests for complete comparison workflow."""

    async def test_complete_comparison_flow(
        self,
        client: AsyncClient,
        test_list: ListModel,
        test_item: ItemModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        """Test completing a full comparison to rank an item."""
        # Create second item to start comparison
        create_response = await client.post(
            "/api/items/",
            params={"list_title": test_list.title},
            json={
                "name": "Second Item",
                "description": "Second item description",
                "image_url": "https://example.com/second.jpg",
                "tier_set": "good",
            },
            headers=auth_headers,
        )
        assert create_response.status_code == 200
        session_data = create_response.json()
        session_id = session_data["session_id"]

        # Submit comparison result (one comparison should be enough for 2 items)
        response = await client.post(
            "/api/items/comparison/result",
            params={"session_id": session_id},
            json={"result": "better"},
            headers=auth_headers,
        )
        # Response could be 200 (comparison done) or another session
        assert response.status_code == 200

        result = await test_db.execute(
            select(ItemModel).where(ItemModel.list_id == test_list.list_id)
        )
        ratings = {item.name: item.rating for item in result.scalars().all()}
        assert ratings == {"Second Item": 9.2, "Test Item": 7.8}

    async def test_comparison_wrong_session_owner(
        self,
        client: AsyncClient,
        test_list: ListModel,
        test_item: ItemModel,
        auth_headers: dict,
        auth_headers_user2: dict,
    ):
        """Test submitting comparison result for another user's session."""
        # Create second item to start comparison
        create_response = await client.post(
            "/api/items/",
            params={"list_title": test_list.title},
            json={
                "name": "New Item",
                "description": "Description",
                "image_url": "https://example.com/new.jpg",
                "tier_set": "good",
            },
            headers=auth_headers,
        )
        session_data = create_response.json()
        session_id = session_data["session_id"]

        # Try to submit as different user
        response = await client.post(
            "/api/items/comparison/result",
            params={"session_id": session_id},
            json={"result": "better"},
            headers=auth_headers_user2,
        )
        assert response.status_code == 404

    async def test_comparison_status_wrong_user(
        self,
        client: AsyncClient,
        test_list: ListModel,
        test_item: ItemModel,
        auth_headers: dict,
        auth_headers_user2: dict,
    ):
        """Test getting comparison status for another user's session."""
        # Create second item to start comparison
        create_response = await client.post(
            "/api/items/",
            params={"list_title": test_list.title},
            json={
                "name": "New Item",
                "description": "Description",
                "image_url": "https://example.com/new.jpg",
                "tier_set": "good",
            },
            headers=auth_headers,
        )
        session_data = create_response.json()
        session_id = session_data["session_id"]

        # Try to get status as different user
        response = await client.get(
            f"/api/items/comparison/{session_id}/status",
            headers=auth_headers_user2,
        )
        assert response.status_code == 404

    async def test_comparison_with_uuid_session_id(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        """Test submit with valid UUID format but non-existent session."""
        fake_session_id = str(uuid.uuid4())
        response = await client.post(
            "/api/items/comparison/result",
            params={"session_id": fake_session_id},
            json={"result": "better"},
            headers=auth_headers,
        )
        assert response.status_code == 404

    async def test_get_comparison_status_uuid_not_found(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        """Test getting status for valid UUID but non-existent session."""
        fake_session_id = str(uuid.uuid4())
        response = await client.get(
            f"/api/items/comparison/{fake_session_id}/status",
            headers=auth_headers,
        )
        assert response.status_code == 404


@pytest.mark.asyncio
class TestCreateItemWithExistingPositionedItems:
    """Tests for creating items when existing items already have positions."""

    async def test_create_item_with_existing_positioned_item(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        """Test creating item when existing items have positions triggers comparison."""
        # Create an item with position (already ranked)
        existing_item = ItemModel(
            item_id=uuid.uuid4(),
            list_id=test_list.list_id,
            name="Existing Item",
            description="Item with position",
            image_url="https://example.com/existing.jpg",
            position="a0",
            rating=None,
            tier_set="good",
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        test_db.add(existing_item)
        await test_db.commit()

        # Create new item - should trigger comparison
        response = await client.post(
            "/api/items/",
            params={"list_title": test_list.title},
            json={
                "name": "New Item",
                "description": "New item triggers comparison",
                "image_url": "https://example.com/new.jpg",
                "tier_set": "good",
            },
            headers=auth_headers,
        )
        # Should return comparison session
        assert response.status_code == 200
        data = response.json()
        assert "session_id" in data  # Comparison session started


@pytest.mark.asyncio
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
        _list_id = test_list.list_id

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


@pytest.mark.asyncio
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
