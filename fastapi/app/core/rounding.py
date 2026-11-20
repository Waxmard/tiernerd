import math


def half_even_1(value: float) -> float:
    scaled = value * 10
    floor = math.floor(scaled)
    diff = scaled - floor
    if diff > 0.5:
        rounded = floor + 1
    elif diff < 0.5 or floor % 2 == 0:
        rounded = floor
    else:
        rounded = floor + 1
    return rounded / 10
