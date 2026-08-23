"""Business rules for transactions - the rules that protect your money data."""

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import or_

from ..errors import NotFoundError, ValidationError
from ..extensions import db
from ..models import Transaction, TransactionType
from ..money import ZERO, money_str
from .balances import person_totals
from .people_service import get_owned_person

# DESIGN DECISION (Q1): a payment larger than what the person still owes is
# rejected with 422.
#
# Reasoning: in a personal tracker an "overpayment" is almost always a typo -
# an extra zero, or the wrong person selected in the dropdown. Rejecting it
# turns silent data corruption into a visible error message.
#
# Trade-off: if you genuinely receive more than you are owed, you cannot record
# it directly. Flip this to False and the app will allow negative balances
# (a CREDIT status already exists for that case).
ALLOW_OVERPAYMENT = False

# How far in the future a transaction may be dated. Stops "2206-08-21" typos
# from silently landing in your records.
MAX_FUTURE_DAYS = 365


def get_owned_transaction(user_id, transaction_id, include_deleted=False) -> Transaction:
    query = Transaction.query.filter_by(id=transaction_id, user_id=user_id)
    if not include_deleted:
        query = query.filter(Transaction.deleted_at.is_(None))
    txn = query.first()
    if txn is None:
        raise NotFoundError("That transaction does not exist.")
    return txn


def _check_dates(occurred_on, due_date, txn_type):
    errors = {}
    if occurred_on and occurred_on > date.today() + timedelta(days=MAX_FUTURE_DAYS):
        errors["occurred_on"] = "That date is too far in the future."
    if due_date is not None:
        if txn_type != TransactionType.LOAN:
            errors["due_date"] = "Only a loan can have a due date."
        elif occurred_on and due_date < occurred_on:
            errors["due_date"] = "Due date cannot be before the loan date."
    if errors:
        raise ValidationError(fields=errors)


def _check_overpayment(user_id, person, amount, exclude_transaction_id=None):
    """Reject a payment that exceeds what the person still owes."""
    if ALLOW_OVERPAYMENT:
        return

    totals = person_totals(user_id, person.id)
    outstanding = totals["outstanding"]

    # When editing an existing payment, the old amount is still counted in the
    # totals above. Add it back so we compare against the balance *without* the
    # row being edited - otherwise editing 300 to 301 would look like an
    # overpayment of the full 300.
    if exclude_transaction_id is not None:
        existing = Transaction.query.filter_by(
            id=exclude_transaction_id, user_id=user_id
        ).first()
        if existing and existing.deleted_at is None:
            outstanding = outstanding - existing.signed_amount

    if amount > outstanding:
        raise ValidationError(
            message=(
                f"{person.name} only owes {money_str(outstanding)}. "
                f"A payment of {money_str(amount)} is more than the outstanding balance."
            ),
            fields={"amount": f"Cannot be more than {money_str(outstanding)}."},
        )


def create_transaction(
    user_id,
    person_id,
    txn_type,
    amount,
    occurred_on,
    due_date=None,
    payment_method=None,
    note=None,
) -> Transaction:
    person = get_owned_person(user_id, person_id)
    _check_dates(occurred_on, due_date, txn_type)

    if txn_type == TransactionType.PAYMENT:
        _check_overpayment(user_id, person, amount)

    txn = Transaction(
        user_id=user_id,
        person_id=person.id,
        type=txn_type,
        amount=amount,
        occurred_on=occurred_on,
        due_date=due_date if txn_type == TransactionType.LOAN else None,
        payment_method=payment_method,
        note=note,
    )
    db.session.add(txn)
    db.session.commit()
    return txn


def update_transaction(
    user_id,
    transaction_id,
    person_id,
    txn_type,
    amount,
    occurred_on,
    due_date=None,
    payment_method=None,
    note=None,
) -> Transaction:
    """Edit an existing record.

    DESIGN DECISION (Q2): edits are allowed, but the UI always asks for
    confirmation first, and nothing is ever silently changed. updated_at moves
    so you can always see that a row was touched after it was created.
    """
    txn = get_owned_transaction(user_id, transaction_id)
    person = get_owned_person(user_id, person_id)
    _check_dates(occurred_on, due_date, txn_type)

    if txn_type == TransactionType.PAYMENT:
        _check_overpayment(user_id, person, amount, exclude_transaction_id=txn.id)

    txn.person_id = person.id
    txn.type = txn_type
    txn.amount = amount
    txn.occurred_on = occurred_on
    txn.due_date = due_date if txn_type == TransactionType.LOAN else None
    txn.payment_method = payment_method
    txn.note = note
    db.session.commit()
    return txn


def delete_transaction(user_id, transaction_id) -> None:
    """Soft delete: stamp deleted_at instead of removing the row.

    The row stays in the database, excluded from every query and every total,
    but recoverable. Financial history should not be destroyable by one click.
    """
    txn = get_owned_transaction(user_id, transaction_id)
    txn.deleted_at = datetime.now(timezone.utc)
    db.session.commit()


# =======================================================================
# Filtering / listing
# =======================================================================

def date_range_for_preset(preset, today=None):
    """Translate 'this_month' into a concrete (start, end) pair.

    Doing this on the server means the dashboard, the history page and any
    future report all agree on where a week starts.
    """
    today = today or date.today()
    preset = (preset or "").lower()

    if preset == "today":
        return today, today
    if preset == "week":
        start = today - timedelta(days=today.weekday())  # Monday
        return start, today
    if preset == "month":
        return today.replace(day=1), today
    if preset == "year":
        return today.replace(month=1, day=1), today
    return None, None


def query_transactions(
    user_id,
    person_id=None,
    txn_type=None,
    date_from=None,
    date_to=None,
    search=None,
):
    """Build the filtered query. Returns a query object, not results, so the
    caller can paginate or count without a second copy of this logic."""
    query = Transaction.query.filter(
        Transaction.user_id == user_id, Transaction.deleted_at.is_(None)
    )

    if person_id:
        query = query.filter(Transaction.person_id == person_id)
    if txn_type:
        query = query.filter(Transaction.type == txn_type)
    if date_from:
        query = query.filter(Transaction.occurred_on >= date_from)
    if date_to:
        query = query.filter(Transaction.occurred_on <= date_to)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(or_(Transaction.note.ilike(pattern)))

    # Newest first for a history list, with id as the tiebreaker so pagination
    # never shows the same row on two pages.
    return query.order_by(Transaction.occurred_on.desc(), Transaction.id.desc())


def upcoming_and_overdue(user_id, within_days=14, today=None):
    """Loans that need attention: past due, or due soon."""
    today = today or date.today()
    horizon = today + timedelta(days=within_days)

    loans = (
        Transaction.query.filter(
            Transaction.user_id == user_id,
            Transaction.deleted_at.is_(None),
            Transaction.type == TransactionType.LOAN,
            Transaction.due_date.isnot(None),
            Transaction.due_date <= horizon,
        )
        .order_by(Transaction.due_date.asc())
        .all()
    )

    overdue, upcoming = [], []
    # Only report a due date if the person still owes money overall - see the
    # allocation note in the spec.
    outstanding_cache = {}
    for loan in loans:
        if loan.person_id not in outstanding_cache:
            outstanding_cache[loan.person_id] = person_totals(user_id, loan.person_id)[
                "outstanding"
            ]
        if outstanding_cache[loan.person_id] <= ZERO:
            continue
        row = loan.to_dict()
        row["person_outstanding"] = money_str(outstanding_cache[loan.person_id])
        row["days"] = (loan.due_date - today).days
        (overdue if loan.due_date < today else upcoming).append(row)

    return {"overdue": overdue, "upcoming": upcoming}
