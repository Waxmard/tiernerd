"""Tests for list endpoints."""

import uuid
from datetime import UTC, datetime

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ComparisonSession, Item as ItemModel, List as ListModel, User


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

        list_data = data[0]
        assert "list_id" in list_data
        assert "title" in list_data
        assert "description" in list_data
        assert "item_count" in list_data

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
        test_list: ListModel,
        auth_headers: dict,
        auth_headers_user2: dict,
    ):
        """Test that users only see their own lists."""
        response = await client.get("/api/lists/", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert str(data[0]["user_id"]) == str(test_user.user_id)

        response = await client.get("/api/lists/", headers=auth_headers_user2)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 0


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
        assert data["ranking_mode"] == "score"
        assert "list_id" in data
        assert str(data["user_id"]) == str(test_user.user_id)

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

    async def test_ranking_modes_round_trip_and_validate(
        self, client: AsyncClient, auth_headers: dict
    ):
        for mode in ("rank", "score"):
            created = await client.post(
                "/api/lists/",
                params={
                    "name": f"List {mode}",
                    "description": "",
                    "ranking_mode": mode,
                },
                headers=auth_headers,
            )
            assert created.status_code == 200
            assert created.json()["ranking_mode"] == mode
            list_id = created.json()["list_id"]
            detail = await client.get(f"/api/lists/{list_id}", headers=auth_headers)
            assert detail.status_code == 200
            assert detail.json()["ranking_mode"] == mode
            summaries = await client.get("/api/lists/", headers=auth_headers)
            assert summaries.status_code == 200
            assert (
                next(row for row in summaries.json() if row["list_id"] == list_id)[
                    "ranking_mode"
                ]
                == mode
            )

        invalid = await client.post(
            "/api/lists/",
            params={"name": "Invalid", "description": "", "ranking_mode": "other"},
            headers=auth_headers,
        )
        assert invalid.status_code == 422


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

    async def test_mode_switch_preserves_items_and_sessions(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        auth_headers_user2: dict,
        test_db: AsyncSession,
    ):
        first = ItemModel(
            list_id=test_list.list_id, name="First", position="a1", rating=10.0
        )
        second = ItemModel(
            list_id=test_list.list_id, name="Second", position="a0", rating=0.0
        )
        test_db.add_all([first, second])
        await test_db.flush()
        session = ComparisonSession(
            list_id=test_list.list_id,
            new_item_id=first.item_id,
            target_item_id=second.item_id,
            status="active",
            revision=3,
        )
        test_db.add(session)
        await test_db.commit()
        await test_db.refresh(session)
        original_session = {
            column.name: getattr(session, column.name)
            for column in ComparisonSession.__table__.columns
        }
        url = f"/api/lists/{test_list.list_id}"
        initial = await client.get(f"{url}/items", headers=auth_headers)
        assert initial.status_code == 200
        before = initial.json()
        assert [(item["position"], item["rating"]) for item in before] == [
            ("a1", 10.0),
            ("a0", 0.0),
        ]

        for mode in ("rank", "score", "rank"):
            response = await client.put(
                url, json={"ranking_mode": mode}, headers=auth_headers
            )
            assert response.status_code == 200
            assert response.json()["ranking_mode"] == mode
            after = await client.get(f"{url}/items", headers=auth_headers)
            assert after.status_code == 200
            assert after.json() == before
            await test_db.refresh(session)
            assert {
                column.name: getattr(session, column.name)
                for column in ComparisonSession.__table__.columns
            } == original_session

        renamed = await client.put(url, json={"title": "Renamed"}, headers=auth_headers)
        assert renamed.status_code == 200
        assert renamed.json()["ranking_mode"] == "rank"
        for invalid in (None, "other"):
            response = await client.put(
                url, json={"ranking_mode": invalid}, headers=auth_headers
            )
            assert response.status_code == 422
        denied = await client.put(
            url, json={"ranking_mode": "score"}, headers=auth_headers_user2
        )
        assert denied.status_code == 404
        detail = await client.get(url, headers=auth_headers)
        assert detail.json()["ranking_mode"] == "rank"

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

        result = await test_db.execute(
            select(ListModel).where(ListModel.list_id == list_id)
        )
        assert result.scalar_one_or_none() is not None

        response = await client.delete(f"/api/lists/{list_id}", headers=auth_headers)
        assert response.status_code == 204

        result = await test_db.execute(
            select(ListModel).where(ListModel.list_id == list_id)
        )
        assert result.scalar_one_or_none() is None

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

        items = []
        for i in range(3):
            item = ItemModel(
                item_id=uuid.uuid4(),
                list_id=list_id,
                name=f"Item {i}",
                description=f"Description {i}",
                image_url=f"https://example.com/img{i}.jpg",
                position=f"a{i}",
                rating=i * 5.0,
                created_at=datetime.now(),
                updated_at=datetime.now(),
            )
            test_db.add(item)
            items.append(item)
        await test_db.commit()

        result = await test_db.execute(
            select(ItemModel).where(ItemModel.list_id == list_id)
        )
        assert len(result.scalars().all()) == 3

        response = await client.delete(f"/api/lists/{list_id}", headers=auth_headers)
        assert response.status_code == 204

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

    async def test_read_list_items_best_first_with_unranked_last(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        lower = ItemModel(
            list_id=test_list.list_id, name="Lower", position="a0", rating=0.0
        )
        unranked = ItemModel(list_id=test_list.list_id, name="Unranked")
        higher = ItemModel(
            list_id=test_list.list_id, name="Higher", position="a1", rating=10.0
        )
        test_db.add_all([lower, unranked, higher])
        await test_db.commit()

        response = await client.get(
            f"/api/lists/{test_list.list_id}/items", headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert [item["name"] for item in data] == ["Higher", "Lower", "Unranked"]
        assert [(item["position"], item["rating"]) for item in data] == [
            ("a1", 10.0),
            ("a0", 0.0),
            (None, None),
        ]

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
        for number, day in ((3, 2), (2, 1), (4, 3), (1, 2)):
            test_db.add(
                ListModel(
                    list_id=uuid.UUID(int=number),
                    user_id=test_user.user_id,
                    title=f"Pagination Test List {number}",
                    created_at=datetime(2023, 1, 1, tzinfo=UTC),
                    updated_at=datetime(2024, 1, day, tzinfo=UTC),
                )
            )
        await test_db.commit()

        first = await client.get("/api/lists/?limit=2", headers=auth_headers)
        assert first.status_code == 200
        assert [row["list_id"] for row in first.json()] == [
            str(uuid.UUID(int=4)),
            str(uuid.UUID(int=1)),
        ]

        second = await client.get("/api/lists/?skip=2&limit=2", headers=auth_headers)
        assert second.status_code == 200
        assert [row["list_id"] for row in second.json()] == [
            str(uuid.UUID(int=3)),
            str(uuid.UUID(int=2)),
        ]
