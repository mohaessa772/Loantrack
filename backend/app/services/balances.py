"""Balance calculation - the business core of the application.

Two halves live here:

1. Pure functions that take a list of transactions and return numbers. They
   touch no database, so they can be unit-tested in microseconds and they are
   where the actual rules live.

2. Query functions that let PostgreSQL do the aggregating. Used by the list and
   dashboard screens, where pulling every transaction into Python just to add it
   up would be wasteful.

Both halves implement the same rule:

    outstanding = SUM(LOAN amounts) - SUM(PAYMENT amounts)
"""

from datetime import date

from sqlalchemy import and_, case, func, or_

from ..extensions import db
from ..models import Person, Transaction, TransactionType
from ..money import ZERO, to_money

# --- status labels ------------------------------------------------------
# Text, never colour alone. A colour-blind user, a screen reader, and a printed
# page all need to be able to tell these apart.
STATUS_SETTLED = "SETTLED"
STATUS_OWING = "OWING"
STATUS_OVERDUE = "OVERDUE"
STATUS_CREDIT = "CREDIT"  # only reachable if overpayment is ever allowed


# =======================================================================
# Pure calculation - no database
# =======================================================================

def statement_sort_key(txn):
    """Deterministic ordering for a statement.

    occurred_on alone is not enough: two transactions on the same day would be
    free to swap places between page loads, and the running balance column would
    appear to change on its own. created_at breaks the tie, and id breaks the tie
    for rows created in the same instant.
    """
    return (
        txn.occurred_on,
        txn.created_at or date.min,
        txn.id or 0,
    )


def build_statement(transactions):
    """Return [(transaction, balance_after), ...] in chronological order.

    balance_after(n) = sum of signed amounts for rows 1..n
    """
    ordered = sorted(transactions, key=statement_sort_key)
    running = ZERO
    rows = []
    for txn in ordered:
        running = running + txn.signed_amount
        rows.append((txn, running))
    return rows


def totals_from(transactions):
    """Total lent / repaid / outstanding for a list of transactions."""
    lent = ZERO
    repaid = ZERO
    for txn in transactions:
        if txn.type == TransactionType.LOAN:
            lent += to_money(txn.amount)
        else:
            repaid += to_money(txn.amount)
    return {"total_lent": lent, "total_repaid": repaid, "outstanding": lent - repaid}


def resolve_status(outstanding, has_overdue_loan: bool) -> str:
    """Turn numbers into a label the UI can show."""
    if outstanding < ZERO:
        return STATUS_CREDIT
    if outstanding == ZERO:
        return STATUS_SETTLED
    return STATUS_OVERDUE if has_overdue_loan else STATUS_OWING


# =======================================================================
# Database aggregation
# =======================================================================

def _live(query):
    """Every query must exclude soft-deleted rows. One helper, used everywhere."""
    return query.filter(Transaction.deleted_at.is_(None))


_LENT = func.coalesce(
    func.sum(case((Transaction.type == TransactionType.LOAN, Transaction.amount), else_=0)),
    0,
)
_REPAID = func.coalesce(
    func.sum(case((Transaction.type == TransactionType.PAYMENT, Transaction.amount), else_=0)),
    0,
)


def overall_totals(user_id):
    """Dashboard headline numbers, computed in a single query."""
    row = _live(
        db.session.query(
            _LENT.label("lent"),
            _REPAID.label("repaid"),
            func.count(Transaction.id).label("count"),
        ).filter(Transaction.user_id == user_id)
    ).one()

    lent = to_money(row.lent)
    repaid = to_money(row.repaid)
    return {
        "total_lent": lent,
        "total_repaid": repaid,
        "outstanding": lent - repaid,
        "transaction_count": row.count or 0,
    }


def person_totals(user_id, person_id):
    row = _live(
        db.session.query(_LENT.label("lent"), _REPAID.label("repaid")).filter(
            Transaction.user_id == user_id, Transaction.person_id == person_id
        )
    ).one()
    lent = to_money(row.lent)
    repaid = to_money(row.repaid)
    return {"total_lent": lent, "total_repaid": repaid, "outstanding": lent - repaid}


def people_with_balances(user_id, search=None, today=None):
    """Every person plus their balance, in ONE query.

    The naive version - fetch the people, then loop and query each person's
    balance - is the classic "N+1 query" problem: 50 people means 51 round trips
    to the database. A LEFT OUTER JOIN with GROUP BY does it in one.

    The join condition (not a WHERE clause) carries the deleted_at filter, so
    people with no transactions still appear, with a balance of zero.
    """
    today = today or date.today()

    overdue_due_date = func.min(
        case(
            (
                and_(
                    Transaction.type == TransactionType.LOAN,
                    Transaction.due_date.isnot(None),
                    Transaction.due_date < today,
                ),
                Transaction.due_date,
            )
        )
    )
    next_due_date = func.min(
        case(
            (
                and_(
                    Transaction.type == TransactionType.LOAN,
                    Transaction.due_date.isnot(None),
                    Transaction.due_date >= today,
                ),
                Transaction.due_date,
            )
        )
    )
    last_activity = func.max(Transaction.occurred_on)

    query = (
        db.session.query(
            Person,
            _LENT.label("lent"),
            _REPAID.label("repaid"),
            overdue_due_date.label("overdue_due_date"),
            next_due_date.label("next_due_date"),
            last_activity.label("last_activity"),
            func.count(Transaction.id).label("transaction_count"),
        )
        .outerjoin(
            Transaction,
            and_(
                Transaction.person_id == Person.id,
                Transaction.deleted_at.is_(None),
            ),
        )
        .filter(Person.user_id == user_id)
        .group_by(Person.id)
    )

    if search:
        # ilike = case-insensitive LIKE. The % wildcards are passed as a bound
        # parameter, so a search for "'; DROP TABLE" is just a harmless string -
        # this is SQL injection safe because we never build SQL by concatenation.
        pattern = f"%{search.strip()}%"
        query = query.filter(or_(Person.name.ilike(pattern), Person.phone.ilike(pattern)))

    results = []
    for row in query.all():
        lent = to_money(row.lent)
        repaid = to_money(row.repaid)
        outstanding = lent - repaid
        # A loan can only be "overdue" in a meaningful sense if the person still
        # owes money overall. Payments are not linked to individual loans in V1,
        # so this is the honest approximation.
        has_overdue = row.overdue_due_date is not None and outstanding > ZERO

        data = row.Person.to_dict()
        data.update(
            {
                "total_lent": lent,
                "total_repaid": repaid,
                "outstanding": outstanding,
                "status": resolve_status(outstanding, has_overdue),
                "overdue_since": row.overdue_due_date.isoformat()
                if (row.overdue_due_date and has_overdue)
                else None,
                "next_due_date": row.next_due_date.isoformat() if row.next_due_date else None,
                "last_activity": row.last_activity.isoformat() if row.last_activity else None,
                "transaction_count": row.transaction_count or 0,
            }
        )
        results.append(data)

    return results


def person_overdue_flags(user_id, person_id, today=None):
    """Does this person have any past-due loan, and what is the next due date?"""
    today = today or date.today()
    row = _live(
        db.session.query(
            func.min(
                case(
                    (
                        and_(
                            Transaction.type == TransactionType.LOAN,
                            Transaction.due_date.isnot(None),
                            Transaction.due_date < today,
                        ),
                        Transaction.due_date,
                    )
                )
            ).label("overdue_since"),
            func.min(
                case(
                    (
                        and_(
                            Transaction.type == TransactionType.LOAN,
                            Transaction.due_date.isnot(None),
                            Transaction.due_date >= today,
                        ),
                        Transaction.due_date,
                    )
                )
            ).label("next_due"),
        ).filter(Transaction.user_id == user_id, Transaction.person_id == person_id)
    ).one()
    return {
        "overdue_since": row.overdue_since,
        "next_due_date": row.next_due,
    }
