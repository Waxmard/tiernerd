"""Tests for list_service module - pure function unit tests."""

import uuid
from datetime import datetime

from app.db.models import Item as ItemModel
from app.services.list_service import (
    build_list_response,
    build_list_simple_response,
    get_items_best_first,
)


def create_mock_item(
    name: str,
    tier_set: str | None = "good",
    position: str | None = "a0",
) -> ItemModel:
    """Create a mock item for testing."""
    return ItemModel(
        item_id=uuid.uuid4(),
        list_id=uuid.uuid4(),
        name=name,
        description=f"Description for {name}",
        image_url=f"https://example.com/{name}.jpg",
        position=position,
        rating=None,
        tier_set=tier_set,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )


class TestGetItemsBestFirst:
    def test_empty(self):
        assert get_items_best_first([]) == []

    def test_best_position_first(self):
        low = create_mock_item("Low", position="a0")
        middle = create_mock_item("Middle", position="a1")
        high = create_mock_item("High", position="a2")
        assert get_items_best_first([middle, low, high]) == [high, middle, low]

    def test_band_order(self):
        mid = create_mock_item("Mid", tier_set="mid", position="a1")
        bad = create_mock_item("Bad", tier_set="bad", position="a0")
        good_low = create_mock_item("Good low", position="a0")
        good_high = create_mock_item("Good high", position="a1")
        assert get_items_best_first([mid, bad, good_low, good_high]) == [
            good_high,
            good_low,
            mid,
            bad,
        ]

    def test_unranked_last(self):
        ranked = create_mock_item("Ranked")
        unranked = create_mock_item("Unranked", position=None)
        assert get_items_best_first([unranked, ranked]) == [ranked, unranked]

    def test_unknown_band_after_bad(self):
        bad = create_mock_item("Bad", tier_set="bad")
        unknown = create_mock_item("Unknown", tier_set="unknown", position="a2")
        missing = create_mock_item("Missing", tier_set=None, position="a1")
        unranked = create_mock_item("Unranked", position=None)
        assert get_items_best_first([unknown, unranked, bad, missing]) == [
            bad,
            unknown,
            missing,
            unranked,
        ]


class TestBuildListResponse:
    """Tests for build_list_response function."""

    def test_build_response_without_items(self):
        """Test building response without items."""

        class MockList:
            list_id = uuid.uuid4()
            user_id = uuid.uuid4()
            title = "Test List"
            description = "Test description"
            color = None
            created_at = datetime.now()
            updated_at = datetime.now()

        result = build_list_response(MockList())
        assert result["title"] == "Test List"
        assert result["description"] == "Test description"
        assert "items" not in result

    def test_build_response_with_items(self):
        class MockList:
            list_id = uuid.uuid4()
            user_id = uuid.uuid4()
            title = "Test List"
            description = "Test description"
            color = None
            created_at = datetime.now()
            updated_at = datetime.now()

        items = [{"name": "Item 1"}, {"name": "Item 2"}]
        result = build_list_response(MockList(), items=items)
        assert result["title"] == "Test List"
        assert "items" in result
        assert len(result["items"]) == 2

    def test_build_response_with_empty_items(self):
        """Test building response with empty items list."""

        class MockList:
            list_id = uuid.uuid4()
            user_id = uuid.uuid4()
            title = "Test List"
            description = "Test description"
            color = None
            created_at = datetime.now()
            updated_at = datetime.now()

        result = build_list_response(MockList(), items=[])
        assert "items" in result
        assert result["items"] == []


class TestBuildListSimpleResponse:
    """Tests for build_list_simple_response function."""

    def test_build_simple_response(self):
        """Test building simple response with stats."""

        class MockList:
            list_id = uuid.uuid4()
            user_id = uuid.uuid4()
            title = "Test List"
            description = "Test description"
            color = None
            created_at = datetime.now()
            updated_at = datetime.now()

        row = (MockList(), 10)
        result = build_list_simple_response(row)

        assert result["title"] == "Test List"
        assert result["item_count"] == 10
        assert "tier_distribution" not in result

    def test_build_simple_response_with_none_values(self):
        """Test building simple response with None counts."""

        class MockList:
            list_id = uuid.uuid4()
            user_id = uuid.uuid4()
            title = "Test List"
            description = "Test description"
            color = None
            created_at = datetime.now()
            updated_at = datetime.now()

        row = (MockList(), None)
        result = build_list_simple_response(row)

        assert result["item_count"] == 0
        assert "tier_distribution" not in result
