import pytest

from app.core.algorithm import find_next_comparison


@pytest.mark.parametrize("peer_count", [1, 2, 3, 8])
def test_comparison_answers_resolve_every_insertion_gap(peer_count: int) -> None:
    for expected_gap in range(peer_count + 1):
        low, high, questions = 0, peer_count, 0
        while low < high:
            pivot = (low + high) // 2
            assert 0 <= pivot < peer_count
            low, high = find_next_comparison(low, high, pivot, expected_gap > pivot)
            questions += 1
        assert low == expected_gap
        assert questions <= peer_count.bit_length()
