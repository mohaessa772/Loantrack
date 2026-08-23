"""Unit tests for the balance rules.

These are the most valuable tests in the project: they test the actual business
logic, they need no database and no HTTP, and they run in milliseconds. If the
arithmetic here is wrong, every screen in the app shows a wrong number.
"""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from app.models import Transaction, TransactionType
from app.services.balances import (
    STATUS_CREDIT,
    STATUS_OVERDUE,
    STATUS_OWING,
    STATUS_SETTLED,
    build_statement,
    resolve_status,
    totals_from,
)


def txn(txn_type, amount, day, txn_id=1):
    """A transaction object that was never saved - enough for pure functions."""
    return Transaction(
        id=txn_id,
        type=txn_type,
        amount=Decimal(str(amount)),
        occurred_on=date(2026, 8, day),
        created_at=datetime(2026, 8, day, tzinfo=timezone.utc),
    )


class TestSingleTransactions:
    def test_one_loan(self):
        rows = build_statement([txn(TransactionType.LOAN, "1000.00", 21)])
        assert rows[0][1] == Decimal("1000.00")

    def test_one_payment_reduces_the_balance(self):
        rows = build_statement(
            [
                txn(TransactionType.LOAN, "1000.00", 21, 1),
                txn(TransactionType.PAYMENT, "300.00", 22, 2),
            ]
        )
        assert [balance for _, balance in rows] == [Decimal("1000.00"), Decimal("700.00")]


class TestTheSpecExample:
    """The exact scenario from the project brief."""

    def build(self):
        return [
            txn(TransactionType.LOAN, "1000.00", 21, 1),
            txn(TransactionType.PAYMENT, "300.00", 22, 2),
            txn(TransactionType.LOAN, "500.00", 23, 3),
            txn(TransactionType.PAYMENT, "200.00", 24, 4),
        ]

    def test_running_balance(self):
        rows = build_statement(self.build())
        assert [balance for _, balance in rows] == [
            Decimal("1000.00"),
            Decimal("700.00"),
            Decimal("1200.00"),
            Decimal("1000.00"),
        ]

    def test_totals(self):
        totals = totals_from(self.build())
        assert totals["total_lent"] == Decimal("1500.00")
        assert totals["total_repaid"] == Decimal("500.00")
        assert totals["outstanding"] == Decimal("1000.00")


class TestMultiple:
    def test_many_loans(self):
        rows = [txn(TransactionType.LOAN, "100.00", d, d) for d in range(1, 6)]
        assert totals_from(rows)["outstanding"] == Decimal("500.00")

    def test_many_payments_full_repayment(self):
        rows = [
            txn(TransactionType.LOAN, "1000.00", 1, 1),
            txn(TransactionType.PAYMENT, "250.00", 2, 2),
            txn(TransactionType.PAYMENT, "250.00", 3, 3),
            txn(TransactionType.PAYMENT, "500.00", 4, 4),
        ]
        assert totals_from(rows)["outstanding"] == Decimal("0.00")
        assert build_statement(rows)[-1][1] == Decimal("0.00")

    def test_no_transactions(self):
        totals = totals_from([])
        assert totals["outstanding"] == Decimal("0.00")
        assert build_statement([]) == []


class TestOrdering:
    def test_input_order_does_not_matter(self):
        """A statement built from shuffled rows must still be chronological."""
        rows = [
            txn(TransactionType.PAYMENT, "200.00", 24, 4),
            txn(TransactionType.LOAN, "1000.00", 21, 1),
            txn(TransactionType.LOAN, "500.00", 23, 3),
            txn(TransactionType.PAYMENT, "300.00", 22, 2),
        ]
        assert [b for _, b in build_statement(rows)] == [
            Decimal("1000.00"),
            Decimal("700.00"),
            Decimal("1200.00"),
            Decimal("1000.00"),
        ]

    def test_same_day_uses_id_as_tiebreak(self):
        """Two transactions on one day must always come out in the same order."""
        a = txn(TransactionType.LOAN, "100.00", 21, 1)
        b = txn(TransactionType.PAYMENT, "40.00", 21, 2)
        assert [x.id for x, _ in build_statement([b, a])] == [1, 2]


class TestPrecision:
    def test_cents_do_not_drift(self):
        """The float trap: 0.1 + 0.2 != 0.3. Decimal must not have this problem."""
        rows = [txn(TransactionType.LOAN, "0.10", 1, 1), txn(TransactionType.LOAN, "0.20", 2, 2)]
        assert totals_from(rows)["outstanding"] == Decimal("0.30")

    def test_many_small_amounts(self):
        rows = [txn(TransactionType.LOAN, "0.01", 1, i) for i in range(100)]
        assert totals_from(rows)["outstanding"] == Decimal("1.00")


class TestStatus:
    def test_settled_when_zero(self):
        assert resolve_status(Decimal("0.00"), False) == STATUS_SETTLED

    def test_owing_when_positive(self):
        assert resolve_status(Decimal("50.00"), False) == STATUS_OWING

    def test_overdue_beats_owing(self):
        assert resolve_status(Decimal("50.00"), True) == STATUS_OVERDUE

    def test_settled_person_is_never_overdue(self):
        """Even with a past-due loan, a person who owes nothing is settled."""
        assert resolve_status(Decimal("0.00"), True) == STATUS_SETTLED

    def test_negative_balance_is_credit(self):
        assert resolve_status(Decimal("-25.00"), False) == STATUS_CREDIT


class TestOverdueFlag:
    def test_past_due_loan_is_overdue(self):
        loan = Transaction(
            type=TransactionType.LOAN,
            amount=Decimal("100.00"),
            occurred_on=date.today() - timedelta(days=30),
            due_date=date.today() - timedelta(days=1),
        )
        assert loan.is_overdue() is True

    def test_future_due_loan_is_not(self):
        loan = Transaction(
            type=TransactionType.LOAN,
            amount=Decimal("100.00"),
            occurred_on=date.today(),
            due_date=date.today() + timedelta(days=1),
        )
        assert loan.is_overdue() is False

    def test_loan_without_due_date_is_never_overdue(self):
        loan = Transaction(
            type=TransactionType.LOAN, amount=Decimal("100.00"), occurred_on=date.today()
        )
        assert loan.is_overdue() is False

    def test_a_payment_is_never_overdue(self):
        payment = Transaction(
            type=TransactionType.PAYMENT, amount=Decimal("100.00"), occurred_on=date.today()
        )
        assert payment.is_overdue() is False
