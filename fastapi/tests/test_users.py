"""Tests for user endpoints and CRUD operations."""

import logging
import uuid
from datetime import UTC

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from pytest import MonkeyPatch
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.endpoints import users as users_endpoint
from app.core.constants import (
    GOOGLE_AUTH_NOT_CONFIGURED_ERROR,
    INVALID_GOOGLE_TOKEN_ERROR,
)
from app.db.models import List as ListModel, User
from app.services.auth import create_access_token
from app.settings import get_settings


class TestReadCurrentUser:
    """Tests for reading current user endpoint."""

    async def test_read_current_user_success(
        self, client: AsyncClient, test_user: User, auth_headers: dict
    ):
        """Test reading current user info when authenticated."""
        response = await client.get("/api/users/me", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == test_user.email
        assert data["username"] == test_user.username
        assert str(data["user_id"]) == str(test_user.user_id)

    @pytest.mark.parametrize(
        "authorization",
        [
            None,
            "",
            "Bearer",
            "Bearer ",
            "Bearer invalid_token",
            "Bearer too many parts",
            "Bearer {token} extra",
            "Basic {token}",
            "{token}",
        ],
    )
    async def test_read_current_user_rejects_invalid_authorization(
        self, client: AsyncClient, auth_headers: dict, authorization: str | None
    ):
        token = auth_headers["Authorization"].removeprefix("Bearer ")
        headers = (
            {}
            if authorization is None
            else {"Authorization": authorization.replace("{token}", token)}
        )
        response = await client.get("/api/users/me", headers=headers)
        assert response.status_code == 401
        assert response.headers["WWW-Authenticate"] == "Bearer"

    async def test_read_current_user_token_missing_subject(self, client: AsyncClient):
        """Test reading current user with token missing 'sub' claim."""
        from datetime import datetime, timedelta

        from jose import jwt

        from app.settings import get_settings

        # Create a token without the 'sub' claim
        expire = datetime.now(UTC) + timedelta(minutes=30)
        to_encode = {"exp": expire}  # Missing 'sub' claim
        malformed_token = jwt.encode(
            to_encode, get_settings().SECRET_KEY, algorithm=get_settings().ALGORITHM
        )

        response = await client.get(
            "/api/users/me", headers={"Authorization": f"Bearer {malformed_token}"}
        )
        assert response.status_code == 401
        assert response.headers["WWW-Authenticate"] == "Bearer"

    async def test_read_current_user_token_with_non_uuid_subject(
        self, client: AsyncClient
    ):
        token = create_access_token(subject="not-a-uuid")
        response = await client.get(
            "/api/users/me", headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 401
        assert response.headers["WWW-Authenticate"] == "Bearer"

    async def test_read_current_user_after_user_deleted(
        self,
        client: AsyncClient,
        test_db: AsyncSession,
        test_user: User,
        auth_headers: dict,
    ):
        await test_db.delete(test_user)
        await test_db.commit()
        response = await client.get("/api/users/me", headers=auth_headers)
        assert response.status_code == 401

    async def test_update_current_user_is_not_allowed(
        self, client: AsyncClient, test_user: User, auth_headers: dict
    ):
        original_username = test_user.username
        response = await client.put(
            "/api/users/me", json={"username": "newusername"}, headers=auth_headers
        )
        assert response.status_code == 405
        me = await client.get("/api/users/me", headers=auth_headers)
        assert me.json()["username"] == original_username


class TestGoogleLogin:
    """Tests for Google ID token login."""

    @staticmethod
    def _patch_verifier(monkeypatch, claims):
        monkeypatch.setattr(get_settings(), "GOOGLE_CLIENT_ID", "test-client-id")

        def fake_verify(_token: str) -> dict:
            if isinstance(claims, Exception):
                raise claims
            return claims

        monkeypatch.setattr(users_endpoint, "verify_google_id_token", fake_verify)

    async def test_google_login_creates_user_with_picture(
        self, client: AsyncClient, test_db: AsyncSession, monkeypatch
    ):
        picture = "https://images.example.com/fresh.png"
        self._patch_verifier(
            monkeypatch,
            {
                "email": "fresh.google@example.com",
                "email_verified": True,
                "picture": picture,
            },
        )

        response = await client.post(
            "/api/users/google", json={"id_token": "google-id-token"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["token_type"] == "bearer"
        assert data["access_token"]

        me = await client.get(
            "/api/users/me",
            headers={"Authorization": f"Bearer {data['access_token']}"},
        )
        assert me.status_code == 200
        assert me.json()["email"] == "fresh.google@example.com"
        assert me.json()["username"] is None
        assert me.json()["photo_url"] == picture

        result = await test_db.execute(
            select(User).where(User.email == "fresh.google@example.com")
        )
        row = result.scalar_one()
        await test_db.refresh(row)
        assert str(row.user_id) == me.json()["user_id"]
        assert row.username is None
        assert row.photo_url == picture

    async def test_google_login_reuses_account_list_and_replaces_picture(
        self,
        client: AsyncClient,
        test_db: AsyncSession,
        test_user: User,
        test_list: ListModel,
        auth_headers: dict,
        monkeypatch,
    ):
        user_id = str(test_user.user_id)
        username = test_user.username
        claims = {
            "email": test_user.email,
            "email_verified": True,
            "picture": "https://images.example.com/first.png",
        }
        self._patch_verifier(monkeypatch, claims)

        first = await client.post(
            "/api/users/google", json={"id_token": "google-id-token"}
        )
        assert first.status_code == 200
        first_me = await client.get(
            "/api/users/me",
            headers={"Authorization": f"Bearer {first.json()['access_token']}"},
        )
        assert first_me.status_code == 200
        assert first_me.json()["user_id"] == user_id
        assert first_me.json()["username"] == username
        assert first_me.json()["photo_url"] == claims["picture"]

        claims["picture"] = "https://images.example.com/replacement.png"
        second = await client.post(
            "/api/users/google", json={"id_token": "google-id-token"}
        )
        assert second.status_code == 200
        headers = {"Authorization": f"Bearer {second.json()['access_token']}"}
        me = await client.get("/api/users/me", headers=headers)
        assert me.status_code == 200
        assert me.json()["user_id"] == user_id
        assert me.json()["username"] == username
        assert me.json()["photo_url"] == claims["picture"]

        old_me = await client.get("/api/users/me", headers=auth_headers)
        assert old_me.status_code == 200
        assert old_me.json()["user_id"] == user_id
        assert old_me.json()["username"] == username
        assert old_me.json()["photo_url"] == claims["picture"]

        lists = await client.get("/api/lists/", headers=headers)
        assert lists.status_code == 200
        assert [item["list_id"] for item in lists.json()] == [str(test_list.list_id)]
        old_lists = await client.get("/api/lists/", headers=auth_headers)
        assert old_lists.status_code == 200
        assert [item["list_id"] for item in old_lists.json()] == [
            str(test_list.list_id)
        ]
        result = await test_db.execute(
            select(User).where(User.email == claims["email"])
        )
        rows = result.scalars().all()
        assert len(rows) == 1
        await test_db.refresh(rows[0])
        assert str(rows[0].user_id) == user_id
        assert rows[0].photo_url == claims["picture"]

    @pytest.mark.parametrize("existing", [False, True], ids=["new", "existing"])
    @pytest.mark.parametrize(
        "picture_claim",
        [
            pytest.param({}, id="missing"),
            pytest.param({"picture": None}, id="null"),
            pytest.param({"picture": ""}, id="empty"),
            pytest.param({"picture": 123}, id="non-string"),
            pytest.param({"picture": []}, id="list"),
            pytest.param({"picture": "not a url"}, id="malformed"),
            pytest.param({"picture": "https:///image.png"}, id="missing-host"),
            pytest.param({"picture": "https://[bad"}, id="malformed-ipv6"),
            pytest.param(
                {"picture": "https://exa mple.com/image.png"}, id="invalid-host"
            ),
            pytest.param(
                {"picture": "https://example.com/a\nb.png"}, id="embedded-newline"
            ),
            pytest.param(
                {"picture": "https://example.com:not-a-port/image.png"},
                id="non-numeric-port",
            ),
            pytest.param(
                {"picture": "https://example.com:99999/image.png"},
                id="out-of-range-port",
            ),
            pytest.param({"picture": "http://example.com/image.png"}, id="http"),
            pytest.param(
                {"picture": "https://user:pass@example.com/image.png"},
                id="credentials",
            ),
            pytest.param(
                {"picture": "https://user@example.com/image.png"}, id="username"
            ),
        ],
    )
    async def test_google_login_discards_invalid_picture(
        self,
        client: AsyncClient,
        test_db: AsyncSession,
        test_user: User,
        monkeypatch,
        picture_claim: dict,
        existing: bool,
    ):
        if existing:
            test_user.photo_url = "https://images.example.com/original.png"
            await test_db.commit()
        email = test_user.email if existing else "fresh.google@example.com"
        self._patch_verifier(
            monkeypatch,
            {"email": email, "email_verified": True} | picture_claim,
        )
        response = await client.post(
            "/api/users/google", json={"id_token": "google-id-token"}
        )
        assert response.status_code == 200
        me = await client.get(
            "/api/users/me",
            headers={"Authorization": f"Bearer {response.json()['access_token']}"},
        )
        assert me.status_code == 200
        assert me.json()["email"] == email
        assert me.json()["photo_url"] is None
        result = await test_db.execute(select(User).where(User.email == email))
        row = result.scalar_one()
        await test_db.refresh(row)
        assert row.photo_url is None

    async def test_google_login_unverified_email_rejected(
        self, client: AsyncClient, monkeypatch
    ):
        """An unverified Google email claim is refused."""
        self._patch_verifier(
            monkeypatch,
            {"email": "unverified@example.com", "email_verified": False},
        )

        response = await client.post(
            "/api/users/google", json={"id_token": "google-id-token"}
        )

        assert response.status_code == 401
        assert response.json()["detail"] == INVALID_GOOGLE_TOKEN_ERROR

    async def test_google_login_missing_email_rejected(
        self, client: AsyncClient, monkeypatch
    ):
        """A token without an email claim is refused."""
        self._patch_verifier(monkeypatch, {"email_verified": True})

        response = await client.post(
            "/api/users/google", json={"id_token": "google-id-token"}
        )

        assert response.status_code == 401
        assert response.json()["detail"] == INVALID_GOOGLE_TOKEN_ERROR

    async def test_google_login_invalid_token_rejected(
        self, client: AsyncClient, monkeypatch
    ):
        """A token google-auth rejects yields 401, not 500."""
        self._patch_verifier(monkeypatch, ValueError("Token has wrong audience"))

        response = await client.post(
            "/api/users/google", json={"id_token": "google-id-token"}
        )

        assert response.status_code == 401
        assert response.json()["detail"] == INVALID_GOOGLE_TOKEN_ERROR

    async def test_google_login_unconfigured_client_id(
        self, client: AsyncClient, monkeypatch
    ):
        """Without a configured client ID the endpoint refuses to verify."""
        monkeypatch.setattr(get_settings(), "GOOGLE_CLIENT_ID", "")

        response = await client.post(
            "/api/users/google", json={"id_token": "google-id-token"}
        )

        assert response.status_code == 503
        assert response.json()["detail"] == GOOGLE_AUTH_NOT_CONFIGURED_ERROR


PHOTO = {"file": ("photo.jpg", b"jpeg", "image/jpeg")}


@pytest.fixture
def photo_storage(monkeypatch: MonkeyPatch):
    from app.services import cover_upload_service

    objects = {}
    events = []

    async def create_upload(file, user_id):
        photo_id = uuid.uuid4()
        objects[(str(user_id), str(photo_id))] = await file.read()
        events.append(("create", str(user_id), photo_id))
        return photo_id

    async def read_upload(user_id, photo_id):
        events.append(("read", str(user_id), photo_id))
        return objects.get((str(user_id), str(photo_id)))

    async def delete_upload(user_id, photo_id):
        events.append(("delete", str(user_id), photo_id))
        objects.pop((str(user_id), str(photo_id)), None)

    monkeypatch.setattr(cover_upload_service, "create_upload", create_upload)
    monkeypatch.setattr(cover_upload_service, "read_upload", read_upload)
    monkeypatch.setattr(cover_upload_service, "delete_upload", delete_upload)
    return objects, events


class TestBackgroundPhoto:
    async def test_upload_sets_id_and_serves_private_bytes(
        self, client: AsyncClient, auth_headers: dict, photo_storage
    ):
        response = await client.put(
            "/api/users/me/background", files=PHOTO, headers=auth_headers
        )
        assert response.status_code == 200
        photo_id = response.json()["background_photo_id"]
        assert photo_id is not None
        me = await client.get("/api/users/me", headers=auth_headers)
        assert me.json()["background_photo_id"] == photo_id

        photo = await client.get(
            f"/api/users/me/background/{photo_id}", headers=auth_headers
        )
        assert photo.status_code == 200
        assert photo.content == b"jpeg"
        assert photo.headers["content-type"] == "image/jpeg"
        assert {"private", "no-store"} <= {
            value.strip().lower() for value in photo.headers["cache-control"].split(",")
        }

    async def test_replace_deletes_previous_photo(
        self, client: AsyncClient, auth_headers: dict, test_user: User, photo_storage
    ):
        objects, _ = photo_storage
        user_id = str(test_user.user_id)
        first = (
            await client.put(
                "/api/users/me/background", files=PHOTO, headers=auth_headers
            )
        ).json()["background_photo_id"]
        second = (
            await client.put(
                "/api/users/me/background", files=PHOTO, headers=auth_headers
            )
        ).json()["background_photo_id"]
        assert second != first
        assert (user_id, first) not in objects
        assert (user_id, second) in objects
        stale = await client.get(
            f"/api/users/me/background/{first}", headers=auth_headers
        )
        assert stale.status_code == 404

    async def test_clear_is_idempotent(
        self, client: AsyncClient, auth_headers: dict, test_user: User, photo_storage
    ):
        objects, events = photo_storage
        await client.put("/api/users/me/background", files=PHOTO, headers=auth_headers)
        cleared = await client.delete("/api/users/me/background", headers=auth_headers)
        assert cleared.status_code == 200
        assert cleared.json()["background_photo_id"] is None
        assert objects == {}
        events.clear()

        again = await client.delete("/api/users/me/background", headers=auth_headers)
        assert again.status_code == 200
        assert again.json()["background_photo_id"] is None
        assert events == []

    async def test_read_is_limited_to_the_current_photo_of_its_owner(
        self,
        client: AsyncClient,
        auth_headers: dict,
        auth_headers_user2: dict,
        test_user: User,
        photo_storage,
    ):
        objects, _ = photo_storage
        photo_id = (
            await client.put(
                "/api/users/me/background", files=PHOTO, headers=auth_headers
            )
        ).json()["background_photo_id"]
        url = f"/api/users/me/background/{photo_id}"
        assert (await client.get(url)).status_code == 401
        assert (await client.get(url, headers=auth_headers_user2)).status_code == 404
        random = f"/api/users/me/background/{uuid.uuid4()}"
        assert (await client.get(random, headers=auth_headers)).status_code == 404
        del objects[(str(test_user.user_id), photo_id)]
        assert (await client.get(url, headers=auth_headers)).status_code == 404

    async def test_failed_upload_keeps_previous_photo(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_user: User,
        photo_storage,
        monkeypatch: MonkeyPatch,
    ):
        from app.services import cover_upload_service

        objects, _ = photo_storage
        first = (
            await client.put(
                "/api/users/me/background", files=PHOTO, headers=auth_headers
            )
        ).json()["background_photo_id"]

        async def fail_upload(file, user_id):
            raise HTTPException(status_code=503, detail="Storage unavailable")

        monkeypatch.setattr(cover_upload_service, "create_upload", fail_upload)
        response = await client.put(
            "/api/users/me/background", files=PHOTO, headers=auth_headers
        )
        assert response.status_code == 503
        me = await client.get("/api/users/me", headers=auth_headers)
        assert me.json()["background_photo_id"] == first
        assert list(objects) == [(str(test_user.user_id), first)]

    @pytest.mark.parametrize("action", ["replace", "clear"])
    async def test_cleanup_failure_does_not_fail_request(
        self,
        action: str,
        client: AsyncClient,
        auth_headers: dict,
        photo_storage,
        monkeypatch: MonkeyPatch,
        caplog: pytest.LogCaptureFixture,
    ):
        from app.services import cover_upload_service

        first = (
            await client.put(
                "/api/users/me/background", files=PHOTO, headers=auth_headers
            )
        ).json()["background_photo_id"]

        async def fail_cleanup(user_id, photo_id):
            raise HTTPException(status_code=503, detail="Storage unavailable")

        monkeypatch.setattr(cover_upload_service, "delete_upload", fail_cleanup)
        caplog.clear()
        if action == "replace":
            response = await client.put(
                "/api/users/me/background", files=PHOTO, headers=auth_headers
            )
            assert response.json()["background_photo_id"] not in (None, first)
        else:
            response = await client.delete(
                "/api/users/me/background", headers=auth_headers
            )
            assert response.json()["background_photo_id"] is None
        assert response.status_code == 200
        assert any(record.levelno >= logging.WARNING for record in caplog.records)

    async def test_writes_require_authentication_and_a_file(
        self, client: AsyncClient, auth_headers: dict, photo_storage
    ):
        assert (
            await client.put("/api/users/me/background", files=PHOTO)
        ).status_code == 401
        assert (await client.delete("/api/users/me/background")).status_code == 401
        missing = await client.put(
            "/api/users/me/background",
            files={"other": ("photo.jpg", b"jpeg", "image/jpeg")},
            headers=auth_headers,
        )
        assert missing.status_code == 422

    async def test_background_upload_bounds_multipart_stream(
        self,
        client: AsyncClient,
        auth_headers: dict,
        monkeypatch: MonkeyPatch,
        photo_storage,
    ):
        from starlette import formparsers

        boundary = "background-boundary"
        prefix = (
            b"--background-boundary\r\n"
            b'Content-Disposition: form-data; name="file"; filename="photo.jpg"\r\n'
            b"Content-Type: image/jpeg\r\n\r\n"
        )
        suffix = b"\r\n--background-boundary--\r\n"
        image = b"x" * 2048
        body = prefix + image + suffix
        monkeypatch.setattr(users_endpoint, "MAX_USER_WRITE_BYTES", len(body))
        url = "/api/users/me/background"
        content_type = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
        events = photo_storage[1]

        unauthorized = await client.put(url, headers=content_type, content=body)
        assert unauthorized.status_code == 401
        assert events == []

        headers = content_type | auth_headers
        accepted = await client.put(url, headers=headers, content=body)
        assert accepted.status_code == 200
        assert accepted.json()["background_photo_id"] is not None
        recorded = events.copy()

        oversized = await client.put(
            url, headers=headers, content=prefix + image + b"x" + suffix
        )
        assert oversized.status_code == 413
        assert oversized.request.headers["content-length"] == str(len(body) + 1)
        assert events == recorded

        read_early = []

        async def unexpected_read():
            read_early.append(True)
            yield body

        rejected_early = await client.put(
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

        oversized_stream = await client.put(url, headers=headers, content=stream())
        assert oversized_stream.status_code == 413
        assert oversized_stream.request.headers["transfer-encoding"] == "chunked"
        assert "content-length" not in oversized_stream.request.headers
        assert consumed == [len(chunk) for chunk in chunks[:3]]
        assert len(spooled) == 1
        assert spooled[0].closed
        assert events == recorded

    async def test_maximum_upload_is_accepted(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_user: User,
        photo_storage,
    ):
        from app.services.cover_upload_service import MAX_UPLOAD_BYTES

        response = await client.put(
            "/api/users/me/background",
            files={"file": ("photo.jpg", b"x" * MAX_UPLOAD_BYTES, "image/jpeg")},
            headers=auth_headers,
        )
        assert response.status_code == 200
        photo_id = response.json()["background_photo_id"]
        assert len(photo_storage[0][(str(test_user.user_id), photo_id)]) == (
            MAX_UPLOAD_BYTES
        )

    async def test_upload_over_image_limit_is_rejected(
        self, client: AsyncClient, auth_headers: dict
    ):
        from app.services.cover_upload_service import MAX_UPLOAD_BYTES

        response = await client.put(
            "/api/users/me/background",
            files={"file": ("photo.jpg", b"x" * (MAX_UPLOAD_BYTES + 1), "image/jpeg")},
            headers=auth_headers,
        )
        assert response.status_code == 413
        assert response.json()["detail"] == "Image exceeds 10 MiB"
