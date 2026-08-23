"""Input validation helpers.

Every one of these raises ValidationError with a per-field message, so the
frontend can highlight the exact input that is wrong instead of showing one
vague banner.

Why validate on the server at all when the React form already checks?
Because the React form is not a security boundary. Anyone can send a request
with Postman or curl and skip the UI entirely. Frontend validation is a
convenience for honest users; backend validation is the actual rule.
"""

from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from .errors import ValidationError
from .money import MAX_AMOUNT
from .models.transaction import PAYMENT_METHODS, TransactionType


class FieldErrors:
    """Collects field errors so we can report all problems in one response."""

    def __init__(self):
        self.errors = {}

    def add(self, field, message):
        self.errors.setdefault(field, message)

    def raise_if_any(self):
        if self.errors:
            raise ValidationError(fields=self.errors)


def get_json(request):
    """Read a JSON body, refusing anything that is not a JSON object."""
    data = request.get_json(silent=True)
    if data is None or not isinstance(data, dict):
        raise ValidationError(message="Expected a JSON object in the request body.")
    return data


def clean_str(value, max_length=None):
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if max_length and len(text) > max_length:
        text = text[:max_length]
    return text


def parse_required_name(value, errors, field="name"):
    name = clean_str(value, 120)
    if not name:
        errors.add(field, "Name is required.")
    return name


def parse_phone(value, errors, field="phone"):
    phone = clean_str(value, 32)
    if phone is None:
        return None
    # Deliberately permissive: international formats vary wildly and rejecting a
    # legitimate number is worse than storing an odd one.
    allowed = set("0123456789+-() ")
    if not set(phone) <= allowed:
        errors.add(field, "Phone may only contain digits and + - ( ) spaces.")
    elif sum(ch.isdigit() for ch in phone) < 6:
        errors.add(field, "Phone number looks too short.")
    return phone


def parse_amount(value, errors, field="amount") -> Decimal | None:
    """Amounts arrive as strings. Must be > 0 and no more than 2 decimal places."""
    if value is None or str(value).strip() == "":
        errors.add(field, "Amount is required.")
        return None
    try:
        amount = Decimal(str(value).strip().replace(",", ""))
    except InvalidOperation:
        errors.add(field, "Amount must be a number.")
        return None

    if not amount.is_finite():
        errors.add(field, "Amount must be a number.")
        return None
    if amount <= 0:
        errors.add(field, "Amount must be greater than zero.")
        return None
    if amount > MAX_AMOUNT:
        errors.add(field, "Amount is too large.")
        return None
    if -amount.as_tuple().exponent > 2:
        errors.add(field, "Amount cannot have more than 2 decimal places.")
        return None
    return amount


def parse_date(value, errors, field, required=True) -> date | None:
    if value is None or str(value).strip() == "":
        if required:
            errors.add(field, "Date is required.")
        return None
    try:
        return datetime.strptime(str(value).strip(), "%Y-%m-%d").date()
    except ValueError:
        errors.add(field, "Date must be in YYYY-MM-DD format.")
        return None


def parse_type(value, errors, field="type") -> str | None:
    text = clean_str(value)
    if not text:
        errors.add(field, "Transaction type is required.")
        return None
    text = text.upper()
    if text not in TransactionType.ALL:
        errors.add(field, "Type must be LOAN or PAYMENT.")
        return None
    return text


def parse_payment_method(value, errors, field="payment_method") -> str | None:
    text = clean_str(value)
    if text is None:
        return None
    text = text.upper()
    if text not in PAYMENT_METHODS:
        errors.add(field, f"Payment method must be one of: {', '.join(PAYMENT_METHODS)}.")
        return None
    return text


def parse_int(value, default=None, minimum=None, maximum=None):
    """Used for pagination. Never trusts the query string."""
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    if minimum is not None:
        number = max(number, minimum)
    if maximum is not None:
        number = min(number, maximum)
    return number
