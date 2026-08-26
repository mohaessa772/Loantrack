"""Backup and restore.

Your records live in one database file. This is what gets them onto a second
machine, or back after that file is lost.

Two rules shape the code below:

1. Validate EVERYTHING before writing ANYTHING. A restore that fails halfway
   would leave the account worse than it started - some records wiped, the
   replacements never written. So the whole file is checked first, and only then
   does a single database transaction replace the data.

2. Never trust ids from the file. A backup can be hand-edited, or come from a
   different account. People are re-inserted with fresh ids and the transactions
   are re-pointed at them.
"""

from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation

from ..errors import ConflictError, ValidationError
from ..extensions import db
from ..models import PAYMENT_METHODS, Person, Transaction, TransactionType
from ..money import MAX_AMOUNT, ZERO, money_str, to_money
from . import audit_service

# Bumped only when the shape below changes in a way older files cannot satisfy.
BACKUP_FORMAT = 1


# =======================================================================
# Export
# =======================================================================

def export_data(user) -> dict:
    """Everything belonging to this account, as plain JSON-safe values.

    Soft-deleted transactions are included: they are part of your history, and
    leaving them out would mean a restore silently loses the ability to undo.
    """
    people = Person.query.filter_by(user_id=user.id).order_by(Person.id).all()
    transactions = (
        Transaction.query.filter_by(user_id=user.id).order_by(Transaction.id).all()
    )

    return {
        "loantrack_backup": BACKUP_FORMAT,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "account": {
            "email": user.email,
            "display_name": user.display_name,
            "currency_code": user.currency_code,
        },
        "counts": {"people": len(people), "transactions": len(transactions)},
        "people": [
            {
                "id": person.id,
                "name": person.name,
                "phone": person.phone,
                "notes": person.notes,
                "created_at": person.created_at.isoformat() if person.created_at else None,
            }
            for person in people
        ],
        "transactions": [
            {
                "person_id": txn.person_id,
                "type": txn.type,
                "amount": money_str(txn.amount),
                "occurred_on": txn.occurred_on.isoformat() if txn.occurred_on else None,
                "due_date": txn.due_date.isoformat() if txn.due_date else None,
                "payment_method": txn.payment_method,
                "note": txn.note,
                "created_at": txn.created_at.isoformat() if txn.created_at else None,
                "deleted_at": txn.deleted_at.isoformat() if txn.deleted_at else None,
            }
            for txn in transactions
        ],
    }


# =======================================================================
# Import helpers - each returns a clean value or records an error
# =======================================================================

def _fail(message):
    raise ValidationError(message=message)


def _parse_date(value, label, where, required=True):
    if value in (None, ""):
        if required:
            _fail(f"{where}: {label} is missing.")
        return None
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except ValueError:
        _fail(f"{where}: {label} is not a valid date ({value!r}).")


def _parse_datetime(value):
    """Timestamps are cosmetic on import - a bad one is dropped, not fatal."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _parse_amount(value, where):
    try:
        amount = Decimal(str(value).strip())
    except (InvalidOperation, AttributeError):
        _fail(f"{where}: amount is not a number ({value!r}).")
    if not amount.is_finite() or amount <= 0:
        _fail(f"{where}: amount must be greater than zero.")
    if amount > MAX_AMOUNT:
        _fail(f"{where}: amount is too large.")
    if -amount.as_tuple().exponent > 2:
        _fail(f"{where}: amount has more than 2 decimal places.")
    return amount


def _clean_text(value, limit):
    if value is None:
        return None
    text = str(value).strip()
    return text[:limit] if text else None


# =======================================================================
# Import
# =======================================================================

def import_data(user, payload, mode="merge") -> dict:
    """Replace this account's people and transactions with a backup file.

    mode="replace" is required when the account already holds data - silently
    merging two sets of records would produce duplicates nobody asked for.
    """
    if not isinstance(payload, dict):
        _fail("That file is not a LoanTrack backup.")

    version = payload.get("loantrack_backup")
    if version != BACKUP_FORMAT:
        _fail(
            "This file was made by a different version of LoanTrack "
            f"(format {version!r}, expected {BACKUP_FORMAT})."
        )

    raw_people = payload.get("people")
    raw_transactions = payload.get("transactions")
    if not isinstance(raw_people, list) or not isinstance(raw_transactions, list):
        _fail("That backup is missing its people or transactions list.")

    has_data = (
        db.session.query(Person.query.filter_by(user_id=user.id).exists()).scalar()
        or db.session.query(
            Transaction.query.filter_by(user_id=user.id).exists()
        ).scalar()
    )
    if has_data and mode != "replace":
        raise ConflictError(
            "This account already has records. Restoring would replace all of "
            "them, so it has to be confirmed explicitly."
        )

    # ---------------- validate the whole file first ----------------
    clean_people = []
    seen_ids = set()
    for index, row in enumerate(raw_people, start=1):
        where = f"Person {index}"
        if not isinstance(row, dict):
            _fail(f"{where} is not an object.")
        name = _clean_text(row.get("name"), 120)
        if not name:
            _fail(f"{where}: name is required.")
        old_id = row.get("id")
        if old_id in seen_ids:
            _fail(f"{where}: duplicate id {old_id!r} in the file.")
        seen_ids.add(old_id)
        clean_people.append(
            {
                "old_id": old_id,
                "name": name,
                "phone": _clean_text(row.get("phone"), 32),
                "notes": _clean_text(row.get("notes"), 2000),
                "created_at": _parse_datetime(row.get("created_at")),
            }
        )

    # A phone number may appear at most once - the same partial unique index the
    # live app enforces. Better to say so now than to fail on insert.
    phones = [p["phone"] for p in clean_people if p["phone"]]
    if len(phones) != len(set(phones)):
        _fail("That backup has two people sharing a phone number.")

    clean_transactions = []
    for index, row in enumerate(raw_transactions, start=1):
        where = f"Transaction {index}"
        if not isinstance(row, dict):
            _fail(f"{where} is not an object.")

        person_ref = row.get("person_id")
        if person_ref not in seen_ids:
            _fail(f"{where}: refers to person {person_ref!r}, who is not in the file.")

        txn_type = str(row.get("type", "")).upper()
        if txn_type not in TransactionType.ALL:
            _fail(f"{where}: type must be LOAN or PAYMENT, not {row.get('type')!r}.")

        due_date = _parse_date(row.get("due_date"), "due date", where, required=False)
        if due_date and txn_type != TransactionType.LOAN:
            _fail(f"{where}: only a loan can have a due date.")

        method = _clean_text(row.get("payment_method"), 20)
        if method:
            method = method.upper()
            if method not in PAYMENT_METHODS:
                _fail(f"{where}: unknown payment method {method!r}.")

        clean_transactions.append(
            {
                "person_ref": person_ref,
                "type": txn_type,
                "amount": _parse_amount(row.get("amount"), where),
                "occurred_on": _parse_date(row.get("occurred_on"), "date", where),
                "due_date": due_date,
                "payment_method": method,
                "note": _clean_text(row.get("note"), 2000),
                "created_at": _parse_datetime(row.get("created_at")),
                "deleted_at": _parse_datetime(row.get("deleted_at")),
            }
        )

    _check_resulting_balances(user, clean_people, clean_transactions)

    # ---------------- nothing raised, so it is safe to write ----------------
    if has_data:
        # Transactions first: the database RESTRICTs deleting a person who still
        # has any.
        #
        # Deleted one object at a time rather than with a bulk query delete. A
        # bulk delete bypasses the session, so the old rows linger in SQLAlchemy's
        # identity map - and when SQLite hands a reused id to a newly inserted
        # person, the session finds two different objects claiming to be the same
        # row. Per-object deletes keep the session honest.
        # Audit rows point at transactions, so they go first.
        audit_service.clear_for_user(user.id)
        db.session.flush()
        for txn in Transaction.query.filter_by(user_id=user.id).all():
            db.session.delete(txn)
        db.session.flush()
        for person in Person.query.filter_by(user_id=user.id).all():
            db.session.delete(person)
        db.session.flush()

    id_map = {}
    for row in clean_people:
        person = Person(
            user_id=user.id,
            name=row["name"],
            phone=row["phone"],
            notes=row["notes"],
        )
        if row["created_at"]:
            person.created_at = row["created_at"]
        db.session.add(person)
        db.session.flush()  # assigns the new id
        id_map[row["old_id"]] = person.id

    for row in clean_transactions:
        txn = Transaction(
            user_id=user.id,
            person_id=id_map[row["person_ref"]],
            type=row["type"],
            amount=row["amount"],
            occurred_on=row["occurred_on"],
            due_date=row["due_date"],
            payment_method=row["payment_method"],
            note=row["note"],
            deleted_at=row["deleted_at"],
        )
        if row["created_at"]:
            txn.created_at = row["created_at"]
        db.session.add(txn)

    account = payload.get("account") or {}
    currency = _clean_text(account.get("currency_code"), 3)
    if currency:
        from ..api.settings import SUPPORTED_CURRENCIES

        if currency.upper() in SUPPORTED_CURRENCIES:
            user.currency_code = currency.upper()

    db.session.commit()

    return {
        "people": len(clean_people),
        "transactions": len(clean_transactions),
        "replaced": bool(has_data),
    }


def _check_resulting_balances(user, clean_people, clean_transactions):
    """Refuse a file that would leave someone owing a negative amount.

    A genuine backup can never do this - the app blocks overpayment on the way
    in. A hand-edited one can, and it is far better to reject the file than to
    import a state the rest of the app considers impossible.
    """
    from .transaction_service import overpayment_allowed

    if overpayment_allowed(user.id):
        return

    balances = {}
    for row in clean_transactions:
        if row["deleted_at"]:
            continue  # soft-deleted rows are outside every total
        signed = row["amount"] if row["type"] == TransactionType.LOAN else -row["amount"]
        balances[row["person_ref"]] = balances.get(row["person_ref"], ZERO) + signed

    names = {p["old_id"]: p["name"] for p in clean_people}
    for person_ref, balance in balances.items():
        if balance < ZERO:
            _fail(
                f"{names.get(person_ref, 'Someone')} would end up "
                f"{money_str(-to_money(balance))} in credit, which this app does "
                "not allow. The backup looks edited."
            )
