def find_next_comparison(
    min_index: int, max_index: int, comparison_index: int, is_winner: bool
) -> tuple[int, int]:
    if is_winner:
        return comparison_index + 1, max_index
    return min_index, comparison_index
