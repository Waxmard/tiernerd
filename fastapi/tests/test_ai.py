"""Tests for the AI emoji suggestion endpoint and service."""

from typing import Any

import pytest
from httpx import AsyncClient
from pytest import MonkeyPatch
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.endpoints import ai as ai_endpoint
from app.core.constants import (
    AI_NOT_CONFIGURED_ERROR,
    AI_UNAVAILABLE_ERROR,
    LIST_NOT_FOUND_ERROR,
)
from app.db.models import List as ListModel
from app.services import emoji_suggestion, gemini, item_suggestion
from app.settings import get_settings


class TestSuggestEmojiEndpoint:
    @staticmethod
    def _configure(monkeypatch: MonkeyPatch, fake: Any) -> None:
        monkeypatch.setattr(get_settings(), "AI_PROJECT", "test-project")
        monkeypatch.setattr(ai_endpoint, "suggest_emojis", fake)

    async def test_returns_suggestion(
        self, client: AsyncClient, auth_headers: dict, monkeypatch: MonkeyPatch
    ):
        self._configure(
            monkeypatch,
            lambda name, kind, description, list_title: ("🍕", "🗽", "🤤"),
        )
        response = await client.post(
            "/api/ai/emoji",
            json={"name": "Pizza places", "kind": "list"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json() == {"emojis": ["🍕", "🗽", "🤤"]}

    async def test_not_configured(
        self, client: AsyncClient, auth_headers: dict, monkeypatch: MonkeyPatch
    ):
        monkeypatch.setattr(get_settings(), "AI_PROJECT", "")
        response = await client.post(
            "/api/ai/emoji", json={"name": "x", "kind": "item"}, headers=auth_headers
        )
        assert response.status_code == 503
        assert response.json()["detail"] == AI_NOT_CONFIGURED_ERROR

    async def test_failure_maps_to_unavailable(
        self, client: AsyncClient, auth_headers: dict, monkeypatch: MonkeyPatch
    ):
        def boom(name: str, kind: str, description: str, list_title: str) -> tuple:
            raise RuntimeError("boom")

        self._configure(monkeypatch, boom)
        response = await client.post(
            "/api/ai/emoji", json={"name": "x", "kind": "item"}, headers=auth_headers
        )
        assert response.status_code == 503
        assert response.json()["detail"] == AI_UNAVAILABLE_ERROR

    async def test_requires_auth(self, client: AsyncClient):
        response = await client.post(
            "/api/ai/emoji", json={"name": "x", "kind": "item"}
        )
        assert response.status_code == 401

    @pytest.mark.parametrize(
        "body",
        [
            {"name": "   ", "kind": "list"},
            {"name": "x", "kind": "movie"},
            {"name": "x", "kind": "item", "description": "x" * 501},
        ],
    )
    async def test_rejects_invalid_body(
        self, client: AsyncClient, auth_headers: dict, body: dict
    ):
        response = await client.post("/api/ai/emoji", json=body, headers=auth_headers)
        assert response.status_code == 422


class TestFillItemEmojisEndpoint:
    @staticmethod
    def _configure(monkeypatch: MonkeyPatch) -> None:
        def fake(
            name: str, kind: str, description: str = "", list_title: str = ""
        ) -> tuple[str, ...]:
            if name == "broken":
                raise ValueError("no emoji")
            return ("🍕", "🍔")

        monkeypatch.setattr(get_settings(), "AI_PROJECT", "test-project")
        monkeypatch.setattr(ai_endpoint, "suggest_emojis", fake)

    async def test_fills_only_items_without_an_emoji(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_db: AsyncSession,
        test_list: ListModel,
        item_factory: Any,
        monkeypatch: MonkeyPatch,
    ):
        self._configure(monkeypatch)
        sushi = item_factory(name="Sushi")
        sushi.icon = "🍣"
        test_db.add_all(
            [item_factory(name="Pizza"), sushi, item_factory(name="Broken")]
        )
        await test_db.commit()

        response = await client.post(
            f"/api/ai/lists/{test_list.list_id}/item-emojis", headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json() == {"updated": 1, "remaining": 1}

        items = await client.get(
            f"/api/lists/{test_list.list_id}/items", headers=auth_headers
        )
        assert {item["name"]: item["icon"] for item in items.json()} == {
            "Pizza": "🍕",
            "Sushi": "🍣",
            "Broken": None,
        }

    async def test_rejects_another_users_list(
        self,
        client: AsyncClient,
        auth_headers_user2: dict,
        test_list: ListModel,
        monkeypatch: MonkeyPatch,
    ):
        self._configure(monkeypatch)
        response = await client.post(
            f"/api/ai/lists/{test_list.list_id}/item-emojis",
            headers=auth_headers_user2,
        )
        assert response.status_code == 404
        assert response.json()["detail"] == LIST_NOT_FOUND_ERROR

    async def test_not_configured(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_list: ListModel,
        monkeypatch: MonkeyPatch,
    ):
        monkeypatch.setattr(get_settings(), "AI_PROJECT", "")
        response = await client.post(
            f"/api/ai/lists/{test_list.list_id}/item-emojis", headers=auth_headers
        )
        assert response.status_code == 503
        assert response.json()["detail"] == AI_NOT_CONFIGURED_ERROR


class _FakeResponse:
    def __init__(self, text: str):
        self._text = text

    def raise_for_status(self) -> None:
        pass

    def json(self) -> dict:
        return {"candidates": [{"content": {"parts": [{"text": self._text}]}}]}


def _patch_gemini(monkeypatch: MonkeyPatch, text: str) -> list[tuple[str, dict]]:
    calls: list[tuple[str, dict]] = []

    class FakeSession:
        def __init__(self, credentials: object):
            pass

        def post(self, url: str, **kwargs: Any) -> _FakeResponse:
            calls.append((url, kwargs))
            return _FakeResponse(text)

    gemini._session.cache_clear()
    monkeypatch.setattr(get_settings(), "AI_PROJECT", "test-project")
    monkeypatch.setattr(gemini.google.auth, "default", lambda scopes: (object(), None))
    monkeypatch.setattr(gemini, "AuthorizedSession", FakeSession)
    return calls


class TestSuggestEmojiService:
    @staticmethod
    def _patch(monkeypatch: MonkeyPatch, text: str) -> list[tuple[str, dict]]:
        emoji_suggestion.suggest_emojis.cache_clear()
        return _patch_gemini(monkeypatch, text)

    def test_returns_parsed_emojis(self, monkeypatch: MonkeyPatch):
        calls = self._patch(monkeypatch, " 🍕 🗽 🤤\n")
        assert emoji_suggestion.suggest_emojis("pizza", "list") == ("🍕", "🗽", "🤤")
        assert "/projects/test-project/" in calls[0][0]

    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("🍕 🍕 🗽 🤤 🥤", ("🍕", "🗽", "🤤")),
            ("Sure! 🍕", ("🍕",)),
            (
                "\U0001f37b\U0001f32e\U0001f389",
                ("\U0001f37b", "\U0001f32e", "\U0001f389"),
            ),
            (
                "\U0001f35d\U0001f1ee\U0001f1f9 \U0001f957",
                ("\U0001f35d", "\U0001f1ee\U0001f1f9", "\U0001f957"),
            ),
            (
                "\U0001f37d\ufe0f\U0001f468\u200d\U0001f373\U0001f44b\U0001f3fd",
                (
                    "\U0001f37d\ufe0f",
                    "\U0001f468\u200d\U0001f373",
                    "\U0001f44b\U0001f3fd",
                ),
            ),
        ],
    )
    def test_splits_dedupes_caps_and_drops_prose(
        self, monkeypatch: MonkeyPatch, text: str, expected: tuple[str, ...]
    ):
        self._patch(monkeypatch, text)
        assert emoji_suggestion.suggest_emojis("pizza", "list") == expected

    @pytest.mark.parametrize("text", ["Sure thing", ""])
    def test_rejects_non_emoji(self, monkeypatch: MonkeyPatch, text: str):
        self._patch(monkeypatch, text)
        with pytest.raises(ValueError):
            emoji_suggestion.suggest_emojis("pizza", "list")

    @pytest.mark.parametrize(
        ("args", "expected"),
        [
            (
                ("blue", "item", "the first one", "Pokémon games"),
                "Item: blue\nList: Pokémon games\nDescription: the first one",
            ),
            (("pizza", "list", "", "ignored"), "List: pizza"),
        ],
    )
    def test_user_text(self, monkeypatch: MonkeyPatch, args: tuple, expected: str):
        calls = self._patch(monkeypatch, "🍕")
        emoji_suggestion.suggest_emojis(*args)
        body = calls[0][1]["json"]
        assert body["contents"][0]["parts"][0]["text"] == expected

    def test_caches_successes(self, monkeypatch: MonkeyPatch):
        calls = self._patch(monkeypatch, "🍕")
        emoji_suggestion.suggest_emojis("pizza", "list")
        emoji_suggestion.suggest_emojis("pizza", "list")
        assert len(calls) == 1


class TestSuggestNextItemService:
    def test_returns_first_line_and_sends_existing_names(
        self, monkeypatch: MonkeyPatch
    ):
        calls = _patch_gemini(monkeypatch, '"WALL-E"\nIt is a classic.')
        assert (
            item_suggestion.suggest_next_item("Pixar movies", "", ["Up", "Coco"])
            == "WALL-E"
        )
        body = calls[0][1]["json"]
        assert (
            body["contents"][0]["parts"][0]["text"]
            == "List: Pixar movies\nAlready in the list:\n- Up\n- Coco"
        )

    @pytest.mark.parametrize(
        ("text", "existing"),
        [("", []), ("x" * 61, []), ("up", ["Up"])],
    )
    def test_rejects_unusable_replies(
        self, monkeypatch: MonkeyPatch, text: str, existing: list[str]
    ):
        _patch_gemini(monkeypatch, text)
        with pytest.raises(ValueError):
            item_suggestion.suggest_next_item("Pixar movies", "", existing)


class TestSuggestNextItemEndpoint:
    @staticmethod
    def _configure(monkeypatch: MonkeyPatch, fake: Any) -> None:
        monkeypatch.setattr(get_settings(), "AI_PROJECT", "test-project")
        monkeypatch.setattr(ai_endpoint, "suggest_next_item", fake)

    async def test_returns_suggestion_excluding_known_names(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_db: AsyncSession,
        test_list: ListModel,
        item_factory: Any,
        monkeypatch: MonkeyPatch,
    ):
        received: dict[str, Any] = {}

        def fake(list_title: str, description: str, existing: list[str]) -> str:
            received.update(list_title=list_title, existing=existing)
            return "Ramen"

        self._configure(monkeypatch, fake)
        test_db.add(item_factory(name="Pizza"))
        await test_db.commit()

        response = await client.post(
            f"/api/ai/lists/{test_list.list_id}/next-item",
            json={"exclude": ["Sushi"]},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json() == {"name": "Ramen"}
        assert received == {"list_title": "Test List", "existing": ["Pizza", "Sushi"]}

    async def test_rejects_another_users_list(
        self,
        client: AsyncClient,
        auth_headers_user2: dict,
        test_list: ListModel,
        monkeypatch: MonkeyPatch,
    ):
        self._configure(monkeypatch, lambda *args: "Ramen")
        response = await client.post(
            f"/api/ai/lists/{test_list.list_id}/next-item",
            json={"exclude": []},
            headers=auth_headers_user2,
        )
        assert response.status_code == 404
        assert response.json()["detail"] == LIST_NOT_FOUND_ERROR

    async def test_failure_maps_to_unavailable(
        self,
        client: AsyncClient,
        auth_headers: dict,
        test_list: ListModel,
        monkeypatch: MonkeyPatch,
    ):
        def boom(*args: Any) -> str:
            raise ValueError("no usable item")

        self._configure(monkeypatch, boom)
        response = await client.post(
            f"/api/ai/lists/{test_list.list_id}/next-item",
            json={"exclude": []},
            headers=auth_headers,
        )
        assert response.status_code == 503
        assert response.json()["detail"] == AI_UNAVAILABLE_ERROR
