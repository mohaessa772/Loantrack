"""Transaction routes: /api/transactions"""

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..services import transaction_service
from ..validators import (
    FieldErrors,
    clean_str,
    get_json,
    parse_amount,
    parse_date,
    parse_int,
    parse_payment_method,
    parse_type,
)

transactions_bp = Blueprint("transactions", __name__, url_prefix="/api/transactions")


def _read_payload():
    data = get_json(request)
    errors = FieldErrors()

    person_id = parse_int(data.get("person_id"), default=None, minimum=1)
    if person_id is None:
        errors.add("person_id", "Choose a person.")

    txn_type = parse_type(data.get("type"), errors)
    amount = parse_amount(data.get("amount"), errors)
    occurred_on = parse_date(data.get("occurred_on"), errors, "occurred_on", required=True)
    due_date = parse_date(data.get("due_date"), errors, "due_date", required=False)
    payment_method = parse_payment_method(data.get("payment_method"), errors)
    note = clean_str(data.get("note"), 2000)

    errors.raise_if_any()
    return {
        "person_id": person_id,
        "txn_type": txn_type,
        "amount": amount,
        "occurred_on": occurred_on,
        "due_date": due_date,
        "payment_method": payment_method,
        "note": note,
    }


@transactions_bp.get("")
@login_required
def list_transactions():
    """Filterable, paginated history.

    Supported query parameters:
        type=LOAN|PAYMENT
        person_id=<id>
        preset=today|week|month|year
        from=YYYY-MM-DD & to=YYYY-MM-DD
        q=<text in note>
        page, per_page
    """
    errors = FieldErrors()

    txn_type = clean_str(request.args.get("type"))
    if txn_type:
        txn_type = parse_type(txn_type, errors)

    person_id = parse_int(request.args.get("person_id"), default=None, minimum=1)

    preset = clean_str(request.args.get("preset"))
    date_from = date_to = None
    if preset and preset.lower() != "all":
        date_from, date_to = transaction_service.date_range_for_preset(preset)
    else:
        date_from = parse_date(request.args.get("from"), errors, "from", required=False)
        date_to = parse_date(request.args.get("to"), errors, "to", required=False)

    errors.raise_if_any()

    if date_from and date_to and date_from > date_to:
        errors.add("from", "Start date must be before the end date.")
        errors.raise_if_any()

    page = parse_int(request.args.get("page"), default=1, minimum=1)
    per_page = parse_int(request.args.get("per_page"), default=25, minimum=1, maximum=200)

    query = transaction_service.query_transactions(
        current_user.id,
        person_id=person_id,
        txn_type=txn_type,
        date_from=date_from,
        date_to=date_to,
        search=clean_str(request.args.get("q"), 200),
    )

    # Pagination protects the server from "SELECT everything" on a big table and
    # keeps the response small enough for the browser to render quickly.
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return (
        jsonify(
            {
                "transactions": [t.to_dict() for t in pagination.items],
                "pagination": {
                    "page": pagination.page,
                    "per_page": pagination.per_page,
                    "total": pagination.total,
                    "pages": pagination.pages,
                    "has_next": pagination.has_next,
                    "has_prev": pagination.has_prev,
                },
            }
        ),
        200,
    )


@transactions_bp.post("")
@login_required
def create_transaction():
    payload = _read_payload()
    txn = transaction_service.create_transaction(current_user.id, **payload)
    return jsonify({"transaction": txn.to_dict()}), 201


@transactions_bp.get("/<int:transaction_id>")
@login_required
def get_transaction(transaction_id):
    txn = transaction_service.get_owned_transaction(current_user.id, transaction_id)
    return jsonify({"transaction": txn.to_dict()}), 200


@transactions_bp.put("/<int:transaction_id>")
@login_required
def update_transaction(transaction_id):
    payload = _read_payload()
    txn = transaction_service.update_transaction(
        current_user.id, transaction_id, **payload
    )
    return jsonify({"transaction": txn.to_dict()}), 200


@transactions_bp.delete("/<int:transaction_id>")
@login_required
def delete_transaction(transaction_id):
    transaction_service.delete_transaction(current_user.id, transaction_id)
    return "", 204


@transactions_bp.get("/deleted")
@login_required
def list_deleted_transactions():
    """Recently deleted transactions, so a mis-click is recoverable.

    Route order is safe: "/deleted" cannot match "/<int:transaction_id>",
    because the int converter only accepts digits.
    """
    rows = transaction_service.list_deleted(current_user.id)
    return jsonify({"transactions": [t.to_dict() for t in rows]}), 200


@transactions_bp.post("/<int:transaction_id>/restore")
@login_required
def restore_transaction(transaction_id):
    txn = transaction_service.restore_transaction(current_user.id, transaction_id)
    return jsonify({"transaction": txn.to_dict()}), 200


@transactions_bp.get("/due")
@login_required
def due_transactions():
    within = parse_int(request.args.get("days"), default=14, minimum=1, maximum=365)
    return jsonify(transaction_service.upcoming_and_overdue(current_user.id, within)), 200
