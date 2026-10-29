"""Tests for fractional indexing."""

import pytest

from app.core.fractional_index import (
    ALPHABET,
    generate_key_between,
)


class TestBasicGeneration:
    def test_no_bounds_returns_initial(self) -> None:
        assert generate_key_between(None, None) == "a0"

    def test_after_a_increments_last_char(self) -> None:
        assert generate_key_between("a0", None) == "a1"

    def test_before_b_decrements_first_char(self) -> None:
        assert generate_key_between(None, "a0") == "Z0"

    def test_between_with_room_uses_midpoint(self) -> None:
        assert generate_key_between("a0", "a2") == "a1"

    @pytest.mark.parametrize(("a", "b"), [("a1", "a0"), ("a0", "a0")])
    def test_a_must_be_less_than_b(self, a: str, b: str) -> None:
        with pytest.raises(ValueError):
            generate_key_between(a, b)


class TestPrependZeroFallback:
    """Cases where b starts with the minimum char ('0') — exercises the
    recursive front-insertion branch."""

    @pytest.mark.parametrize("bound", ["0A", "00A"])
    def test_before_b_starting_with_zero(self, bound: str) -> None:
        result = generate_key_between(None, bound)
        assert result < bound
        assert result.startswith("0")

    def test_before_lone_min_char_raises(self) -> None:
        with pytest.raises(ValueError, match="cannot generate key before minimum"):
            generate_key_between(None, "0")

    def test_repeated_front_insertion_stays_ordered(self) -> None:
        """Front insertions within alphabet headroom; each new key < previous."""
        prev = generate_key_between(None, None)  # "a0"
        for _ in range(30):
            key = generate_key_between(None, prev)
            assert key < prev, f"{key!r} not < {prev!r}"
            prev = key

    def test_front_insertion_eventually_exhausts(self) -> None:
        """After enough front insertions, alphabet headroom runs out and raises."""
        prev = generate_key_between(None, None)
        with pytest.raises(ValueError, match="cannot generate key before minimum"):
            for _ in range(200):
                prev = generate_key_between(None, prev)


class TestAppendMaxFallback:
    def test_after_a_ending_with_max(self) -> None:
        max_char = ALPHABET[-1]  # 'z'
        result = generate_key_between("a" + max_char, None)
        assert result > "a" + max_char

    def test_repeated_back_insertion_stays_ordered(self) -> None:
        key = generate_key_between(None, None)
        prev = key
        for _ in range(50):
            key = generate_key_between(prev, None)
            assert key > prev
            prev = key


class TestCommonPrefix:
    """a and b share a common prefix — exercises common_prefix_len logic."""

    def test_between_with_shared_prefix(self) -> None:
        result = generate_key_between("aa0", "aa9")
        assert "aa0" < result < "aa9"

    def test_a_is_prefix_of_b(self) -> None:
        # a shorter than b, a is full prefix of b
        result = generate_key_between("a", "a5")
        assert "a" < result < "a5"

    def test_b_extends_a_minimally(self) -> None:
        # ("a0", "a0V") from docstring example
        result = generate_key_between("a0", "a0V")
        assert "a0" < result < "a0V"

    def test_adjacent_chars_extends_with_suffix(self) -> None:
        # adjacent first chars at boundary, forces extension path
        result = generate_key_between("a0", "a1")
        assert "a0" < result < "a1"
        assert result.startswith("a0")  # extends a, doesn't replace

    def test_suffix_with_max_char_falls_through(self) -> None:
        # suffix ends in max char ('z') — line 125 condition fails
        result = generate_key_between("a0z", "a1")
        assert "a0z" < result < "a1"

    def test_deeply_nested_extension(self) -> None:
        # repeatedly insert between adjacent keys; depth should grow
        a, b = "a0", "a1"
        for _ in range(10):
            mid = generate_key_between(a, b)
            assert a < mid < b
            b = mid  # keep narrowing


class TestInvariants:
    """Property-style: result must always sort strictly between bounds."""

    @pytest.mark.parametrize(
        "a,b",
        [
            ("a0", "a1"),
            ("a0", "b0"),
            ("a0", "z0"),
            ("00", "01"),
            ("aaa", "aab"),
            ("a", "b"),
            ("Z9", "a0"),
        ],
    )
    def test_result_strictly_between(self, a: str, b: str) -> None:
        result = generate_key_between(a, b)
        assert a < result < b, f"{a!r} < {result!r} < {b!r} failed"

    def test_no_key_exists_between_a_and_min_extension(self) -> None:
        # a="a0", b="a00": any extension of "a0" is either == a or >= "a00"
        with pytest.raises(ValueError, match="cannot generate key before minimum"):
            generate_key_between("a0", "a00")

    def test_round_trip_insert_left_then_right(self) -> None:
        a = generate_key_between(None, None)  # "a0"
        b = generate_key_between(a, None)  # "a1"
        mid = generate_key_between(a, b)
        left = generate_key_between(a, mid)
        right = generate_key_between(mid, b)
        assert a < left < mid < right < b
