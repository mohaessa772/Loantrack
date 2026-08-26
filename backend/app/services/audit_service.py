"""Recording what happened to a transaction.

`updated_at` tells you a row changed. It cannot tell you it used to say 300 -
and with money owed between people, that is the question that actually gets
asked. This module keeps the answer.

Note that `record()` never commits. It adds the audit row to the same session
the caller is already using, so the change and the record of the change land in
one database transaction: either both happen or neither does. An audit trail
that can be written without the change (or vice versa) is worse than none.
"""

import json

from ..extensions import db
from ..models import TransactionAudit
from ..money import money_str

# Human-readable labels for the fields worth remembering a change to.
FIELD_LABELS = {
    "person": "Person",
    "type": "Type",
    "amount": "Amount",
    "occurred_on": "Date",
    "due_date": "Due date",
    "payment_method": "Payment method",
    "note": "Note",
}


def snapshot(txn) -> dict:
    """The values compared before and after an edit.

    The person is stored by NAME, not id. If they are renamed later the audit
    still shows what the record said at the time, which is the point.
    """
    return {
        "person": txn.person.name if txn.person else None,
        "type": txn.type,
        "amount": money_str(txn.amount),
        "occurred_on": txn.occurred_on.isoformat() if txn.occurred_on else None,
        "due_date": txn.due_date.isoformat() if txn.due_date else None,
        "payment_method": txn.payment_method,
        "note": txn.note,
    }


def diff(before: dict, after: dict) -> dict:
    """Only the fields that actually moved: {field: {"from": x, "to": y}}."""
    return {
        key: {"from": before.get(key), "to": after.get(key)}
        for key in before
        if before.get(key) != after.get(key)
    }


def record(user_id, transaction_id, action, changes=None) -> None:
    db.session.add(
        TransactionAudit(
            user_id=user_id,
            transaction_id=transaction_id,
            action=action,
            changes=json.dumps(changes) if changes else None,
        )
    )


def history_for(user_id, transaction_id):
    """One transaction's history, newest first."""
    return (
        TransactionAudit.query.filter_by(user_id=user_id, transaction_id=transaction_id)
        .order_by(TransactionAudit.created_at.desc(), TransactionAudit.id.desc())
        .all()
    )


def clear_for_user(user_id) -> None:
    """Drop every audit row for an account.

    Used only when a backup restore replaces the records wholesale - audit rows
    describing transactions that no longer exist would be noise.
    """
    TransactionAudit.query.filter_by(user_id=user_id).delete(synchronize_session=False)
