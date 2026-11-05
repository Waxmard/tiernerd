"""Tests for list endpoints."""

import json
import logging
import uuid
from datetime import UTC, datetime

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from pytest import MonkeyPatch
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ComparisonSession, Item as ItemModel, List as ListModel, User
from app.main import app


def metadata_files(metadata: dict) -> dict:
    return {"metadata": (None, json.dumps(metadata))}


def upload_files(metadata: dict, image: bytes = b"jpeg") -> dict:
    return metadata_files(metadata) | {"file": ("cover.jpg", image, "image/jpeg")}


@pytest.fixture
def cover_storage(monkeypatch: MonkeyPatch):
    from app.services import cover_upload_service

    objects = {}
    events = []

    async def create_upload(file, user_id):
        photo = {"source": "upload", "id": str(uuid.uuid4())}
        objects[(str(user_id), photo["id"])] = await file.read()
        events.append(("create", str(user_id), photo))
        return photo

    async def read_upload(user_id, photo_id):
        events.append(("read", str(user_id), str(photo_id)))
        return objects.get((str(user_id), str(photo_id)))

    async def delete_upload(user_id, photo):
        events.append(("delete", str(user_id), photo))
        objects.pop((str(user_id), photo["id"]), None)

    monkeypatch.setattr(cover_upload_service, "create_upload", create_upload)
    monkeypatch.setattr(cover_upload_service, "read_upload", read_upload)
    monkeypatch.setattr(cover_upload_service, "delete_upload", delete_upload)
    return objects, events


@pytest.fixture
def unsplash(monkeypatch: MonkeyPatch):
    from app.services import unsplash_service

    photo = {
        "source": "unsplash",
        "id": "photo-id",
        "url": "https://images.unsplash.com/photo-id?fit=crop&w=1200",
        "photographer_name": "Photographer",
        "photographer_url": "https://unsplash.com/@photographer",
        "photo_url": "https://unsplash.com/photos/photo-id",
    }
    result = {key: value for key, value in photo.items() if key != "source"} | {
        "thumbnail_url": "https://images.unsplash.com/photo-id?w=200"
    }
    location = "https://api.unsplash.com/photos/photo-id/download"
    events = []

    async def search_photos(query, page):
        events.append(("search", query, page))
        return {"results": [result], "has_more": True}

    async def resolve_photo(photo_id):
        events.append(("resolve", photo_id))
        return photo, location

    async def track_download(photo_id, download_location):
        events.append(("track", photo_id, download_location))

    monkeypatch.setattr(unsplash_service, "search_photos", search_photos)
    monkeypatch.setattr(unsplash_service, "resolve_photo", resolve_photo)
    monkeypatch.setattr(unsplash_service, "track_download", track_download)
    return photo, result, location, events


async def create_uploaded_list(client, auth_headers, title="Photo list"):
    response = await client.post(
        "/api/lists/",
        files=upload_files({"title": title, "cover_photo": {"source": "upload"}}),
        headers=auth_headers,
    )
    assert response.status_code == 200
    return response.json()


def record_cover_commits(monkeypatch, test_db, events):
    commit = test_db.commit

    async def record_commit():
        await commit()
        events.append(("commit",))

    monkeypatch.setattr(test_db, "commit", record_commit)


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
            files=metadata_files(
                {"title": "My New List", "description": "A brand new list"}
            ),
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "My New List"
        assert data["description"] == "A brand new list"
        assert data["ranking_mode"] == "score"
        assert data["cover_photo"] is None
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
            files=metadata_files(
                {"title": "My New List", "description": "A brand new list"}
            ),
        )
        assert response.status_code == 401

    async def test_create_list_duplicate_title(
        self, client: AsyncClient, test_list: ListModel, auth_headers: dict
    ):
        """Test creating list with duplicate title fails."""
        response = await client.post(
            "/api/lists/",
            files=metadata_files(
                {"title": test_list.title, "description": "Different description"}
            ),
            headers=auth_headers,
        )
        assert response.status_code == 409
        assert "already exists" in response.json()["detail"].lower()

    async def test_create_list_with_color_round_trips_through_the_api(
        self, client: AsyncClient, auth_headers: dict
    ):
        """A chosen swatch is persisted, echoed, and rejected when unknown."""
        response = await client.post(
            "/api/lists/",
            files=metadata_files(
                {
                    "title": "Colored List",
                    "description": "Has a swatch",
                    "color": "teal",
                }
            ),
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
            files=metadata_files(
                {
                    "title": "Chartreuse List",
                    "description": "Not a swatch",
                    "color": "chartreuse",
                }
            ),
            headers=auth_headers,
        )
        assert invalid.status_code == 422

        uncolored = await client.post(
            "/api/lists/",
            files=metadata_files(
                {"title": "Uncolored List", "description": "No swatch"}
            ),
            headers=auth_headers,
        )
        assert uncolored.status_code == 200
        assert uncolored.json()["color"] is None
        assert uncolored.json()["icon"] is None
        assert uncolored.json()["cover"] is None
        assert uncolored.json()["cover_photo"] is None

        styled = await client.post(
            "/api/lists/",
            files=metadata_files(
                {
                    "title": "Immersive List",
                    "description": "With icon and cover",
                    "color": "violet",
                    "icon": "coffee",
                    "cover": "landscape",
                }
            ),
            headers=auth_headers,
        )
        assert styled.status_code == 200
        styled_data = styled.json()
        assert styled_data["color"] == "violet"
        assert styled_data["icon"] == "coffee"
        assert styled_data["cover"] == "landscape"

        detail = await client.get(
            f"/api/lists/{styled_data['list_id']}", headers=auth_headers
        )
        assert detail.status_code == 200
        assert detail.json()["color"] == "violet"
        assert detail.json()["icon"] == "coffee"
        assert detail.json()["cover"] == "landscape"

        summaries = await client.get("/api/lists/", headers=auth_headers)
        assert summaries.status_code == 200
        summary = next(
            row for row in summaries.json() if row["list_id"] == styled_data["list_id"]
        )
        assert summary["color"] == "violet"
        assert summary["icon"] == "coffee"
        assert summary["cover"] == "landscape"

        for bad_metadata in (
            {"title": "Bad Icon", "description": "", "icon": "rocket"},
            {"title": "Bad Cover", "description": "", "cover": "photo"},
        ):
            bad_res = await client.post(
                "/api/lists/",
                files=metadata_files(bad_metadata),
                headers=auth_headers,
            )
            assert bad_res.status_code == 422

    async def test_ranking_modes_round_trip_and_validate(
        self, client: AsyncClient, auth_headers: dict
    ):
        for mode in ("rank", "score"):
            created = await client.post(
                "/api/lists/",
                files=metadata_files(
                    {
                        "title": f"List {mode}",
                        "description": "",
                        "ranking_mode": mode,
                    }
                ),
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
            files=metadata_files(
                {"title": "Invalid", "description": "", "ranking_mode": "other"}
            ),
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
                url,
                files=metadata_files({"ranking_mode": mode}),
                headers=auth_headers,
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

        renamed = await client.put(
            url,
            files=metadata_files({"title": "Renamed"}),
            headers=auth_headers,
        )
        assert renamed.status_code == 200
        assert renamed.json()["ranking_mode"] == "rank"

        appearance = await client.put(
            url,
            files=metadata_files(
                {"color": "coral", "icon": "heart", "cover": "landscape"}
            ),
            headers=auth_headers,
        )
        assert appearance.status_code == 200
        assert appearance.json()["ranking_mode"] == "rank"
        assert appearance.json()["color"] == "coral"
        assert appearance.json()["icon"] == "heart"
        assert appearance.json()["cover"] == "landscape"
        after_appearance = await client.get(f"{url}/items", headers=auth_headers)
        assert after_appearance.json() == before
        await test_db.refresh(session)
        assert {
            column.name: getattr(session, column.name)
            for column in ComparisonSession.__table__.columns
        } == original_session

        cleared = await client.put(
            url,
            files=metadata_files({"color": None, "icon": None, "cover": None}),
            headers=auth_headers,
        )
        assert cleared.status_code == 200
        assert cleared.json()["ranking_mode"] == "rank"
        assert cleared.json()["color"] is None
        assert cleared.json()["icon"] is None
        assert cleared.json()["cover"] is None

        for invalid_payload in (
            {"color": "chartreuse"},
            {"icon": "rocket"},
            {"cover": "photo"},
            {"title": None},
        ):
            bad_update = await client.put(
                url,
                files=metadata_files(invalid_payload),
                headers=auth_headers,
            )
            assert bad_update.status_code == 422

        for invalid in (None, "other"):
            response = await client.put(
                url,
                files=metadata_files({"ranking_mode": invalid}),
                headers=auth_headers,
            )
            assert response.status_code == 422
        denied = await client.put(
            url,
            files=metadata_files({"ranking_mode": "score"}),
            headers=auth_headers_user2,
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
            files=metadata_files(
                {"title": "Updated Title", "description": "Updated description"}
            ),
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
            files=metadata_files({"title": "New Title Only"}),
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "New Title Only"
        assert data["description"] == original_description

    async def test_update_list_rejects_duplicate_title(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        other_list = ListModel(user_id=test_list.user_id, title="Other")
        test_db.add(other_list)
        await test_db.commit()
        url = f"/api/lists/{test_list.list_id}"

        response = await client.put(
            url, files=metadata_files({"title": "Other"}), headers=auth_headers
        )
        assert response.status_code == 409
        assert response.json()["detail"] == "List already exists for current user"

        unchanged = await client.put(
            url, files=metadata_files({"title": test_list.title}), headers=auth_headers
        )
        assert unchanged.status_code == 200
        assert unchanged.json()["title"] == test_list.title

    async def test_update_list_unauthenticated(
        self, client: AsyncClient, test_list: ListModel
    ):
        """Test updating list without authentication fails."""
        response = await client.put(
            f"/api/lists/{test_list.list_id}",
            files=metadata_files({"title": "Updated Title"}),
        )
        assert response.status_code == 401

    async def test_update_list_not_found(self, client: AsyncClient, auth_headers: dict):
        """Test updating non-existent list fails."""
        import uuid

        fake_id = uuid.uuid4()
        response = await client.put(
            f"/api/lists/{fake_id}",
            files=metadata_files({"title": "Updated Title"}),
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
            files=metadata_files({"title": "Trying to update"}),
            headers=auth_headers_user2,
        )
        assert response.status_code == 404


class TestListPhotoContract:
    async def test_seeded_photos_round_trip_and_omitted_fields_are_preserved(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        upload = {"source": "upload", "id": str(uuid.uuid4())}
        unsplash = {
            "source": "unsplash",
            "id": "photo-id",
            "url": "https://images.unsplash.com/photo-id?fit=crop&w=1200",
            "photographer_name": "Photographer",
            "photographer_url": "https://unsplash.com/@photographer",
            "photo_url": "https://unsplash.com/photos/photo-id",
        }
        test_list.color = "teal"
        test_list.icon = "coffee"
        test_list.ranking_mode = "rank"
        original_description = test_list.description
        url = f"/api/lists/{test_list.list_id}"

        for index, photo in enumerate((None, upload, unsplash)):
            test_list.cover = None
            test_list.cover_photo = photo
            await test_db.commit()
            updated = await client.put(
                url,
                files=metadata_files({"title": f"Updated {index}"}),
                headers=auth_headers,
            )
            assert updated.status_code == 200
            data = updated.json()
            assert data["title"] == f"Updated {index}"
            assert data["description"] == original_description
            assert data["color"] == "teal"
            assert data["icon"] == "coffee"
            assert data["ranking_mode"] == "rank"
            assert data["cover"] is None
            assert data["cover_photo"] == photo

            detail = await client.get(url, headers=auth_headers)
            summaries = await client.get("/api/lists/", headers=auth_headers)
            assert detail.status_code == 200
            assert summaries.status_code == 200
            summary = next(
                row
                for row in summaries.json()
                if row["list_id"] == str(test_list.list_id)
            )
            assert detail.json()["cover_photo"] == photo
            assert summary["cover_photo"] == photo
            assert detail.json()["cover"] is None
            assert summary["cover"] is None
            await test_db.refresh(test_list)
            assert test_list.cover_photo == photo

    async def test_upload_retention_requires_the_same_owned_list(
        self,
        client: AsyncClient,
        test_list: ListModel,
        test_user2: User,
        auth_headers: dict,
        auth_headers_user2: dict,
        test_db: AsyncSession,
        cover_storage,
    ):
        current_photo = {"source": "upload", "id": str(uuid.uuid4())}
        same_owner_photo = {"source": "upload", "id": str(uuid.uuid4())}
        other_owner_photo = {"source": "upload", "id": str(uuid.uuid4())}
        test_list.cover_photo = current_photo
        same_owner_list = ListModel(
            user_id=test_list.user_id,
            title="Other owned list",
            cover_photo=same_owner_photo,
        )
        other_owner_list = ListModel(
            user_id=test_user2.user_id,
            title="Other user's list",
            cover_photo=other_owner_photo,
        )
        test_db.add_all([same_owner_list, other_owner_list])
        await test_db.commit()
        url = f"/api/lists/{test_list.list_id}"

        for photo_id in (
            same_owner_photo["id"],
            other_owner_photo["id"],
            str(uuid.uuid4()),
        ):
            response = await client.put(
                url,
                files=metadata_files(
                    {"cover_photo": {"source": "upload", "id": photo_id}}
                ),
                headers=auth_headers,
            )
            assert response.status_code == 422

        keep = {"cover_photo": current_photo, "title": "Retained photo"}
        denied = await client.put(
            url,
            files=metadata_files(keep),
            headers=auth_headers_user2,
        )
        assert denied.status_code == 404
        denied_other_list = await client.put(
            f"/api/lists/{other_owner_list.list_id}",
            files=metadata_files({"cover_photo": other_owner_photo}),
            headers=auth_headers,
        )
        assert denied_other_list.status_code == 404
        forged_other_owner = await client.put(
            f"/api/lists/{other_owner_list.list_id}",
            files=metadata_files({"cover_photo": current_photo}),
            headers=auth_headers_user2,
        )
        assert forged_other_owner.status_code == 422
        await test_db.refresh(other_owner_list)
        assert other_owner_list.cover_photo == other_owner_photo

        await test_db.refresh(test_list)
        assert test_list.cover_photo == current_photo
        retained = await client.put(
            url,
            files=metadata_files(keep),
            headers=auth_headers,
        )
        assert retained.status_code == 200
        assert retained.json()["title"] == "Retained photo"
        assert retained.json()["cover"] is None
        assert retained.json()["cover_photo"] == current_photo
        await test_db.refresh(test_list)
        assert test_list.cover_photo == current_photo
        assert cover_storage[1] == []

    async def test_clearing_or_selecting_landscape_removes_photo(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
        cover_storage,
    ):
        photo = {"source": "upload", "id": str(uuid.uuid4())}
        url = f"/api/lists/{test_list.list_id}"
        cases = (
            (None, photo, {"cover": None}, None, None),
            (None, photo, {"cover": "landscape"}, "landscape", None),
            ("landscape", None, {"cover_photo": None}, None, None),
            (None, photo, {"cover": None, "cover_photo": photo}, None, photo),
            (
                None,
                photo,
                {"cover": "landscape", "cover_photo": None},
                "landscape",
                None,
            ),
        )
        for old_cover, old_photo, metadata, expected_cover, expected_photo in cases:
            test_list.cover = old_cover
            test_list.cover_photo = old_photo
            await test_db.commit()
            response = await client.put(
                url,
                files=metadata_files(metadata),
                headers=auth_headers,
            )
            assert response.status_code == 200
            assert response.json()["cover"] == expected_cover
            assert response.json()["cover_photo"] == expected_photo
            await test_db.refresh(test_list)
            assert test_list.cover == expected_cover
            assert test_list.cover_photo == expected_photo

        preserved = await client.put(
            url,
            files=metadata_files({"description": "Changed without a cover selection"}),
            headers=auth_headers,
        )
        assert preserved.status_code == 200
        assert preserved.json()["cover"] == "landscape"
        assert preserved.json()["cover_photo"] is None

    async def test_invalid_photo_metadata_and_files_are_rejected(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
        cover_storage,
        unsplash,
    ):
        photo = {"source": "upload", "id": str(uuid.uuid4())}
        test_list.cover_photo = photo
        await test_db.commit()
        requests = (
            (client.post, "/api/lists/", {"title": "Invalid"}),
            (client.put, f"/api/lists/{test_list.list_id}", {}),
        )
        invalid = (
            {"name": "Old field"},
            {"unknown": True},
            {"cover": "landscape", "cover_photo": {"source": "unsplash", "id": "a"}},
            {"cover_photo": {"source": "upload"}},
            {"cover_photo": {"source": "upload", "id": "not-a-uuid"}},
            {
                "cover_photo": {
                    **photo,
                    "url": "https://example.com/untrusted.jpg",
                }
            },
            {
                "cover_photo": {
                    "source": "unsplash",
                    "id": "a",
                    "photographer_name": "Untrusted",
                }
            },
        )
        file_without_new_upload = (
            {},
            {"cover": "landscape"},
            {"cover_photo": {"source": "unsplash", "id": "a"}},
            {"cover_photo": photo},
        )
        for request, url, base in requests:
            for payload in invalid:
                response = await request(
                    url,
                    files=metadata_files(base | payload),
                    headers=auth_headers,
                )
                assert response.status_code == 422
            for payload in file_without_new_upload:
                response = await request(
                    url,
                    files={
                        "metadata": (None, json.dumps(base | payload)),
                        "file": ("cover.jpg", b"image", "image/jpeg"),
                    },
                    headers=auth_headers,
                )
                assert response.status_code == 422
            malformed = await request(
                url, files={"metadata": (None, "{")}, headers=auth_headers
            )
            assert malformed.status_code == 422

        create_with_upload_id = await client.post(
            "/api/lists/",
            files=metadata_files({"title": "Invalid", "cover_photo": photo}),
            headers=auth_headers,
        )
        assert create_with_upload_id.status_code == 422
        await test_db.refresh(test_list)
        assert test_list.cover_photo == photo
        assert cover_storage[1] == []
        assert unsplash[3] == []

    async def test_multipart_requires_one_metadata_and_at_most_one_file(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        cover_storage,
    ):
        requests = (
            (client.post, "/api/lists/", {"title": "Invalid multipart"}),
            (client.put, f"/api/lists/{test_list.list_id}", {}),
        )
        for request, url, base in requests:
            metadata = (None, json.dumps(base))
            upload_metadata = (
                None,
                json.dumps(base | {"cover_photo": {"source": "upload"}}),
            )
            image = ("cover.jpg", b"image", "image/jpeg")
            invalid_forms = (
                [("file", image)],
                [("metadata", metadata), ("metadata", metadata)],
                [("metadata", metadata), ("unexpected", (None, "value"))],
                [("metadata", ("metadata.json", json.dumps(base), "application/json"))],
                [("metadata", metadata), ("file", (None, "not a file"))],
                [
                    ("metadata", upload_metadata),
                    ("file", image),
                    ("file", image),
                ],
            )
            for form in invalid_forms:
                response = await request(url, files=form, headers=auth_headers)
                assert response.status_code == 422
        assert cover_storage[1] == []

    @pytest.mark.parametrize("method", ["POST", "PUT"])
    async def test_list_write_bounds_multipart_stream(
        self,
        method: str,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        monkeypatch: MonkeyPatch,
        cover_storage,
    ):
        from starlette import formparsers

        from app.api.endpoints import lists

        boundary = "list-cover-boundary"
        metadata = json.dumps(
            {
                "title": "Bounded multipart",
                "description": "Ordinary metadata",
                "cover_photo": {"source": "upload"},
            }
        ).encode()
        prefix = (
            b"--list-cover-boundary\r\n"
            b'Content-Disposition: form-data; name="metadata"\r\n\r\n'
            + metadata
            + b"\r\n--list-cover-boundary\r\n"
            b'Content-Disposition: form-data; name="file"; filename="cover.jpg"\r\n'
            b"Content-Type: image/jpeg\r\n\r\n"
        )
        suffix = b"\r\n--list-cover-boundary--\r\n"
        image = b"x" * 2048
        body = prefix + image + suffix
        monkeypatch.setattr(lists, "MAX_LIST_WRITE_BYTES", len(body))
        url = "/api/lists/" if method == "POST" else f"/api/lists/{test_list.list_id}"
        content_type = {"Content-Type": f"multipart/form-data; boundary={boundary}"}

        unauthorized = await client.request(
            method, url, headers=content_type, content=body
        )
        assert unauthorized.status_code == 401
        assert cover_storage[1] == []

        headers = content_type | auth_headers
        accepted = await client.request(method, url, headers=headers, content=body)
        assert accepted.status_code == 200
        assert accepted.json()["description"] == "Ordinary metadata"
        assert accepted.json()["cover_photo"]["source"] == "upload"
        events = cover_storage[1].copy()

        oversized = await client.request(
            method, url, headers=headers, content=prefix + image + b"x" + suffix
        )
        assert oversized.status_code == 413
        assert oversized.request.headers["content-length"] == str(len(body) + 1)
        assert cover_storage[1] == events

        read_early = []

        async def unexpected_read():
            read_early.append(True)
            yield body

        rejected_early = await client.request(
            method,
            url,
            headers=headers | {"Content-Length": str(len(body) + 1)},
            content=unexpected_read(),
        )
        assert rejected_early.status_code == 413
        assert read_early == []

        spooled = []
        spool_factory = formparsers.SpooledTemporaryFile

        def track_spool(*args, **kwargs):
            file = spool_factory(*args, **kwargs)
            spooled.append(file)
            return file

        monkeypatch.setattr(formparsers, "SpooledTemporaryFile", track_spool)
        chunks = [prefix, b"x" * (len(body) - len(prefix) - 1), b"xx", suffix]
        consumed = []

        async def stream():
            for chunk in chunks:
                consumed.append(len(chunk))
                yield chunk

        oversized_stream = await client.request(
            method, url, headers=headers, content=stream()
        )
        assert oversized_stream.status_code == 413
        assert oversized_stream.request.headers["transfer-encoding"] == "chunked"
        assert "content-length" not in oversized_stream.request.headers
        assert consumed == [len(chunk) for chunk in chunks[:3]]
        assert len(spooled) == 1
        assert spooled[0].closed
        assert cover_storage[1] == events

    @pytest.mark.parametrize("method", ["POST", "PUT"])
    async def test_maximum_upload_allows_normal_metadata(
        self,
        method: str,
        client: AsyncClient,
        test_list: ListModel,
        test_user: User,
        auth_headers: dict,
        cover_storage,
    ):
        from app.services.cover_upload_service import MAX_UPLOAD_BYTES

        description = "Details " * 1024
        metadata = {
            "title": "Maximum upload",
            "description": description,
            "cover_photo": {"source": "upload"},
        }
        url = "/api/lists/" if method == "POST" else f"/api/lists/{test_list.list_id}"
        response = await client.request(
            method,
            url,
            files=upload_files(metadata, b"x" * MAX_UPLOAD_BYTES),
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["description"] == description
        photo = response.json()["cover_photo"]
        assert len(cover_storage[0][(str(test_user.user_id), photo["id"])]) == (
            MAX_UPLOAD_BYTES
        )

    @pytest.mark.parametrize("method", ["POST", "PUT"])
    async def test_upload_over_image_limit_is_rejected(
        self,
        method: str,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
    ):
        from app.services.cover_upload_service import MAX_UPLOAD_BYTES

        metadata = {
            "title": "Oversized upload",
            "cover_photo": {"source": "upload"},
        }
        url = "/api/lists/" if method == "POST" else f"/api/lists/{test_list.list_id}"
        response = await client.request(
            method,
            url,
            files=upload_files(metadata, b"x" * (MAX_UPLOAD_BYTES + 1)),
            headers=auth_headers,
        )
        assert response.status_code == 413
        assert response.json()["detail"] == "Image exceeds 10 MiB"

    async def test_old_json_and_query_formats_are_rejected(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
    ):
        original_title = test_list.title
        url = f"/api/lists/{test_list.list_id}"
        old_create = await client.post(
            "/api/lists/",
            params={"name": "Old query", "description": ""},
            headers=auth_headers,
        )
        json_create = await client.post(
            "/api/lists/", json={"title": "Old JSON"}, headers=auth_headers
        )
        old_update = await client.put(
            url, json={"title": "Old JSON"}, headers=auth_headers
        )
        query_update = await client.put(
            url, params={"title": "Old query"}, headers=auth_headers
        )
        for request, endpoint in ((client.post, "/api/lists/"), (client.put, url)):
            query_metadata = await request(
                endpoint,
                params={"metadata": json.dumps({"title": "Query metadata"})},
                headers=auth_headers,
            )
            assert query_metadata.status_code in (415, 422)
            form_metadata = await request(
                endpoint,
                data={"metadata": json.dumps({"title": "Form metadata"})},
                headers=auth_headers,
            )
            assert form_metadata.status_code in (415, 422)
        assert old_create.status_code in (415, 422)
        assert json_create.status_code in (415, 422)
        assert old_update.status_code in (415, 422)
        assert query_update.status_code in (415, 422)
        detail = await client.get(url, headers=auth_headers)
        assert detail.status_code == 200
        assert detail.json()["title"] == original_title


class TestListPhotoLifecycle:
    async def test_upload_create_replace_retain_clear_and_delete(
        self,
        client: AsyncClient,
        test_user: User,
        auth_headers: dict,
        test_db: AsyncSession,
        monkeypatch: MonkeyPatch,
        cover_storage,
    ):
        objects, events = cover_storage
        user_id = str(test_user.user_id)
        record_cover_commits(monkeypatch, test_db, events)

        created = await create_uploaded_list(client, auth_headers)
        url = f"/api/lists/{created['list_id']}"
        first = created["cover_photo"]
        assert first["source"] == "upload"
        assert objects[(user_id, first["id"])] == b"jpeg"
        assert events == [("create", user_id, first), ("commit",)]

        events.clear()
        retained = await client.put(
            url, files=metadata_files({"cover_photo": first}), headers=auth_headers
        )
        assert retained.status_code == 200
        assert retained.json()["cover_photo"] == first
        assert events == [("commit",)]

        events.clear()
        replaced = await client.put(
            url,
            files=upload_files({"cover_photo": {"source": "upload"}}, b"second"),
            headers=auth_headers,
        )
        assert replaced.status_code == 200
        second = replaced.json()["cover_photo"]
        assert second["source"] == "upload"
        assert second["id"] != first["id"]
        assert events == [
            ("create", user_id, second),
            ("commit",),
            ("delete", user_id, first),
        ]
        assert (user_id, first["id"]) not in objects
        assert objects[(user_id, second["id"])] == b"second"
        events.clear()
        stale_url = f"{url}/cover-photo/{first['id']}"
        assert (await client.get(stale_url, headers=auth_headers)).status_code == 404
        assert events == []

        detail = await client.get(url, headers=auth_headers)
        summaries = await client.get("/api/lists/", headers=auth_headers)
        assert detail.status_code == 200
        assert summaries.status_code == 200
        assert detail.json()["cover_photo"] == second
        summary = next(
            row for row in summaries.json() if row["list_id"] == created["list_id"]
        )
        assert summary["cover_photo"] == second

    async def test_clear_reupload_and_delete_remove_objects(
        self,
        client: AsyncClient,
        test_user: User,
        auth_headers: dict,
        test_db: AsyncSession,
        monkeypatch: MonkeyPatch,
        cover_storage,
    ):
        objects, events = cover_storage
        user_id = str(test_user.user_id)
        record_cover_commits(monkeypatch, test_db, events)

        created = await create_uploaded_list(client, auth_headers)
        url = f"/api/lists/{created['list_id']}"
        second = created["cover_photo"]
        events.clear()
        cleared = await client.put(
            url, files=metadata_files({"cover_photo": None}), headers=auth_headers
        )
        assert cleared.status_code == 200
        assert cleared.json()["cover_photo"] is None
        assert events == [("commit",), ("delete", user_id, second)]
        assert (user_id, second["id"]) not in objects
        detail = await client.get(url, headers=auth_headers)
        summaries = await client.get("/api/lists/", headers=auth_headers)
        assert detail.status_code == 200
        assert detail.json()["cover_photo"] is None
        assert summaries.status_code == 200
        summary = next(
            row for row in summaries.json() if row["list_id"] == created["list_id"]
        )
        assert summary["cover_photo"] is None

        events.clear()
        uploaded = await client.put(
            url,
            files=upload_files({"cover_photo": {"source": "upload"}}),
            headers=auth_headers,
        )
        assert uploaded.status_code == 200
        third = uploaded.json()["cover_photo"]
        assert events == [("create", user_id, third), ("commit",)]
        events.clear()
        deleted = await client.delete(url, headers=auth_headers)
        assert deleted.status_code == 204
        assert events == [("commit",), ("delete", user_id, third)]
        assert (user_id, third["id"]) not in objects
        assert (await client.get(url, headers=auth_headers)).status_code == 404

    async def test_upload_read_requires_owner_current_photo_and_storage_object(
        self,
        client: AsyncClient,
        test_user: User,
        test_list: ListModel,
        auth_headers: dict,
        auth_headers_user2: dict,
        test_db: AsyncSession,
        cover_storage,
        unsplash,
    ):
        objects, events = cover_storage
        user_id = str(test_user.user_id)
        created = await create_uploaded_list(client, auth_headers)
        photo = created["cover_photo"]
        url = f"/api/lists/{created['list_id']}/cover-photo/{photo['id']}"
        events.clear()

        response = await client.get(url, headers=auth_headers)
        assert response.status_code == 200
        assert response.content == b"jpeg"
        assert response.headers["content-type"] == "image/jpeg"
        assert {"private", "no-store"} <= {
            value.strip().lower()
            for value in response.headers["cache-control"].split(",")
        }
        assert events == [("read", user_id, photo["id"])]

        events.clear()
        assert (await client.get(url)).status_code == 401
        assert (await client.get(url, headers=auth_headers_user2)).status_code == 404
        stale = f"/api/lists/{created['list_id']}/cover-photo/{uuid.uuid4()}"
        assert (await client.get(stale, headers=auth_headers)).status_code == 404
        missing_list = f"/api/lists/{uuid.uuid4()}/cover-photo/{photo['id']}"
        assert (await client.get(missing_list, headers=auth_headers)).status_code == 404
        no_photo = f"/api/lists/{test_list.list_id}/cover-photo/{photo['id']}"
        assert (await client.get(no_photo, headers=auth_headers)).status_code == 404
        test_list.cover_photo = unsplash[0] | {"id": photo["id"]}
        await test_db.commit()
        assert (await client.get(no_photo, headers=auth_headers)).status_code == 404
        assert events == []

        del objects[(user_id, photo["id"])]
        assert (await client.get(url, headers=auth_headers)).status_code == 404
        assert events == [("read", user_id, photo["id"])]

    async def test_invalid_or_unowned_uploads_are_rejected_before_storage(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        auth_headers_user2: dict,
        cover_storage,
    ):
        selection = {"cover_photo": {"source": "upload"}}
        duplicate = await client.post(
            "/api/lists/",
            files=upload_files({"title": test_list.title} | selection),
            headers=auth_headers,
        )
        assert duplicate.status_code == 409
        invalid = await client.post(
            "/api/lists/",
            files=upload_files({"title": "Invalid", "color": "chartreuse"} | selection),
            headers=auth_headers,
        )
        assert invalid.status_code == 422
        invalid_update = await client.put(
            f"/api/lists/{test_list.list_id}",
            files=upload_files({"title": None} | selection),
            headers=auth_headers,
        )
        assert invalid_update.status_code == 422
        duplicate_metadata = await client.post(
            "/api/lists/",
            files=[
                ("metadata", (None, json.dumps({"title": "Twice"} | selection))),
                ("metadata", (None, json.dumps({"title": "Twice"} | selection))),
                ("file", ("cover.jpg", b"jpeg", "image/jpeg")),
            ],
            headers=auth_headers,
        )
        assert duplicate_metadata.status_code == 422
        denied = await client.put(
            f"/api/lists/{test_list.list_id}",
            files=upload_files(selection),
            headers=auth_headers_user2,
        )
        assert denied.status_code == 404
        missing = await client.put(
            f"/api/lists/{uuid.uuid4()}",
            files=upload_files(selection),
            headers=auth_headers,
        )
        assert missing.status_code == 404
        assert cover_storage[1] == []
        detail = await client.get(
            f"/api/lists/{test_list.list_id}", headers=auth_headers
        )
        assert detail.status_code == 200
        assert detail.json()["title"] == test_list.title
        assert detail.json()["cover_photo"] is None

    async def test_failed_upload_preserves_existing_cover(
        self,
        client: AsyncClient,
        test_user: User,
        auth_headers: dict,
        monkeypatch: MonkeyPatch,
        cover_storage,
    ):
        from app.services import cover_upload_service

        objects, events = cover_storage
        created = await create_uploaded_list(client, auth_headers)
        old_photo = created["cover_photo"]
        url = f"/api/lists/{created['list_id']}"
        user_id = str(test_user.user_id)
        events.clear()

        async def fail_upload(file, owner_id):
            events.append(("upload-failed", str(owner_id)))
            raise HTTPException(status_code=503, detail="Storage unavailable")

        monkeypatch.setattr(cover_upload_service, "create_upload", fail_upload)
        response = await client.put(
            url,
            files=upload_files(
                {"title": "Not saved", "cover_photo": {"source": "upload"}}
            ),
            headers=auth_headers,
        )
        assert response.status_code == 503
        assert events == [("upload-failed", user_id)]
        assert objects == {(user_id, old_photo["id"]): b"jpeg"}
        detail = await client.get(url, headers=auth_headers)
        assert detail.status_code == 200
        assert detail.json()["title"] == created["title"]
        assert detail.json()["cover_photo"] == old_photo

    @pytest.mark.parametrize("creating", [False, True])
    async def test_failed_commit_leaves_new_upload_for_orphan_cleanup(
        self,
        creating: bool,
        client: AsyncClient,
        test_user: User,
        auth_headers: dict,
        test_db: AsyncSession,
        monkeypatch: MonkeyPatch,
        cover_storage,
    ):
        objects, events = cover_storage
        created = await create_uploaded_list(client, auth_headers)
        old_photo = created["cover_photo"]
        url = f"/api/lists/{created['list_id']}"
        user_id = str(test_user.user_id)
        events.clear()

        async def fail_commit():
            events.append(("commit-failed",))
            raise RuntimeError("database commit failed")

        metadata = {"title": "Not saved", "cover_photo": {"source": "upload"}}
        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False),
            base_url="http://test",
        ) as failure_client:
            with monkeypatch.context() as patch:
                patch.setattr(test_db, "commit", fail_commit)
                if creating:
                    response = await failure_client.post(
                        "/api/lists/",
                        files=upload_files(metadata),
                        headers=auth_headers,
                    )
                else:
                    response = await failure_client.put(
                        url, files=upload_files(metadata), headers=auth_headers
                    )
        assert response.status_code == 500
        assert [event[0] for event in events] == ["create", "commit-failed"]
        new_photo = events[0][2]
        assert new_photo != old_photo
        assert objects == {
            (user_id, old_photo["id"]): b"jpeg",
            (user_id, new_photo["id"]): b"jpeg",
        }
        await test_db.rollback()
        detail = await client.get(url, headers=auth_headers)
        assert detail.status_code == 200
        assert detail.json()["title"] == created["title"]
        assert detail.json()["cover_photo"] == old_photo
        summaries = await client.get("/api/lists/", headers=auth_headers)
        assert summaries.status_code == 200
        assert all(row["title"] != "Not saved" for row in summaries.json())

    @pytest.mark.parametrize("creating", [False, True])
    async def test_lost_commit_acknowledgement_preserves_referenced_upload(
        self,
        creating: bool,
        client: AsyncClient,
        test_user: User,
        auth_headers: dict,
        test_db: AsyncSession,
        monkeypatch: MonkeyPatch,
        cover_storage,
    ):
        objects, events = cover_storage
        created = await create_uploaded_list(client, auth_headers)
        old_photo = created["cover_photo"]
        old_url = f"/api/lists/{created['list_id']}"
        user_id = str(test_user.user_id)
        events.clear()
        commit = test_db.commit

        async def commit_then_fail():
            await commit()
            events.append(("commit-acknowledgement-lost",))
            raise RuntimeError("database acknowledgement lost")

        metadata = {"title": "Possibly saved", "cover_photo": {"source": "upload"}}
        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False),
            base_url="http://test",
        ) as failure_client:
            with monkeypatch.context() as patch:
                patch.setattr(test_db, "commit", commit_then_fail)
                if creating:
                    response = await failure_client.post(
                        "/api/lists/",
                        files=upload_files(metadata),
                        headers=auth_headers,
                    )
                else:
                    response = await failure_client.put(
                        old_url, files=upload_files(metadata), headers=auth_headers
                    )

        assert response.status_code == 500
        assert [event[0] for event in events] == [
            "create",
            "commit-acknowledgement-lost",
        ]
        new_photo = events[0][2]
        assert objects == {
            (user_id, old_photo["id"]): b"jpeg",
            (user_id, new_photo["id"]): b"jpeg",
        }
        if creating:
            summaries = await client.get("/api/lists/", headers=auth_headers)
            assert summaries.status_code == 200
            saved = next(
                row for row in summaries.json() if row["title"] == "Possibly saved"
            )
            url = f"/api/lists/{saved['list_id']}"
        else:
            url = old_url
        detail = await client.get(url, headers=auth_headers)
        assert detail.status_code == 200
        assert detail.json()["title"] == "Possibly saved"
        assert detail.json()["cover_photo"] == new_photo
        photo = await client.get(
            f"{url}/cover-photo/{new_photo['id']}", headers=auth_headers
        )
        assert photo.status_code == 200
        assert photo.content == b"jpeg"

    @pytest.mark.parametrize("action", ["replace", "clear", "delete"])
    async def test_cleanup_failure_after_commit_does_not_fail_request(
        self,
        action: str,
        client: AsyncClient,
        test_user: User,
        auth_headers: dict,
        test_db: AsyncSession,
        monkeypatch: MonkeyPatch,
        caplog: pytest.LogCaptureFixture,
        cover_storage,
    ):
        from app.services import cover_upload_service

        objects, events = cover_storage
        created = await create_uploaded_list(client, auth_headers)
        old_photo = created["cover_photo"]
        url = f"/api/lists/{created['list_id']}"
        user_id = str(test_user.user_id)
        events.clear()
        record_cover_commits(monkeypatch, test_db, events)

        async def fail_cleanup(owner_id, photo):
            events.append(("delete-failed", str(owner_id), photo))
            raise HTTPException(status_code=503, detail="Storage unavailable")

        monkeypatch.setattr(cover_upload_service, "delete_upload", fail_cleanup)
        caplog.clear()
        if action == "delete":
            response = await client.delete(url, headers=auth_headers)
            assert response.status_code == 204
            assert events == [("commit",), ("delete-failed", user_id, old_photo)]
            assert (await client.get(url, headers=auth_headers)).status_code == 404
        else:
            files = (
                upload_files({"cover_photo": {"source": "upload"}})
                if action == "replace"
                else metadata_files({"cover_photo": None})
            )
            response = await client.put(url, files=files, headers=auth_headers)
            assert response.status_code == 200
            new_photo = response.json()["cover_photo"]
            expected = [("create", user_id, new_photo)] if action == "replace" else []
            assert events == [
                *expected,
                ("commit",),
                ("delete-failed", user_id, old_photo),
            ]
            assert (new_photo is not None) == (action == "replace")
            detail = await client.get(url, headers=auth_headers)
            assert detail.status_code == 200
            assert detail.json()["cover_photo"] == new_photo
        assert objects[(user_id, old_photo["id"])] == b"jpeg"
        assert any(record.levelno >= logging.WARNING for record in caplog.records)


class TestListPhotoUnsplash:
    async def test_search_requires_authentication_and_trims_bounded_query_and_page(
        self, client: AsyncClient, auth_headers: dict, unsplash
    ):
        _, result, _, events = unsplash
        url = "/api/lists/cover-search"
        unauthenticated = await client.get(url, params={"query": "coffee"})
        assert unauthenticated.status_code == 401
        assert events == []

        response = await client.get(
            url, params={"query": "  coffee  "}, headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json() == {"results": [result], "has_more": True}
        assert events == [("search", "coffee", 1)]

        events.clear()
        for query, page in ((" x ", 1), (f"  {'x' * 100}  ", 100)):
            response = await client.get(
                url, params={"query": query, "page": page}, headers=auth_headers
            )
            assert response.status_code == 200
            assert response.json() == {"results": [result], "has_more": True}
        assert events == [("search", "x", 1), ("search", "x" * 100, 100)]

        events.clear()
        for params in (
            {},
            {"query": ""},
            {"query": "   "},
            {"query": "x" * 101},
            {"query": "x", "page": 0},
            {"query": "x", "page": 101},
            {"query": "x", "page": "invalid"},
        ):
            response = await client.get(url, params=params, headers=auth_headers)
            assert response.status_code == 422
        assert events == []

    @pytest.mark.parametrize("creating", [False, True])
    async def test_selection_uses_canonical_metadata_and_tracks_only_changes(
        self,
        creating: bool,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        unsplash,
    ):
        photo, _, location, events = unsplash
        selection = {"source": "unsplash", "id": photo["id"]}
        metadata = {"title": "Canonical selection", "cover_photo": selection}
        if creating:
            response = await client.post(
                "/api/lists/", files=metadata_files(metadata), headers=auth_headers
            )
        else:
            response = await client.put(
                f"/api/lists/{test_list.list_id}",
                files=metadata_files(metadata),
                headers=auth_headers,
            )
        assert response.status_code == 200
        created = response.json()
        assert created["cover"] is None
        assert created["cover_photo"] == photo
        assert events == [
            ("resolve", photo["id"]),
            ("track", photo["id"], location),
        ]

        url = f"/api/lists/{created['list_id']}"
        detail = await client.get(url, headers=auth_headers)
        summaries = await client.get("/api/lists/", headers=auth_headers)
        assert detail.status_code == 200
        assert summaries.status_code == 200
        assert detail.json()["cover_photo"] == photo
        summary = next(
            row for row in summaries.json() if row["list_id"] == created["list_id"]
        )
        assert summary["cover_photo"] == photo

        events.clear()
        retained = await client.put(
            url,
            files=metadata_files({"title": "Renamed", "cover_photo": selection}),
            headers=auth_headers,
        )
        assert retained.status_code == 200
        assert retained.json()["cover_photo"] == photo
        omitted = await client.put(
            url, files=metadata_files({"description": "Updated"}), headers=auth_headers
        )
        assert omitted.status_code == 200
        assert omitted.json()["cover_photo"] == photo
        assert events == []

    async def test_tracking_failure_preserves_existing_list_and_upload(
        self,
        client: AsyncClient,
        test_user: User,
        auth_headers: dict,
        monkeypatch: MonkeyPatch,
        cover_storage,
        unsplash,
    ):
        from app.services import unsplash_service

        objects, storage_events = cover_storage
        photo, _, location, provider_events = unsplash
        created = await create_uploaded_list(client, auth_headers)
        old_photo = created["cover_photo"]
        user_id = str(test_user.user_id)
        storage_events.clear()

        async def fail_tracking(photo_id, download_location):
            provider_events.append(("track-failed", photo_id, download_location))
            raise HTTPException(status_code=503, detail="Provider unavailable")

        monkeypatch.setattr(unsplash_service, "track_download", fail_tracking)
        url = f"/api/lists/{created['list_id']}"
        response = await client.put(
            url,
            files=metadata_files(
                {
                    "title": "Not saved",
                    "cover_photo": {"source": "unsplash", "id": photo["id"]},
                }
            ),
            headers=auth_headers,
        )
        assert response.status_code == 503
        assert provider_events == [
            ("resolve", photo["id"]),
            ("track-failed", photo["id"], location),
        ]
        assert storage_events == []
        assert objects == {(user_id, old_photo["id"]): b"jpeg"}
        detail = await client.get(url, headers=auth_headers)
        assert detail.status_code == 200
        assert detail.json()["title"] == created["title"]
        assert detail.json()["cover_photo"] == old_photo


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
