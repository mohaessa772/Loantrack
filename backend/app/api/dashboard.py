"""Dashboard route: /api/dashboard

One endpoint returns every number the dashboard needs. The alternative - the
frontend firing six requests and stitching them together - is slower, harder to
keep consistent (the numbers could come from six different instants), and gives
the browser six chances to fail instead of one.
"""

from flask import Blueprint, jsonify
from flask_login import current_user, login_required

from ..money import ZERO, money_str
from ..services import balances, transaction_service

dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")


@dashboard_bp.get("")
@login_required
def dashboard():
    totals = balances.overall_totals(current_user.id)
    people = balances.people_with_balances(current_user.id)

    owing = [p for p in people if p["outstanding"] > ZERO]
    overdue_people = [p for p in people if p["status"] == balances.STATUS_OVERDUE]
    settled = [p for p in people if p["outstanding"] == ZERO and p["transaction_count"] > 0]

    top_debtors = sorted(owing, key=lambda p: p["outstanding"], reverse=True)[:5]

    recent = transaction_service.query_transactions(current_user.id).limit(8).all()
    due = transaction_service.upcoming_and_overdue(current_user.id, within_days=14)

    return (
        jsonify(
            {
                "currency_code": current_user.currency_code,
                "totals": {
                    "total_lent": money_str(totals["total_lent"]),
                    "total_repaid": money_str(totals["total_repaid"]),
                    "outstanding": money_str(totals["outstanding"]),
                    "transaction_count": totals["transaction_count"],
                },
                "counts": {
                    "people": len(people),
                    "people_owing": len(owing),
                    "people_settled": len(settled),
                    "people_overdue": len(overdue_people),
                },
                "top_debtors": [
                    {
                        "id": p["id"],
                        "name": p["name"],
                        "phone": p["phone"],
                        "outstanding": money_str(p["outstanding"]),
                        "status": p["status"],
                        "overdue_since": p["overdue_since"],
                    }
                    for p in top_debtors
                ],
                "recent_transactions": [t.to_dict() for t in recent],
                "due": {
                    "overdue_count": len(due["overdue"]),
                    "upcoming_count": len(due["upcoming"]),
                    "overdue": due["overdue"][:5],
                    "upcoming": due["upcoming"][:5],
                },
            }
        ),
        200,
    )
