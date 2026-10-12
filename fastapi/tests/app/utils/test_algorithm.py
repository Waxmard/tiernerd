"""Tests for the ranking algorithm."""

import uuid
from datetime import datetime

import pytest

from app.core.algorithm import find_next_comparison
from app.schemas.item import Comparison, Item


def create_test_item(name: str, item_id: int | None = None) -> Item:
    """Create a test item with all required fields."""
    resolved_id = uuid.uuid4() if item_id is None else uuid.UUID(int=item_id)

    return Item(
        item_id=resolved_id,
        list_id=uuid.uuid4(),
        name=name,
        description=f"Test item {name}",
        image_url="https://example.com/image.jpg",
        position="a0",
        rating=None,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )


@pytest.mark.asyncio
async def test_find_next_comparison_winner():
    """Test binary search when reference item wins (is better)."""
    # Create a list of 4 items
    item1 = create_test_item("Item 1", 1)
    item2 = create_test_item("Item 2", 2)
    item3 = create_test_item("Item 3", 3)
    item4 = create_test_item("Item 4", 4)

    all_items = [item1, item2, item3, item4]

    # Start comparison: reference item vs middle item (index 2)
    # Range is [0, 3], middle is (0+3)//2 = 1
    comparison = Comparison(
        reference_item=create_test_item("New Item", 999),
        target_item=item2,  # Index 1
        comparison_index=1,
        min_index=0,
        max_index=3,
        is_winner=True,  # Reference item is better
        done=False,
    )

    # When winner=True, max_index should become comparison_index
    # New range: [0, 1], new middle: (0+1)//2 = 0
    result = find_next_comparison(all_items, comparison)

    assert result.max_index == 1  # max_index updated from 3 to 1
    assert result.min_index == 0  # min_index stays same
    assert result.comparison_index == 0  # new middle: (0+1)//2 = 0
    assert result.target_item == item1  # all_items[0]
    assert result.done is True  # max - min = 1 - 0 = 1, so done=True


@pytest.mark.asyncio
async def test_find_next_comparison_loser():
    """Test binary search when reference item loses (is worse)."""
    # Create a list of 4 items
    item1 = create_test_item("Item 1", 1)
    item2 = create_test_item("Item 2", 2)
    item3 = create_test_item("Item 3", 3)
    item4 = create_test_item("Item 4", 4)

    all_items = [item1, item2, item3, item4]

    # Start comparison: reference item vs middle item (index 1)
    # Range is [0, 3]
    comparison = Comparison(
        reference_item=create_test_item("New Item", 999),
        target_item=item2,  # Index 1
        comparison_index=1,
        min_index=0,
        max_index=3,
        is_winner=False,  # Reference item is worse
        done=False,
    )

    # When winner=False, min_index should become comparison_index
    # New range: [1, 3], new middle: (1+3)//2 = 2
    result = find_next_comparison(all_items, comparison)

    assert result.min_index == 1  # min_index updated from 0 to 1
    assert result.max_index == 3  # max_index stays same
    assert result.comparison_index == 2  # new middle: (1+3)//2 = 2
    assert result.target_item == item3  # all_items[2]
    assert result.done is False  # max - min = 3 - 1 = 2, so done=False


@pytest.mark.asyncio
async def test_find_next_comparison_narrowing_range():
    """Test binary search as the range narrows."""
    # Create a list of 8 items
    items = [create_test_item(f"Item {i}", i) for i in range(8)]

    # Start with full range [0, 7]
    comparison = Comparison(
        reference_item=create_test_item("New Item", 999),
        target_item=items[3],  # Index 3
        comparison_index=3,
        min_index=0,
        max_index=7,
        is_winner=True,  # Reference is better
        done=False,
    )

    # First iteration: winner=True, max becomes 3
    # New range: [0, 3], new middle: (0+3)//2 = 1
    result = find_next_comparison(items, comparison)
    assert result.min_index == 0
    assert result.max_index == 3
    assert result.comparison_index == 1
    assert result.target_item == items[1]
    assert result.done is False

    # Second iteration: loser=False (winner=False means reference is worse)
    result.is_winner = False
    result = find_next_comparison(items, result)

    # New range: [1, 3], new middle: (1+3)//2 = 2
    assert result.min_index == 1
    assert result.max_index == 3
    assert result.comparison_index == 2
    assert result.target_item == items[2]
    assert result.done is False

    # Third iteration: winner=True
    result.is_winner = True
    result = find_next_comparison(items, result)

    # New range: [1, 2], new middle: (1+2)//2 = 1
    assert result.min_index == 1
    assert result.max_index == 2
    assert result.comparison_index == 1
    assert result.target_item == items[1]
    assert result.done is True  # 2 - 1 = 1, so done=True


@pytest.mark.asyncio
async def test_find_next_comparison_edge_case_two_items():
    """Test binary search with only two items."""
    item1 = create_test_item("Item 1", 1)
    item2 = create_test_item("Item 2", 2)

    all_items = [item1, item2]

    # Range [0, 1]
    comparison = Comparison(
        reference_item=create_test_item("New Item", 999),
        target_item=item1,
        comparison_index=0,
        min_index=0,
        max_index=1,
        is_winner=False,  # Reference is worse than item1
        done=False,
    )

    # min becomes 0, new middle: (0+1)//2 = 0
    result = find_next_comparison(all_items, comparison)

    assert result.min_index == 0
    assert result.max_index == 1
    assert result.comparison_index == 0
    assert result.target_item == item1
    assert result.done is True  # 1 - 0 = 1, so done=True
