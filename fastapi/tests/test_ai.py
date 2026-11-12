"""Tests for the AI emoji suggestion endpoint and service."""

from typing import Any

import pytest
from httpx import AsyncClient
from pytest import MonkeyPatch

from app.api.endpoints import ai as ai_endpoint
from app.core.constants import AI_NOT_CONFIGURED_ERROR, AI_UNAVAILABLE_ERROR
from app.services import emoji_suggestion
from app.settings import get_settings


class TestSuggestEmojiEndpoint:
    @staticmethod
    def _configure(monkeypatch: MonkeyPatch, fake: Any) -> None:
        monkeypatch.setattr(get_settings(), "AI_PROJECT", "test-project")
        monkeypatch.setattr(ai_endpoint, "suggest_emoji", fake)

    async def test_returns_suggestion(
        self, client: AsyncClient, auth_headers: dict, monkeypatch: MonkeyPatch
    ):
        self._configure(monkeypatch, lambda name, kind: "🍕")
        response = await client.post(
            "/api/ai/emoji",
            json={"name": "Pizza places", "kind": "list"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert response.json() == {"emoji": "🍕"}

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
        def boom(name: str, kind: str) -> str:
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
        [{"name": "   ", "kind": "list"}, {"name": "x", "kind": "movie"}],
    )
    async def test_rejects_invalid_body(
        self, client: AsyncClient, auth_headers: dict, body: dict
    ):
        response = await client.post("/api/ai/emoji", json=body, headers=auth_headers)
        assert response.status_code == 422


class _FakeResponse:
    def __init__(self, text: str):
        self._text = text

    def raise_for_status(self) -> None:
        pass

    def json(self) -> dict:
        return {"candidates": [{"content": {"parts": [{"text": self._text}]}}]}


class TestSuggestEmojiService:
    @staticmethod
    def _patch(monkeypatch: MonkeyPatch, text: str) -> list[tuple[str, dict]]:
        calls: list[tuple[str, dict]] = []

        class FakeSession:
            def __init__(self, credentials: object):
                pass

            def post(self, url: str, **kwargs: Any) -> _FakeResponse:
                calls.append((url, kwargs))
                return _FakeResponse(text)

        emoji_suggestion.suggest_emoji.cache_clear()
        monkeypatch.setattr(get_settings(), "AI_PROJECT", "test-project")
        monkeypatch.setattr(
            emoji_suggestion.google.auth, "default", lambda scopes: (object(), None)
        )
        monkeypatch.setattr(emoji_suggestion, "AuthorizedSession", FakeSession)
        return calls

    def test_returns_stripped_emoji(self, monkeypatch: MonkeyPatch):
        calls = self._patch(monkeypatch, " 🍕\n")
        assert emoji_suggestion.suggest_emoji("pizza", "list") == "🍕"
        url, kwargs = calls[0]
        assert (
            "/projects/test-project/locations/global/publishers/google/models/"
            "gemini-3.5-flash-lite:generateContent"
        ) in url
        assert kwargs["timeout"] == 8

    @pytest.mark.parametrize("text", ["Sure! 🍕", ""])
    def test_rejects_non_emoji(self, monkeypatch: MonkeyPatch, text: str):
        self._patch(monkeypatch, text)
        with pytest.raises(ValueError):
            emoji_suggestion.suggest_emoji("pizza", "list")

    def test_caches_successes(self, monkeypatch: MonkeyPatch):
        calls = self._patch(monkeypatch, "🍕")
        emoji_suggestion.suggest_emoji("pizza", "list")
        emoji_suggestion.suggest_emoji("pizza", "list")
        assert len(calls) == 1
