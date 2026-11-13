import json
import uuid
from datetime import UTC, datetime

from httpx import AsyncClient
from pytest import MonkeyPatch
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Item as ItemModel, List as ListModel, User


def metadata_files(metadata: dict) -> dict:
    return {"metadata": (None, json.dumps(metadata))}


class TestReadLists:
    async def test_read_lists_unauthenticated(self, client: AsyncClient):
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
        response = await client.post(
            "/api/lists/",
            files=metadata_files(
                {"title": test_list.title, "description": "Different description"}
            ),
            headers=auth_headers,
        )
        assert response.status_code == 409
        assert "already exists" in response.json()["detail"].lower()

    async def test_create_list_ignores_retired_color(
        self, client: AsyncClient, auth_headers: dict
    ):
        response = await client.post(
            "/api/lists/",
            files=metadata_files({"title": "Colored", "color": "teal"}),
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert "color" not in response.json()

        lists = await client.get("/api/lists/", headers=auth_headers)
        assert lists.status_code == 200
        assert all("color" not in row for row in lists.json())

    async def test_create_list_with_icon_round_trips_through_the_api(
        self, client: AsyncClient, auth_headers: dict
    ):
        uncolored = await client.post(
            "/api/lists/",
            files=metadata_files(
                {"title": "Uncolored List", "description": "No swatch"}
            ),
            headers=auth_headers,
        )
        assert uncolored.status_code == 200
        assert uncolored.json()["icon"] is None

        styled = await client.post(
            "/api/lists/",
            files=metadata_files(
                {
                    "title": "Immersive List",
                    "description": "With icon",
                    "icon": "🚀",
                }
            ),
            headers=auth_headers,
        )
        assert styled.status_code == 200
        styled_data = styled.json()
        assert "color" not in styled_data
        assert styled_data["icon"] == "🚀"

        detail = await client.get(
            f"/api/lists/{styled_data['list_id']}", headers=auth_headers
        )
        assert detail.status_code == 200
        assert "color" not in detail.json()
        assert detail.json()["icon"] == "🚀"

        summaries = await client.get("/api/lists/", headers=auth_headers)
        assert summaries.status_code == 200
        summary = next(
            row for row in summaries.json() if row["list_id"] == styled_data["list_id"]
        )
        assert "color" not in summary
        assert summary["icon"] == "🚀"

        for bad_metadata in (
            {"title": "Bad Icon", "description": "", "icon": "x" * 17},
            {"title": "Empty Icon", "description": "", "icon": ""},
            {"title": "Retired Cover", "description": "", "cover": "landscape"},
            {"title": "Retired Photo", "description": "", "cover_photo": None},
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
        response = await client.get(f"/api/lists/{test_list.list_id}")
        assert response.status_code == 401

    async def test_read_list_not_found(self, client: AsyncClient, auth_headers: dict):
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
        response = await client.get(
            f"/api/lists/{test_list.list_id}", headers=auth_headers_user2
        )
        assert response.status_code == 404


class TestUpdateList:
    async def test_update_list_text_length_limits(
        self, client: AsyncClient, test_list: ListModel, auth_headers: dict
    ):
        url = f"/api/lists/{test_list.list_id}"
        accepted = await client.put(
            url,
            files=metadata_files({"title": "x" * 60, "description": "y" * 500}),
            headers=auth_headers,
        )
        assert accepted.status_code == 200
        for invalid in ({"title": "x" * 61}, {"description": "y" * 501}):
            response = await client.put(
                url, files=metadata_files(invalid), headers=auth_headers
            )
            assert response.status_code == 422

    async def test_mode_switch_preserves_items(
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
        await test_db.commit()
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

        renamed = await client.put(
            url,
            files=metadata_files({"title": "Renamed"}),
            headers=auth_headers,
        )
        assert renamed.status_code == 200
        assert renamed.json()["ranking_mode"] == "rank"

        appearance = await client.put(
            url,
            files=metadata_files({"color": "coral", "icon": "heart"}),
            headers=auth_headers,
        )
        assert appearance.status_code == 200
        assert appearance.json()["ranking_mode"] == "rank"
        assert "color" not in appearance.json()
        assert appearance.json()["icon"] == "heart"
        after_appearance = await client.get(f"{url}/items", headers=auth_headers)
        assert after_appearance.json() == before

        cleared = await client.put(
            url,
            files=metadata_files({"icon": None}),
            headers=auth_headers,
        )
        assert cleared.status_code == 200
        assert cleared.json()["ranking_mode"] == "rank"
        assert cleared.json()["icon"] is None

        for invalid_payload in (
            {"icon": "x" * 17},
            {"icon": ""},
            {"cover": "landscape"},
            {"cover_photo": None},
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

    async def test_update_list_bumps_updated_at_and_reorders_by_recency(
        self,
        client: AsyncClient,
        test_user: User,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        older = ListModel(
            user_id=test_user.user_id,
            title="Older List",
            created_at=datetime(2026, 1, 1, 0, 0, 0),
            updated_at=datetime(2026, 1, 1, 0, 0, 0),
        )
        newer = ListModel(
            user_id=test_user.user_id,
            title="Newer List",
            created_at=datetime(2026, 1, 2, 0, 0, 0),
            updated_at=datetime(2026, 1, 2, 0, 0, 0),
        )
        test_db.add_all([older, newer])
        await test_db.commit()

        before = await client.get("/api/lists/", headers=auth_headers)
        assert before.status_code == 200
        assert [row["title"] for row in before.json()] == ["Newer List", "Older List"]

        update_resp = await client.put(
            f"/api/lists/{older.list_id}",
            files=metadata_files({"title": "Older Edited"}),
            headers=auth_headers,
        )
        assert update_resp.status_code == 200

        after = await client.get("/api/lists/", headers=auth_headers)
        assert after.status_code == 200
        assert [row["title"] for row in after.json()] == ["Older Edited", "Newer List"]

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
        response = await client.put(
            f"/api/lists/{test_list.list_id}",
            files=metadata_files({"title": "Updated Title"}),
        )
        assert response.status_code == 401

    async def test_update_list_not_found(self, client: AsyncClient, auth_headers: dict):
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
        response = await client.put(
            f"/api/lists/{test_list.list_id}",
            files=metadata_files({"title": "Trying to update"}),
            headers=auth_headers_user2,
        )
        assert response.status_code == 404


class TestListWriteFormats:
    async def test_multipart_requires_exactly_one_metadata_field(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
    ):
        requests = (
            (client.post, "/api/lists/", {"title": "Invalid multipart"}),
            (client.put, f"/api/lists/{test_list.list_id}", {}),
        )
        for request, url, base in requests:
            metadata = (None, json.dumps(base))
            image = ("cover.jpg", b"image", "image/jpeg")
            invalid_forms = (
                [("file", image)],
                [("metadata", metadata), ("metadata", metadata)],
                [("metadata", metadata), ("unexpected", (None, "value"))],
                [("metadata", ("metadata.json", json.dumps(base), "application/json"))],
            )
            for form in invalid_forms:
                response = await request(url, files=form, headers=auth_headers)
                assert response.status_code == 422

    async def test_legacy_create_query_preserves_validation_and_data(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
    ):
        params = {
            "name": "Cafés & tea",
            "description": "",
            "color": "teal",
            "ranking_mode": "rank",
        }
        denied = await client.post("/api/lists/", params=params)
        assert denied.status_code == 401

        created = await client.post("/api/lists/", params=params, headers=auth_headers)
        assert created.status_code == 200
        assert created.json()["title"] == params["name"]
        assert created.json()["description"] == ""
        assert "color" not in created.json()
        assert created.json()["ranking_mode"] == "rank"

        detail = await client.get(
            f"/api/lists/{created.json()['list_id']}", headers=auth_headers
        )
        assert detail.status_code == 200
        assert detail.json() == created.json()

        defaulted = await client.post(
            "/api/lists/",
            params={"name": "Default legacy list", "description": ""},
            headers=auth_headers,
        )
        assert defaulted.status_code == 200
        assert "color" not in defaulted.json()
        assert defaulted.json()["ranking_mode"] == "score"

        duplicate = await client.post(
            "/api/lists/",
            params={"name": test_list.title, "description": ""},
            headers=auth_headers,
        )
        assert duplicate.status_code == 409

        for invalid in (
            {"description": ""},
            {"name": "Missing description"},
            {"name": "", "description": ""},
            {"name": "x" * 61, "description": ""},
            {"name": "Long description", "description": "x" * 501},
            {"name": "Bad mode", "description": "", "ranking_mode": "other"},
        ):
            response = await client.post(
                "/api/lists/", params=invalid, headers=auth_headers
            )
            assert response.status_code == 422

    async def test_legacy_json_update_preserves_new_fields_and_validates(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        auth_headers_user2: dict,
        test_db: AsyncSession,
    ):
        test_list.icon = "heart"
        test_db.add(ListModel(user_id=test_list.user_id, title="Existing title"))
        await test_db.commit()
        url = f"/api/lists/{test_list.list_id}"

        denied = await client.put(url, json={"ranking_mode": "rank"})
        assert denied.status_code == 401
        other_user = await client.put(
            url, json={"ranking_mode": "rank"}, headers=auth_headers_user2
        )
        assert other_user.status_code == 404

        updated = await client.put(
            url,
            json={
                "title": "Legacy rename",
                "description": "Legacy description",
                "ranking_mode": "rank",
                "color": "pink",
            },
            headers=auth_headers,
        )
        assert updated.status_code == 200
        assert updated.json()["title"] == "Legacy rename"
        assert updated.json()["description"] == "Legacy description"
        assert updated.json()["ranking_mode"] == "rank"
        assert updated.json()["icon"] == "heart"

        partial = await client.put(
            url, json={"description": None}, headers=auth_headers
        )
        assert partial.status_code == 200
        assert partial.json()["description"] is None
        assert partial.json()["title"] == "Legacy rename"
        assert partial.json()["ranking_mode"] == "rank"

        for invalid in (
            {"title": ""},
            {"title": "x" * 61},
            {"description": "x" * 501},
            {"title": None},
            {"ranking_mode": None},
            {"ranking_mode": "other"},
            {"description": 123},
        ):
            response = await client.put(url, json=invalid, headers=auth_headers)
            assert response.status_code == 422
        duplicate = await client.put(
            url, json={"title": "Existing title"}, headers=auth_headers
        )
        assert duplicate.status_code == 409
        malformed = await client.put(
            url,
            content="{",
            headers=auth_headers | {"Content-Type": "application/json"},
        )
        assert malformed.status_code == 422
        wrong_type = await client.put(url, json=[], headers=auth_headers)
        assert wrong_type.status_code == 422

        detail = await client.get(url, headers=auth_headers)
        assert detail.status_code == 200
        assert detail.json() == partial.json()

    async def test_legacy_json_update_enforces_stream_size_limit(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        monkeypatch: MonkeyPatch,
    ):
        from app.api.endpoints import lists

        monkeypatch.setattr(lists, "MAX_LIST_WRITE_BYTES", 32)

        async def body():
            yield b'{"description":"'
            yield b"x" * 32
            yield b'"}'

        url = f"/api/lists/{test_list.list_id}"
        response = await client.put(
            url,
            content=body(),
            headers=auth_headers | {"Content-Type": "application/json"},
        )
        assert response.status_code == 413
        assert response.request.headers["transfer-encoding"] == "chunked"
        detail = await client.get(url, headers=auth_headers)
        assert detail.json()["description"] == test_list.description

    async def test_unsupported_list_write_formats_are_rejected(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
    ):
        original_title = test_list.title
        url = f"/api/lists/{test_list.list_id}"
        json_create = await client.post(
            "/api/lists/", json={"title": "Old JSON"}, headers=auth_headers
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
        assert json_create.status_code in (415, 422)
        assert query_update.status_code in (415, 422)
        detail = await client.get(url, headers=auth_headers)
        assert detail.status_code == 200
        assert detail.json()["title"] == original_title


class TestDeleteList:
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
        response = await client.delete(f"/api/lists/{test_list.list_id}")
        assert response.status_code == 401

    async def test_delete_list_not_found(self, client: AsyncClient, auth_headers: dict):
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
    async def test_read_list_items_returns_values_over_current_limits(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        test_db.add(
            ItemModel(list_id=test_list.list_id, name="x" * 100, description="y" * 600)
        )
        await test_db.commit()

        response = await client.get(
            f"/api/lists/{test_list.list_id}/items", headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()[0]["name"] == "x" * 100
        assert response.json()[0]["description"] == "y" * 600

    async def test_read_list_items_empty(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers: dict,
    ):
        response = await client.get(
            f"/api/lists/{test_list.list_id}/items", headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json() == []

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
        fake_id = uuid.uuid4()
        response = await client.get(f"/api/lists/{fake_id}/items", headers=auth_headers)
        assert response.status_code == 404

    async def test_read_list_items_wrong_user(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers_user2: dict,
    ):
        response = await client.get(
            f"/api/lists/{test_list.list_id}/items", headers=auth_headers_user2
        )
        assert response.status_code == 404

    async def test_read_list_items_unauthenticated(
        self,
        client: AsyncClient,
        test_list: ListModel,
    ):
        response = await client.get(f"/api/lists/{test_list.list_id}/items")
        assert response.status_code == 401


class TestCreateListClientId:
    async def test_created_list_uses_supplied_id(
        self, client: AsyncClient, auth_headers: dict
    ) -> None:
        list_id = str(uuid.uuid4())
        response = await client.post(
            "/api/lists/",
            files=metadata_files({"list_id": list_id, "title": "Offline list"}),
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json()["list_id"] == list_id

    async def test_retrying_the_same_id_returns_the_same_list(
        self, client: AsyncClient, auth_headers: dict
    ) -> None:
        list_id = str(uuid.uuid4())
        files = metadata_files({"list_id": list_id, "title": "Offline list"})
        first = await client.post("/api/lists/", files=files, headers=auth_headers)
        assert first.status_code == 200

        retry = await client.post(
            "/api/lists/",
            files=metadata_files({"list_id": list_id, "title": "Offline list"}),
            headers=auth_headers,
        )
        assert retry.status_code == 200
        assert retry.json() == first.json()

        lists = await client.get("/api/lists/", headers=auth_headers)
        assert [row["list_id"] for row in lists.json()] == [list_id]

    async def test_another_users_list_id_is_rejected(
        self,
        client: AsyncClient,
        test_list: ListModel,
        auth_headers_user2: dict,
    ) -> None:
        response = await client.post(
            "/api/lists/",
            files=metadata_files(
                {"list_id": str(test_list.list_id), "title": "Stolen id"}
            ),
            headers=auth_headers_user2,
        )
        assert response.status_code == 409
        assert response.json()["detail"] == "List ID already in use"
