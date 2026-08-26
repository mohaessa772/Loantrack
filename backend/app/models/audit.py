import json

from ..extensions import db
from .user import utcnow


class AuditAction:
    """What happened to a transaction. Deliberately a closed set."""

    CREATED = "CREATED"
    UPDATED = "UPDATED"
    DELETED = "DELETED"
    RESTORED = "RESTORED"

    ALL = (CREATED, UPDATED, DELETED, RESTORED)


class TransactionAudit(db.Model):
    """An append-only record of what happened to a transaction, and when.

    Why this exists: editing a transaction overwrites the old amount, and
    `updated_at` only tells you that *something* changed - not what it was
    before. For a record of money owed between people, "it used to say 300"
    is exactly the question that gets asked.

    Append-only by design. There is no endpoint that edits or deletes a row
    here; an audit trail you can quietly rewrite is not an audit trail.
    """

    __tablename__ = "transaction_audit"

    id = db.Column(db.Integer, primary_key=True)

    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # CASCADE rather than RESTRICT: transactions are normally soft-deleted and
    # stay forever, but restoring a backup replaces the records wholesale, and
    # audit rows describing transactions that no longer exist would be noise.
    transaction_id = db.Column(
        db.Integer,
        db.ForeignKey("transactions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    action = db.Column(db.String(10), nullable=False)

    # A JSON object of {field: {"from": ..., "to": ...}}, stored as text.
    #
    # Text rather than a JSON column so the same code runs on SQLite and
    # PostgreSQL. The cost is that you cannot query *inside* it in SQL - which
    # is fine, because this is only ever read back for one transaction at a
    # time and rendered.
    changes = db.Column(db.Text, nullable=True)

    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    __table_args__ = (
        db.CheckConstraint(
            "action IN ('CREATED','UPDATED','DELETED','RESTORED')", name="ck_audit_action"
        ),
        # The history of one transaction, newest first - the only read pattern.
        db.Index("ix_audit_txn_time", "transaction_id", "created_at"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "action": self.action,
            "changes": json.loads(self.changes) if self.changes else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<TransactionAudit {self.action} txn={self.transaction_id}>"
