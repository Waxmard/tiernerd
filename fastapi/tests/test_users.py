"""Tests for user endpoints and CRUD operations."""

from datetime import UTC

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.endpoints import users as users_endpoint
from app.core.constants import (
    GOOGLE_AUTH_NOT_CONFIGURED_ERROR,
    INVALID_GOOGLE_TOKEN_ERROR,
)
from app.crud import crud_user
from app.db.models import List as ListModel, User
from app.schemas.user import UserUpdate
from app.services.auth import create_access_token
from app.settings import get_settings


@pytest.mark.asyncio
@pytest.mark.parametrize("path", ["/api/users/", "/api/users/token"])
async def test_removed_user_endpoints(client: AsyncClient, path: str):
    response = await client.post(path)
    assert response.status_code in {404, 405}


@pytest.mark.asyncio
class TestReadUsers:
    """Tests for reading users endpoint."""

    async def test_read_users_authenticated(
        self,
        client: AsyncClient,
        admin_user: User,
        admin_auth_headers: dict,
        test_db: AsyncSession,
    ):
        """Test reading users list when authenticated as admin."""
        response = await client.get("/api/users/", headers=admin_auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) >= 1

        # Verify user data structure
        user_data = data[0]
        assert "user_id" in user_data
        assert "email" in user_data

        # Verify data matches database
        result = await test_db.execute(select(User))
        db_users = result.scalars().all()
        assert len(data) == len(db_users)

        # Verify the admin_user is in the response
        user_ids_in_response = [u["user_id"] for u in data]
        assert str(admin_user.user_id) in user_ids_in_response

    async def test_read_users_non_admin_forbidden(
        self,
        client: AsyncClient,
        test_user: User,
        auth_headers: dict,
    ):
        """Test reading users list as non-admin returns 403."""
        response = await client.get("/api/users/", headers=auth_headers)
        assert response.status_code == 403
        assert response.json()["detail"] == "Admin access required"

    async def test_read_users_unauthenticated(self, client: AsyncClient):
        """Test reading users list without authentication fails."""
        response = await client.get("/api/users/")
        assert response.status_code == 401

    async def test_read_users_pagination(
        self,
        client: AsyncClient,
        admin_user: User,
        test_user: User,
        admin_auth_headers: dict,
        test_db: AsyncSession,
    ):
        """Test users pagination."""
        # Verify we have 2 users in database (admin_user and test_user)
        result = await test_db.execute(select(User))
        db_users = result.scalars().all()
        assert len(db_users) == 2

        # Test with limit
        response = await client.get("/api/users/?limit=1", headers=admin_auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1

        # Test with skip
        response = await client.get("/api/users/?skip=1", headers=admin_auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1  # Should return 1 user (total 2 - skip 1)


@pytest.mark.asyncio
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


@pytest.mark.asyncio
class TestUserCRUD:
    """Tests for user CRUD operations."""

    async def test_get_user_by_email_exists(
        self, test_db: AsyncSession, test_user: User
    ):
        """Test getting user by email that exists."""
        user = await crud_user.get_user_by_email(test_db, test_user.email)
        assert user is not None
        assert user.email == test_user.email
        assert user.user_id == test_user.user_id

    async def test_get_user_by_email_not_exists(self, test_db: AsyncSession):
        """Test getting user by email that doesn't exist."""
        user = await crud_user.get_user_by_email(test_db, "nonexistent@example.com")
        assert user is None

    async def test_get_user_by_id_exists(self, test_db: AsyncSession, test_user: User):
        """Test getting user by ID that exists."""
        user = await crud_user.get_user_by_id(test_db, test_user.user_id)
        assert user is not None
        assert user.user_id == test_user.user_id

    async def test_get_user_by_id_not_exists(self, test_db: AsyncSession):
        """Test getting user by ID that doesn't exist."""
        import uuid

        fake_id = uuid.uuid4()
        user = await crud_user.get_user_by_id(test_db, fake_id)
        assert user is None

    async def test_update_user_username_only(
        self, test_db: AsyncSession, test_user: User
    ):
        """Test updating only username."""
        original_email = test_user.email
        update_data = UserUpdate(username="newusername")
        updated_user = await crud_user.update_user(test_db, test_user, update_data)

        assert updated_user.username == "newusername"
        assert updated_user.email == original_email

    async def test_delete_user_success(self, test_db: AsyncSession, test_user: User):
        """Test deleting a user."""
        user_id = test_user.user_id

        # Verify user exists before deletion
        user = await crud_user.get_user_by_id(test_db, user_id)
        assert user is not None

        # Delete the user
        await crud_user.delete_user(test_db, user_id)

        # Verify user is deleted
        user = await crud_user.get_user_by_id(test_db, user_id)
        assert user is None

    async def test_delete_user_nonexistent(self, test_db: AsyncSession):
        """Test deleting a user that doesn't exist (should not raise)."""
        import uuid

        fake_id = uuid.uuid4()
        # Should not raise any exception
        await crud_user.delete_user(test_db, fake_id)

    async def test_create_user_crud(self, test_db: AsyncSession):
        """Test creating user via CRUD function."""
        user = await crud_user.create_user(
            test_db,
            email="crudtest@example.com",
            username="crudtestuser",
            photo_url="https://example.com/photo.png",
        )

        assert user.email == "crudtest@example.com"
        assert user.username == "crudtestuser"
        assert user.photo_url == "https://example.com/photo.png"
        assert user.user_id is not None
        assert user.created_at is not None
        assert user.updated_at is not None


@pytest.mark.asyncio
class TestUpdateCurrentUser:
    """Tests for updating current user endpoint."""

    @pytest.mark.parametrize(
        "payload",
        [
            {"email": "updated@example.com"},
            {"email": "updated@example.com", "username": "changedusername"},
        ],
    )
    async def test_update_current_user_rejects_email(
        self,
        client: AsyncClient,
        test_db: AsyncSession,
        test_user: User,
        auth_headers: dict,
        payload: dict[str, str],
    ):
        original_id = test_user.user_id
        original_email = test_user.email
        original_username = test_user.username
        response = await client.put("/api/users/me", json=payload, headers=auth_headers)
        assert response.status_code == 422
        await test_db.refresh(test_user)
        assert test_user.user_id == original_id
        assert test_user.email == original_email
        assert test_user.username == original_username

    async def test_update_current_user_username(
        self, client: AsyncClient, test_user: User, auth_headers: dict
    ):
        """Test updating current user username."""
        response = await client.put(
            "/api/users/me",
            json={"username": "newusername"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "newusername"

    @pytest.mark.parametrize(
        ("field", "value"),
        [
            ("password", "newpassword123"),
            ("password", None),
            ("password_hash", "forged-hash"),
            ("photo_url", "https://example.com/forged.png"),
            ("photo_url", None),
        ],
    )
    async def test_update_current_user_rejects_protected_fields(
        self,
        client: AsyncClient,
        test_db: AsyncSession,
        test_user: User,
        auth_headers: dict,
        field: str,
        value: str | None,
    ):
        picture = "https://example.com/original.png"
        test_user.photo_url = picture
        await test_db.commit()
        original_email = test_user.email
        original_username = test_user.username
        response = await client.put(
            "/api/users/me",
            json={"username": "changedusername", field: value},
            headers=auth_headers,
        )
        assert response.status_code == 422
        me = await client.get("/api/users/me", headers=auth_headers)
        assert me.status_code == 200
        assert me.json()["email"] == original_email
        assert me.json()["username"] == original_username
        assert me.json()["photo_url"] == picture

    async def test_update_current_user_unauthenticated(self, client: AsyncClient):
        """Test updating user without authentication fails."""
        response = await client.put(
            "/api/users/me",
            json={"email": "hacker@example.com"},
        )
        assert response.status_code == 401


@pytest.mark.asyncio
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
