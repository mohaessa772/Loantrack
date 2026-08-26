from datetime import date

from ..extensions import db
from ..money import money_str
from .user import utcnow


class TransactionType:
    """Two kinds of money movement, and only two.

    Kept as plain strings rather than a database ENUM: adding a value to a
    Postgres ENUM requires a migration and an exclusive lock, while a
    CHECK constraint is easy to widen later. At this scale, strings win.
    """

    LOAN = "LOAN"  # money I gave to the person
    PAYMENT = "PAYMENT"  # money the person gave back to me

    ALL = (LOAN, PAYMENT)


PAYMENT_METHODS = ("CASH", "BANK_TRANSFER", "EWALLET", "OTHER")


class Transaction(db.Model):
    """A single movement of money. The source of truth for every number in the app."""

    __tablename__ = "transactions"

    id = db.Column(db.Integer, primary_key=True)

    # Denormalised on purpose: every authorisation check becomes
    # `WHERE user_id = me` with no join, which is much harder to get wrong than
    # remembering to join through people every single time. The cost is that
    # the service layer must always set it correctly.
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # RESTRICT: the database itself refuses to delete a person who still has
    # transactions. Even a buggy line of code cannot wipe financial history.
    person_id = db.Column(
        db.Integer,
        db.ForeignKey("people.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    type = db.Column(db.String(10), nullable=False)

    # NUMERIC(12,2), never FLOAT. Always positive - direction is carried by
    # `type`, so a negative amount can never sneak in and silently flip a loan
    # into a payment.
    amount = db.Column(db.Numeric(12, 2), nullable=False)

    # The calendar day the money actually moved. Editable, and can be backdated.
    # Deliberately different from created_at, which is when the row was typed in.
    occurred_on = db.Column(db.Date, nullable=False, default=date.today)

    # Loans only. A repayment cannot be "due".
    due_date = db.Column(db.Date, nullable=True)

    payment_method = db.Column(db.String(20), nullable=True)
    note = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(
        db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    # Soft delete. NULL means the row is live. Deleting a financial record by
    # actually removing the row destroys history you may need later; setting a
    # timestamp keeps it recoverable and auditable.
    deleted_at = db.Column(db.DateTime(timezone=True), nullable=True, index=True)

    person = db.relationship("Person", back_populates="transactions")

    __table_args__ = (
        db.CheckConstraint("type IN ('LOAN','PAYMENT')", name="ck_txn_type"),
        db.CheckConstraint("amount > 0", name="ck_txn_amount_positive"),
        db.CheckConstraint(
            "due_date IS NULL OR type = 'LOAN'", name="ck_txn_due_date_loan_only"
        ),
        db.CheckConstraint(
            "payment_method IS NULL OR payment_method IN "
            "('CASH','BANK_TRANSFER','EWALLET','OTHER')",
            name="ck_txn_payment_method",
        ),
        # This index matches the person-statement query exactly: filter by
        # person, sorted by date then id. The database can walk the index
        # instead of sorting rows in memory.
        db.Index("ix_txn_person_date", "person_id", "occurred_on", "id"),
        db.Index("ix_txn_user_date", "user_id", "occurred_on"),
    )

    @property
    def signed_amount(self):
        """+amount for a loan, -amount for a payment. The whole balance model."""
        from ..money import to_money

        value = to_money(self.amount)
        return value if self.type == TransactionType.LOAN else -value

    def is_overdue(self, today=None) -> bool:
        """True if this is a loan whose due date has passed.

        Note the limitation: payments are not linked to specific loans in V1, so
        this cannot know whether *this particular* loan was repaid. The person
        page combines it with the overall outstanding balance.
        """
        if self.type != TransactionType.LOAN or self.due_date is None:
            return False
        return self.due_date < (today or date.today())

    def to_dict(self, person_name=None):
        return {
            "id": self.id,
            "person_id": self.person_id,
            "person_name": person_name or (self.person.name if self.person else None),
            "type": self.type,
            "amount": money_str(self.amount),
            "occurred_on": self.occurred_on.isoformat() if self.occurred_on else None,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "payment_method": self.payment_method,
            "note": self.note,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            # Null for every live row. Only the "recently deleted" view uses it.
            "deleted_at": self.deleted_at.isoformat() if self.deleted_at else None,
        }

    def __repr__(self):
        return f"<Transaction {self.type} {self.amount} person={self.person_id}>"
