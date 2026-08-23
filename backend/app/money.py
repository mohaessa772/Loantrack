"""Money handling.

Rule 1: never use float for money. 0.1 + 0.2 != 0.3 in binary floating point,
and financial totals built out of floats drift in ways that are impossible to
explain to a user. We use Python's Decimal everywhere and NUMERIC(12, 2) in the
database.

Rule 2: money leaves the API as a *string* ("1000.00"). JSON numbers become
JavaScript floats, so sending 1000.00 as a number reintroduces the same problem
on the frontend. A string round-trips exactly.
"""

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

CENTS = Decimal("0.01")
ZERO = Decimal("0.00")

# 12 digits total, 2 after the point -> the largest storable amount.
MAX_AMOUNT = Decimal("9999999999.99")


def to_money(value) -> Decimal:
    """Coerce anything (None, int, float, str, Decimal) into a 2dp Decimal.

    We go through str() rather than Decimal(float) because Decimal(0.1) gives
    0.1000000000000000055511151231257827, while Decimal("0.1") gives 0.1.
    """
    if value is None:
        return ZERO
    try:
        return Decimal(str(value)).quantize(CENTS, rounding=ROUND_HALF_UP)
    except InvalidOperation:
        return ZERO


def money_str(value) -> str:
    """Serialise for the API: always two decimal places, never scientific notation."""
    return f"{to_money(value):.2f}"
