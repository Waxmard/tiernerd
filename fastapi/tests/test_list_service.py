"""Tests for list_service module - pure function unit tests."""

import uuid
from datetime import datetime

from app.db.models import Item as ItemModel
from app.services.list_service import (
    build_list_simple_response,
    get_items_best_first,
)
from app.services.ranking import assign_scores


def create_mock_item(
    name: str,
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

    def test_position_takes_priority_over_score(self):
        low = create_mock_item("Low", position="a0")
        high = create_mock_item("High", position="a1")
        low.rating = 10.0
        high.rating = 0.0
        assert get_items_best_first([low, high]) == [high, low]

    def test_unranked_last(self):
        ranked = create_mock_item("Ranked")
        first_unranked = create_mock_item("First unranked", position=None)
        second_unranked = create_mock_item("Second unranked", position=None)
        assert get_items_best_first([first_unranked, ranked, second_unranked]) == [
            ranked,
            first_unranked,
            second_unranked,
        ]
        assert first_unranked.rating is None
        assert second_unranked.rating is None

    def test_equal_rounded_scores_keep_position_order(self):
        items = [
            create_mock_item(f"Item {i}", position=f"a{i:03d}") for i in range(102)
        ]
        assign_scores(items)
        low, high = items[50:52]
        assert low.rating == high.rating == 5.0
        assert get_items_best_first([low, high]) == [high, low]


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
            ranking_mode = "rank"
            created_at = datetime.now()
            updated_at = datetime.now()

        row = (MockList(), 10)
        result = build_list_simple_response(row)

        assert result["title"] == "Test List"
        assert result["item_count"] == 10
        assert result["ranking_mode"] == "rank"
        assert "tier_distribution" not in result

    def test_build_simple_response_with_none_values(self):
        """Test building simple response with None counts."""

        class MockList:
            list_id = uuid.uuid4()
            user_id = uuid.uuid4()
            title = "Test List"
            description = "Test description"
            color = None
            ranking_mode = "score"
            created_at = datetime.now()
            updated_at = datetime.now()

        row = (MockList(), None)
        result = build_list_simple_response(row)

        assert result["item_count"] == 0
        assert "tier_distribution" not in result
