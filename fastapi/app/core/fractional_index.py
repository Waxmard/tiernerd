"""Fractional indexing for ordered items using Base-62 lexicographic keys.

Keys consist of digits and letters: 0-9, A-Z, a-z (62 characters total).
This provides lexicographic ordering where "a0" < "a1" < "b0" etc.
"""

ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
BASE = len(ALPHABET)  # 62


def _char_to_index(c: str) -> int:
    """Convert a character to its index in the alphabet."""
    return ALPHABET.index(c)


def _index_to_char(i: int) -> str:
    """Convert an index to its character in the alphabet."""
    return ALPHABET[i]


def _increment_char(c: str) -> str | None:
    """Increment a character by one, returning None if at max."""
    idx = _char_to_index(c)
    if idx >= BASE - 1:
        return None
    return _index_to_char(idx + 1)


def _decrement_char(c: str) -> str | None:
    """Decrement a character by one, returning None if at min."""
    idx = _char_to_index(c)
    if idx <= 0:
        return None
    return _index_to_char(idx - 1)


def generate_key_between(a: str | None, b: str | None) -> str:
    """
    Generate a key that sorts between a and b.

    Args:
        a: The lower bound key (None means generate key before b)
        b: The upper bound key (None means generate key after a)

    Returns:
        A string key that sorts lexicographically between a and b

    Raises:
        ValueError: If a >= b when both are provided

    Examples:
        generate_key_between(None, None) -> "a0"
        generate_key_between(None, "a0") -> "Z0"
        generate_key_between("a0", None) -> "a1"
        generate_key_between("a0", "a2") -> "a1"
        generate_key_between("a0", "a1") -> "a0a0"
    """
    # Case 1: No bounds - return initial key
    if a is None and b is None:
        return "a0"

    # Case 2: No lower bound - generate key before b
    if a is None:
        assert b is not None  # noqa: S101  # type narrowing (a/b both None handled above)
        first_dec = _decrement_char(b[0])
        if first_dec is not None:
            return first_dec + b[1:]
        # b[0] is the minimum char — recurse on remainder, prepend min
        if len(b) == 1:
            raise ValueError(f"cannot generate key before minimum key {b!r}")
        return ALPHABET[0] + generate_key_between(None, b[1:])

    # Case 3: No upper bound - generate key after a
    if b is None:
        assert a is not None  # noqa: S101  # type narrowing (a/b both None handled above)
        last_inc = _increment_char(a[-1])
        if last_inc is not None:
            return a[:-1] + last_inc
        # Can't increment last char, extend the key
        return a + ALPHABET[BASE // 2]

    # Case 4: Both bounds provided
    if a >= b:
        raise ValueError(f"a must be less than b: {a!r} >= {b!r}")

    # Find common prefix
    p = 0
    while p < min(len(a), len(b)) and a[p] == b[p]:
        p += 1

    prefix = a[:p]
    a_tail = a[p:]
    b_tail = b[p:]

    # If a is a prefix of b, recurse on b's remainder with no lower bound
    if not a_tail:
        # b_tail is non-empty since a < b
        return prefix + generate_key_between(None, b_tail)

    # Both tails non-empty; first chars differ and a_char < b_char
    a_char, b_char = a_tail[0], b_tail[0]
    a_idx, b_idx = _char_to_index(a_char), _char_to_index(b_char)

    # Room between chars — use midpoint
    if b_idx - a_idx > 1:
        return prefix + _index_to_char((a_idx + b_idx) // 2)

    # Adjacent chars — keep a_char and extend after a_tail[1:] with no upper bound
    rest = a_tail[1:] if len(a_tail) > 1 else None
    return prefix + a_char + generate_key_between(rest, None)
