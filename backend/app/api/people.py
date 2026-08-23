"""People routes: /api/people"""

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..money import money_str
from ..services import balances, people_service, transaction_service
from ..validators import (
    FieldErrors,
    clean_str,
    get_json,
    parse_phone,
    parse_required_name,
)

people_bp = Blueprint("people", __name__, url_prefix="/api/people")


def _serialise(person_row):
    """Money values come out of the service layer as Decimal; the API sends strings."""
    row = dict(person_row)
    for key in ("total_lent", "total_repaid", "outstanding"):
        if key in row:
            row[key] = money_str(row[key])
    return row


def _read_person_payload():
    data = get_json(request)
    errors = FieldErrors()
    name = parse_required_name(data.get("name"), errors)
    phone = parse_phone(data.get("phone"), errors)
    notes = clean_str(data.get("notes"), 2000)
    errors.raise_if_any()
    return name, phone, notes


@people_bp.get("")
@login_required
def list_people():
    """List people with balances. Supports ?q= search and ?status= filter.

    Every person is returned in one query - see balances.people_with_balances
    for why that matters.
    """
    search = clean_str(request.args.get("q"), 120)
    status = clean_str(request.args.get("status"))
    sort = clean_str(request.args.get("sort")) or "name"

    rows = balances.people_with_balances(current_user.id, search=search)

    if status:
        rows = [r for r in rows if r["status"] == status.upper()]

    if sort == "outstanding":
        rows.sort(key=lambda r: r["outstanding"], reverse=True)
    elif sort == "recent":
        rows.sort(key=lambda r: (r["last_activity"] or ""), reverse=True)
    else:
        rows.sort(key=lambda r: r["name"].lower())

    return jsonify({"people": [_serialise(r) for r in rows]}), 200


@people_bp.post("")
@login_required
def create_person():
    name, phone, notes = _read_person_payload()
    person = people_service.create_person(current_user.id, name, phone, notes)
    # 201 Created, not 200: a new resource now exists at a new id.
    return jsonify({"person": person.to_dict()}), 201


@people_bp.get("/<int:person_id>")
@login_required
def get_person(person_id):
    person = people_service.get_owned_person(current_user.id, person_id)
    totals = balances.person_totals(current_user.id, person_id)
    flags = balances.person_overdue_flags(current_user.id, person_id)

    has_overdue = flags["overdue_since"] is not None and totals["outstanding"] > 0

    payload = person.to_dict()
    payload.update(
        {
            "total_lent": money_str(totals["total_lent"]),
            "total_repaid": money_str(totals["total_repaid"]),
            "outstanding": money_str(totals["outstanding"]),
            "status": balances.resolve_status(totals["outstanding"], has_overdue),
            "overdue_since": flags["overdue_since"].isoformat() if has_overdue else None,
            "next_due_date": flags["next_due_date"].isoformat()
            if flags["next_due_date"]
            else None,
        }
    )
    return jsonify({"person": payload}), 200


@people_bp.put("/<int:person_id>")
@login_required
def update_person(person_id):
    name, phone, notes = _read_person_payload()
    person = people_service.update_person(current_user.id, person_id, name, phone, notes)
    return jsonify({"person": person.to_dict()}), 200


@people_bp.delete("/<int:person_id>")
@login_required
def delete_person(person_id):
    people_service.delete_person(current_user.id, person_id)
    # 204 No Content: it worked, and there is nothing meaningful to send back.
    return "", 204


@people_bp.get("/<int:person_id>/transactions")
@login_required
def person_statement(person_id):
    """The account statement: every transaction with the running balance.

    This is the most important read endpoint in the app.
    """
    person = people_service.get_owned_person(current_user.id, person_id)

    txns = transaction_service.query_transactions(
        current_user.id, person_id=person.id
    ).all()

    # build_statement sorts oldest-first and accumulates the balance.
    statement = balances.build_statement(txns)

    rows = []
    for txn, balance_after in statement:
        row = txn.to_dict(person_name=person.name)
        row["balance_after"] = money_str(balance_after)
        row["is_overdue"] = txn.is_overdue()
        rows.append(row)

    # Newest first for display; the balances were already computed chronologically.
    rows.reverse()

    totals = balances.totals_from(txns)
    return (
        jsonify(
            {
                "person": person.to_dict(),
                "totals": {
                    "total_lent": money_str(totals["total_lent"]),
                    "total_repaid": money_str(totals["total_repaid"]),
                    "outstanding": money_str(totals["outstanding"]),
                },
                "transactions": rows,
            }
        ),
        200,
    )
