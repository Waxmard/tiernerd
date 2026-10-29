"""Tests for list endpoints."""

import uuid
from datetime import datetime

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Item as ItemModel, List as ListModel, User


class TestReadLists:
    """Tests for reading lists endpoint."""

    async def test_read_lists_authenticated(
        self,
        client: AsyncClient,
        test_user: User,
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        response = await client.get("/api/lists/", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1

        # Verify list data structure
        list_data = data[0]
        assert "list_id" in list_data
        assert "title" in list_data
        assert "description" in list_data
        assert "item_count" in list_data

        # Verify data matches database
        result = await test_db.execute(
            select(ListModel).where(ListModel.user_id == test_user.user_id)
        )
        db_lists = result.scalars().all()
        assert len(data) == len(db_lists)
        assert str(data[0]["list_id"]) == str(test_list.list_id)
        assert data[0]["title"] == test_list.title

    async def test_read_lists_unauthenticated(self, client: AsyncClient):
        """Test reading lists without authentication fails."""
        response = await client.get("/api/lists/")
        assert response.status_code == 401

    async def test_read_lists_only_own_lists(
        self,
        client: AsyncClient,
        test_user: User,
        test_user2: User,
        test_list: ListModel,
        auth_headers: dict,
        auth_headers_user2: dict,
        test_db: AsyncSession,
    ):
        """Test that users only see their own lists."""
        # Verify test_list belongs to test_user in database
        result = await test_db.execute(
            select(ListModel).where(ListModel.list_id == test_list.list_id)
        )
        db_list = result.scalar_one()
        assert db_list.user_id == test_user.user_id

        # User 1 should see their list
        response = await client.get("/api/lists/", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert str(data[0]["user_id"]) == str(test_user.user_id)

        # User 2 should not see user 1's lists
        response = await client.get("/api/lists/", headers=auth_headers_user2)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 0

        # Verify test_user2 has no lists in database
        result = await test_db.execute(
            select(ListModel).where(ListModel.user_id == test_user2.user_id)
        )
        user2_lists = result.scalars().all()
        assert len(user2_lists) == 0


class TestCreateList:
    """Tests for creating lists endpoint."""

    async def test_create_list_success(
        self,
        client: AsyncClient,
        test_user: User,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        response = await client.post(
            "/api/lists/",
            params={
                "name": "My New List",
                "description": "A brand new list",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "My New List"
        assert data["description"] == "A brand new list"
        assert "list_id" in data
        assert str(data["user_id"]) == str(test_user.user_id)

        # Verify list was created in database
        result = await test_db.execute(
            select(ListModel).where(ListModel.title == "My New List")
        )
        db_list = result.scalar_one_or_none()
        assert db_list is not None
        assert db_list.title == "My New List"
        assert db_list.description == "A brand new list"
        assert db_list.user_id == test_user.user_id
        assert str(db_list.list_id) == data["list_id"]

    async def test_create_list_unauthenticated(self, client: AsyncClient):
        """Test creating list without authentication fails."""
        response = await client.post(
            "/api/lists/",
            params={
                "name": "My New List",
                "description": "A brand new list",
            },
        )
        assert response.status_code == 401

    async def test_create_list_duplicate_title(
        self, client: AsyncClient, test_list: ListModel, auth_headers: dict
    ):
        """Test creating list with duplicate title fails."""
        response = await client.post(
            "/api/lists/",
            params={
                "name": test_list.title,
                "description": "Different description",
            },
            headers=auth_headers,
        )
        assert response.status_code == 409
        assert "already exists" in response.json()["detail"].lower()

    async def test_create_list_empty_description(
        self, client: AsyncClient, auth_headers: dict
    ):
        """Test creating list with empty description."""
        response = await client.post(
            "/api/lists/",
            params={
                "name": "List Without Description",
                "description": "",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "List Without Description"

    async def test_create_list_with_color_round_trips_through_the_api(
        self, client: AsyncClient, auth_headers: dict
    ):
        """A chosen swatch is persisted, echoed, and rejected when unknown."""
        response = await client.post(
            "/api/lists/",
            params={
                "name": "Colored List",
                "description": "Has a swatch",
                "color": "teal",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["color"] == "teal"

        lists = await client.get("/api/lists/", headers=auth_headers)
        assert lists.status_code == 200
        colored = [row for row in lists.json() if row["title"] == "Colored List"]
        assert [row["color"] for row in colored] == ["teal"]

        invalid = await client.post(
            "/api/lists/",
            params={
                "name": "Chartreuse List",
                "description": "Not a swatch",
                "color": "chartreuse",
            },
            headers=auth_headers,
        )
        assert invalid.status_code == 422

        uncolored = await client.post(
            "/api/lists/",
            params={"name": "Uncolored List", "description": "No swatch"},
            headers=auth_headers,
        )
        assert uncolored.status_code == 200
        assert uncolored.json()["color"] is None


class TestReadList:
    """Tests for reading a specific list endpoint."""

    async def test_read_list_success(
        self, client: AsyncClient, test_list: ListModel, auth_headers: dict
    ):
        response = await client.get(
            f"/api/lists/{test_list.list_id}", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert str(data["list_id"]) == str(test_list.list_id)
        assert data["title"] == test_list.title
        assert data["description"] == test_list.description

    async def test_read_list_unauthenticated(
        self, client: AsyncClient, test_list: ListModel
    ):
        """Test reading a list without authentication fails."""
        response = await client.get(f"/api/lists/{test_list.list_id}")
        assert response.status_code == 401

    async def test_read_list_not_found(self, client: AsyncClient, auth_headers: dict):
        """Test reading non-existent list fails."""
        import uuid

        fake_id = uuid.uuid4()
        response = await client.get(f"/api/lists/{fake_id}", headers=auth_headers)
        assert response.status_code == 404

    async def test_read_list_wrong_user(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers_user2: dict,
    ):
        """Test reading another user's list fails."""
        response = await client.get(
            f"/api/lists/{test_list.list_id}", headers=auth_headers_user2
        )
        assert response.status_code == 404


class TestUpdateList:
    """Tests for updating lists endpoint."""

    async def test_update_list_success(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        original_title = test_list.title
        original_description = test_list.description

        response = await client.put(
            f"/api/lists/{test_list.list_id}",
            json={
                "title": "Updated Title",
                "description": "Updated description",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Updated Title"
        assert data["description"] == "Updated description"
        assert str(data["list_id"]) == str(test_list.list_id)

        # Verify list was updated in database
        await test_db.refresh(test_list)
        assert test_list.title == "Updated Title"
        assert test_list.description == "Updated description"
        assert test_list.title != original_title
        assert test_list.description != original_description

    async def test_update_list_partial(
        self, client: AsyncClient, test_list: ListModel, auth_headers: dict
    ):
        """Test partial list update (only title)."""
        original_description = test_list.description
        response = await client.put(
            f"/api/lists/{test_list.list_id}",
            json={
                "title": "New Title Only",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "New Title Only"
        assert data["description"] == original_description

    async def test_update_list_unauthenticated(
        self, client: AsyncClient, test_list: ListModel
    ):
        """Test updating list without authentication fails."""
        response = await client.put(
            f"/api/lists/{test_list.list_id}",
            json={
                "title": "Updated Title",
            },
        )
        assert response.status_code == 401

    async def test_update_list_not_found(self, client: AsyncClient, auth_headers: dict):
        """Test updating non-existent list fails."""
        import uuid

        fake_id = uuid.uuid4()
        response = await client.put(
            f"/api/lists/{fake_id}",
            json={
                "title": "Updated Title",
            },
            headers=auth_headers,
        )
        assert response.status_code == 404

    async def test_update_list_wrong_user(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers_user2: dict,
    ):
        """Test updating another user's list fails."""
        response = await client.put(
            f"/api/lists/{test_list.list_id}",
            json={
                "title": "Trying to update",
            },
            headers=auth_headers_user2,
        )
        assert response.status_code == 404


class TestDeleteList:
    """Tests for deleting lists endpoint."""

    async def test_delete_list_success(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        list_id = test_list.list_id

        # Verify list exists in database before deletion
        result = await test_db.execute(
            select(ListModel).where(ListModel.list_id == list_id)
        )
        assert result.scalar_one_or_none() is not None

        response = await client.delete(f"/api/lists/{list_id}", headers=auth_headers)
        assert response.status_code == 204

        # Verify list is deleted from database
        result = await test_db.execute(
            select(ListModel).where(ListModel.list_id == list_id)
        )
        assert result.scalar_one_or_none() is None

        # Verify list is deleted via API
        response = await client.get(f"/api/lists/{list_id}", headers=auth_headers)
        assert response.status_code == 404

    async def test_delete_list_unauthenticated(
        self, client: AsyncClient, test_list: ListModel
    ):
        """Test deleting list without authentication fails."""
        response = await client.delete(f"/api/lists/{test_list.list_id}")
        assert response.status_code == 401

    async def test_delete_list_not_found(self, client: AsyncClient, auth_headers: dict):
        """Test deleting non-existent list fails."""
        import uuid

        fake_id = uuid.uuid4()
        response = await client.delete(f"/api/lists/{fake_id}", headers=auth_headers)
        assert response.status_code == 404

    async def test_delete_list_wrong_user(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers_user2: dict,
    ):
        """Test deleting another user's list fails."""
        response = await client.delete(
            f"/api/lists/{test_list.list_id}", headers=auth_headers_user2
        )
        assert response.status_code == 404

    async def test_delete_list_cascades_items(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        """Test that deleting a list also deletes its items."""
        list_id = test_list.list_id

        # Create some items in the list
        items = []
        for i in range(3):
            item = ItemModel(
                item_id=uuid.uuid4(),
                list_id=list_id,
                name=f"Item {i}",
                description=f"Description {i}",
                image_url=f"https://example.com/img{i}.jpg",
                position=f"a{i}",
                rating=None,
                tier_set="good",
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
            test_db.add(item)
            items.append(item)
        await test_db.commit()

        # Verify items exist
        result = await test_db.execute(
            select(ItemModel).where(ItemModel.list_id == list_id)
        )
        assert len(result.scalars().all()) == 3

        # Delete the list
        response = await client.delete(f"/api/lists/{list_id}", headers=auth_headers)
        assert response.status_code == 204

        # Verify items are also deleted
        result = await test_db.execute(
            select(ItemModel).where(ItemModel.list_id == list_id)
        )
        assert len(result.scalars().all()) == 0


class TestReadListItems:
    """Tests for reading list items endpoint."""

    async def test_read_list_items_empty(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
    ):
        """Test reading items from empty list returns empty array."""
        response = await client.get(
            f"/api/lists/{test_list.list_id}/items", headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json() == []

    async def test_read_list_items_with_items(
        self,
        client: AsyncClient,
        test_list: ListModel,
        test_item: ItemModel,
        auth_headers: dict,
    ):
        response = await client.get(
            f"/api/lists/{test_list.list_id}/items", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert data[0]["name"] == test_item.name

    async def test_read_list_items_multiple_tier_sets(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        """Test reading items with multiple tier_sets."""
        # Create items in different tier_sets
        good_item = ItemModel(
            item_id=uuid.uuid4(),
            list_id=test_list.list_id,
            name="Good Item",
            description="A good item",
            image_url="https://example.com/good.jpg",
            position="a0",
            rating=None,
            tier_set="good",
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        mid_item = ItemModel(
            item_id=uuid.uuid4(),
            list_id=test_list.list_id,
            name="Mid Item",
            description="A mid item",
            image_url="https://example.com/mid.jpg",
            position="a0",
            rating=None,
            tier_set="mid",
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        test_db.add(good_item)
        test_db.add(mid_item)
        await test_db.commit()

        response = await client.get(
            f"/api/lists/{test_list.list_id}/items", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

        # Verify both tier_sets are present
        tier_sets = {item["tier_set"] for item in data}
        assert "good" in tier_sets
        assert "mid" in tier_sets

    async def test_read_list_items_not_found(
        self,
        client: AsyncClient,
        auth_headers: dict,
    ):
        """Test reading items from non-existent list."""
        fake_id = uuid.uuid4()
        response = await client.get(f"/api/lists/{fake_id}/items", headers=auth_headers)
        assert response.status_code == 404

    async def test_read_list_items_wrong_user(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers_user2: dict,
    ):
        """Test reading items from another user's list fails."""
        response = await client.get(
            f"/api/lists/{test_list.list_id}/items", headers=auth_headers_user2
        )
        assert response.status_code == 404

    async def test_read_list_items_unauthenticated(
        self,
        client: AsyncClient,
        test_list: ListModel,
    ):
        """Test reading list items without auth fails."""
        response = await client.get(f"/api/lists/{test_list.list_id}/items")
        assert response.status_code == 401


class TestReadListsWithStats:
    """Tests for reading lists with stats."""

    async def test_read_lists_pagination_multiple_lists(
        self,
        client: AsyncClient,
        test_user: User,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        # Create additional lists
        for i in range(5):
            list_obj = ListModel(
                list_id=uuid.uuid4(),
                user_id=test_user.user_id,
                title=f"Pagination Test List {i}",
                description=f"List {i} for pagination testing",
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
            test_db.add(list_obj)
        await test_db.commit()

        # Test getting first 2 lists
        response = await client.get("/api/lists/?limit=2", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

        # Test skipping first 2 lists
        response = await client.get("/api/lists/?skip=2&limit=2", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2

        # Test getting all lists
        response = await client.get("/api/lists/", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 5  # At least the 5 we created
