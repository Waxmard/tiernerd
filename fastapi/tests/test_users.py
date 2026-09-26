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
from app.core.security import verify_password
from app.crud import crud_user
from app.db.models import User
from app.schemas.user import UserCreate, UserUpdate
from app.settings import settings


@pytest.mark.asyncio
class TestUserCreation:
    """Tests for user creation endpoint."""

    async def test_create_user_success(
        self, client: AsyncClient, test_db: AsyncSession
    ):
        """Test successful user creation."""
        response = await client.post(
            "/api/users/",
            json={
                "email": "newuser@example.com",
                "username": "newuser",
                "password": "securepassword123",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["email"] == "newuser@example.com"
        assert data["username"] == "newuser"
        assert "user_id" in data
        assert "password" not in data
        assert "password_hash" not in data

        # Verify user was created in database
        result = await test_db.execute(
            select(User).where(User.email == "newuser@example.com")
        )
        db_user = result.scalar_one_or_none()
        assert db_user is not None
        assert db_user.email == "newuser@example.com"
        assert db_user.username == "newuser"
        assert db_user.password_hash is not None
        assert verify_password("securepassword123", db_user.password_hash)
        assert str(db_user.user_id) == data["user_id"]

    async def test_create_user_duplicate_email(
        self, client: AsyncClient, test_user: User, test_db: AsyncSession
    ):
        """Test user creation with duplicate email fails."""
        # Count users before attempt
        result = await test_db.execute(select(User))
        users_before = len(result.scalars().all())

        response = await client.post(
            "/api/users/",
            json={
                "email": test_user.email,
                "username": "differentusername",
                "password": "securepassword123",
            },
        )
        assert response.status_code == 400
        assert "email already exists" in response.json()["detail"].lower()

        # Verify no new user was created in database
        result = await test_db.execute(select(User))
        users_after = len(result.scalars().all())
        assert users_after == users_before

    async def test_create_user_invalid_email(self, client: AsyncClient):
        """Test user creation with invalid email fails."""
        response = await client.post(
            "/api/users/",
            json={
                "email": "notanemail",
                "username": "newuser",
                "password": "securepassword123",
            },
        )
        assert response.status_code == 422

    async def test_create_user_short_password(self, client: AsyncClient):
        """Test user creation with short password fails."""
        response = await client.post(
            "/api/users/",
            json={
                "email": "newuser@example.com",
                "username": "newuser",
                "password": "short",
            },
        )
        assert response.status_code == 422

    async def test_create_user_missing_fields(self, client: AsyncClient):
        """Test user creation with missing required fields fails."""
        response = await client.post(
            "/api/users/",
            json={
                "email": "newuser@example.com",
            },
        )
        assert response.status_code == 422


@pytest.mark.asyncio
class TestUserLogin:
    """Tests for user login endpoint."""

    async def test_login_success_with_email(self, client: AsyncClient, test_user: User):
        """Test successful login with email."""
        response = await client.post(
            "/api/users/token",
            data={
                "username": test_user.email,
                "password": "testpassword123",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    async def test_login_success_with_username(
        self, client: AsyncClient, test_user: User
    ):
        """Test successful login with username."""
        response = await client.post(
            "/api/users/token",
            data={
                "username": test_user.username,
                "password": "testpassword123",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    async def test_login_wrong_password(self, client: AsyncClient, test_user: User):
        """Test login with wrong password fails."""
        response = await client.post(
            "/api/users/token",
            data={
                "username": test_user.email,
                "password": "wrongpassword",
            },
        )
        assert response.status_code == 401
        assert "incorrect" in response.json()["detail"].lower()

    async def test_login_nonexistent_user(self, client: AsyncClient):
        """Test login with non-existent user fails."""
        response = await client.post(
            "/api/users/token",
            data={
                "username": "nonexistent@example.com",
                "password": "somepassword",
            },
        )
        assert response.status_code == 401

    async def test_login_username_fallback_to_email(
        self, client: AsyncClient, test_db: AsyncSession
    ):
        """Test login where username lookup misses and email lookup succeeds."""
        import uuid
        from datetime import datetime

        from app.core.security import get_password_hash

        # Create a user with a username that doesn't match their email
        user = User(
            user_id=uuid.uuid4(),
            email="fallback_test",  # Email without @ or . so username lookup runs first
            username="different_username",
            password_hash=get_password_hash("fallbackpassword123"),
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        test_db.add(user)
        await test_db.commit()

        # Login with the email value (which doesn't have @ or .)
        # This will try username lookup first (fail), then email lookup (succeed)
        response = await client.post(
            "/api/users/token",
            data={
                # Looks like a username, but is actually the email value
                "username": "fallback_test",
                "password": "fallbackpassword123",
            },
        )
        assert response.status_code == 200
        assert "access_token" in response.json()


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
        assert "password" not in user_data
        assert "password_hash" not in user_data

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
        assert "password" not in data
        assert "password_hash" not in data

    async def test_read_current_user_unauthenticated(self, client: AsyncClient):
        """Test reading current user without authentication fails."""
        response = await client.get("/api/users/me")
        assert response.status_code == 401

    async def test_read_current_user_invalid_token(self, client: AsyncClient):
        """Test reading current user with invalid token fails."""
        response = await client.get(
            "/api/users/me", headers={"Authorization": "Bearer invalid_token"}
        )
        assert response.status_code == 401

    async def test_read_current_user_token_missing_subject(self, client: AsyncClient):
        """Test reading current user with token missing 'sub' claim."""
        from datetime import datetime, timedelta

        from jose import jwt

        from app.settings import settings

        # Create a token without the 'sub' claim
        expire = datetime.now(UTC) + timedelta(minutes=30)
        to_encode = {"exp": expire}  # Missing 'sub' claim
        malformed_token = jwt.encode(
            to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM
        )

        response = await client.get(
            "/api/users/me", headers={"Authorization": f"Bearer {malformed_token}"}
        )
        assert response.status_code == 401

    async def test_read_current_user_after_user_deleted(
        self, client: AsyncClient, test_db: AsyncSession
    ):
        """Test accessing endpoint after user is deleted."""
        import uuid
        from datetime import datetime

        from app.core.security import get_password_hash
        from app.services.auth import create_access_token

        # Create a temporary user
        temp_user = User(
            user_id=uuid.uuid4(),
            email="temp@example.com",
            username="tempuser",
            password_hash=get_password_hash("temppassword123"),
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        test_db.add(temp_user)
        await test_db.commit()
        await test_db.refresh(temp_user)

        # Create token for this user
        token = create_access_token(subject=temp_user.user_id)

        # Delete the user
        await test_db.delete(temp_user)
        await test_db.commit()

        # Try to access endpoint with the token
        response = await client.get(
            "/api/users/me", headers={"Authorization": f"Bearer {token}"}
        )
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

    async def test_get_user_by_username_exists(
        self, test_db: AsyncSession, test_user: User
    ):
        """Test getting user by username that exists."""
        user = await crud_user.get_user_by_username(test_db, test_user.username)
        assert user is not None
        assert user.username == test_user.username
        assert user.user_id == test_user.user_id

    async def test_get_user_by_username_not_exists(self, test_db: AsyncSession):
        """Test getting user by username that doesn't exist."""
        user = await crud_user.get_user_by_username(test_db, "nonexistentuser")
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

    async def test_update_user_with_password(
        self, test_db: AsyncSession, test_user: User
    ):
        """Test updating user with new password."""
        old_password_hash = test_user.password_hash
        update_data = UserUpdate(password="newpassword123")
        updated_user = await crud_user.update_user(test_db, test_user, update_data)

        assert updated_user.password_hash != old_password_hash
        assert verify_password("newpassword123", updated_user.password_hash)

    async def test_update_user_partial(self, test_db: AsyncSession, test_user: User):
        """Test partial user update (only email)."""
        original_username = test_user.username
        update_data = UserUpdate(email="newemail@example.com")
        updated_user = await crud_user.update_user(test_db, test_user, update_data)

        assert updated_user.email == "newemail@example.com"
        assert updated_user.username == original_username

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
        user_data = UserCreate(
            email="crudtest@example.com",
            username="crudtestuser",
            password="testpassword123",
        )
        user = await crud_user.create_user(test_db, user_data)

        assert user.email == "crudtest@example.com"
        assert user.username == "crudtestuser"
        assert user.password_hash is not None
        assert verify_password("testpassword123", user.password_hash)
        assert user.user_id is not None
        assert user.created_at is not None
        assert user.updated_at is not None


@pytest.mark.asyncio
class TestUpdateCurrentUser:
    """Tests for updating current user endpoint."""

    async def test_update_current_user_email(
        self, client: AsyncClient, test_user: User, auth_headers: dict
    ):
        """Test updating current user email."""
        response = await client.put(
            "/api/users/me",
            json={"email": "updated@example.com"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "updated@example.com"

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

    async def test_update_current_user_password(
        self, client: AsyncClient, test_user: User, auth_headers: dict
    ):
        """Test updating current user password."""
        response = await client.put(
            "/api/users/me",
            json={"password": "newpassword123"},
            headers=auth_headers,
        )
        assert response.status_code == 200

        # Verify can login with new password
        login_response = await client.post(
            "/api/users/token",
            data={
                "username": test_user.email,
                "password": "newpassword123",
            },
        )
        assert login_response.status_code == 200
        assert "access_token" in login_response.json()

    async def test_update_current_user_unauthenticated(self, client: AsyncClient):
        """Test updating user without authentication fails."""
        response = await client.put(
            "/api/users/me",
            json={"email": "hacker@example.com"},
        )
        assert response.status_code == 401

    async def test_update_current_user_all_fields(
        self, client: AsyncClient, test_user: User, auth_headers: dict
    ):
        """Test updating all user fields at once."""
        response = await client.put(
            "/api/users/me",
            json={
                "email": "all@example.com",
                "username": "allupdated",
                "password": "allnewpass123",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "all@example.com"
        assert data["username"] == "allupdated"


@pytest.mark.asyncio
class TestGoogleLogin:
    """Tests for Google ID token login."""

    @staticmethod
    def _patch_verifier(monkeypatch, claims):
        monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "test-client-id")

        def fake_verify(_token: str) -> dict:
            if isinstance(claims, Exception):
                raise claims
            return claims

        monkeypatch.setattr(users_endpoint, "verify_google_id_token", fake_verify)

    async def test_google_login_creates_passwordless_user(
        self, client: AsyncClient, test_db: AsyncSession, monkeypatch
    ):
        """A new Google account is created with an unusable password."""
        self._patch_verifier(
            monkeypatch,
            {"email": "fresh.google@example.com", "email_verified": True},
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
        assert me.json()["email"] == "fresh.google@example.com"

        result = await test_db.execute(
            select(User).where(User.email == "fresh.google@example.com")
        )
        row = result.scalar_one()
        assert row.username is None
        assert not verify_password("anything", row.password_hash)

    async def test_google_login_existing_email_signs_into_that_account(
        self, client: AsyncClient, test_db: AsyncSession, monkeypatch
    ):
        """An existing password account with the same email is reused."""
        existing = await crud_user.create_user(
            test_db,
            UserCreate(
                email="existing.google@example.com",
                username="existinguser",
                password="existingpassword123",
            ),
        )
        self._patch_verifier(
            monkeypatch,
            {"email": "existing.google@example.com", "email_verified": True},
        )

        response = await client.post(
            "/api/users/google", json={"id_token": "google-id-token"}
        )

        assert response.status_code == 200
        result = await test_db.execute(
            select(User).where(User.email == "existing.google@example.com")
        )
        rows = result.scalars().all()
        assert len(rows) == 1

        me = await client.get(
            "/api/users/me",
            headers={"Authorization": f"Bearer {response.json()['access_token']}"},
        )
        assert me.json()["user_id"] == str(existing.user_id)

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
        monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", "")

        response = await client.post(
            "/api/users/google", json={"id_token": "google-id-token"}
        )

        assert response.status_code == 503
        assert response.json()["detail"] == GOOGLE_AUTH_NOT_CONFIGURED_ERROR
