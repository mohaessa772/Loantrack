"""Settings route: /api/settings

DESIGN DECISION (Q6): the currency lives on the user row, not on each
transaction. Version 1 tracks one currency, and every amount in the database is
in it. Moving currency onto transactions later is an additive migration; going
the other way would not be.
"""

from flask import Blueprint, jsonify, request
from flask_login import current_user, login_required

from ..extensions import db
from ..validators import FieldErrors, clean_str, get_json

settings_bp = Blueprint("settings", __name__, url_prefix="/api/settings")

# Kept short and explicit on purpose. Adding a currency is one line here plus a
# formatting entry on the frontend.
SUPPORTED_CURRENCIES = {
    "MYR": "Malaysian Ringgit",
    "USD": "US Dollar",
    "EUR": "Euro",
    "GBP": "Pound Sterling",
    "SGD": "Singapore Dollar",
    "IDR": "Indonesian Rupiah",
    "SAR": "Saudi Riyal",
    "AED": "UAE Dirham",
}


@settings_bp.get("")
@login_required
def get_settings():
    return (
        jsonify(
            {
                "settings": {
                    "display_name": current_user.display_name,
                    "email": current_user.email,
                    "currency_code": current_user.currency_code,
                    "allow_overpayment": current_user.allow_overpayment,
                },
                "supported_currencies": [
                    {"code": code, "name": name}
                    for code, name in sorted(SUPPORTED_CURRENCIES.items())
                ],
            }
        ),
        200,
    )


@settings_bp.put("")
@login_required
def update_settings():
    data = get_json(request)
    errors = FieldErrors()

    display_name = clean_str(data.get("display_name"), 120)
    if not display_name:
        errors.add("display_name", "Display name is required.")

    currency = (clean_str(data.get("currency_code")) or "").upper()
    if currency not in SUPPORTED_CURRENCIES:
        errors.add("currency_code", "Choose a supported currency.")

    errors.raise_if_any()

    current_user.display_name = display_name
    current_user.currency_code = currency
    # Absent means "leave it alone", so a client that does not know about this
    # preference cannot silently switch it off.
    if "allow_overpayment" in data:
        current_user.allow_overpayment = bool(data.get("allow_overpayment"))
    db.session.commit()

    return jsonify({"settings": current_user.to_dict()}), 200


@settings_bp.post("/password")
@login_required
def change_password():
    """Changing a password requires proving you know the current one.

    Without that check, anyone who finds an unlocked laptop with the app open
    could lock the real owner out of their own account.
    """
    data = get_json(request)
    errors = FieldErrors()

    current_password = data.get("current_password") or ""
    new_password = data.get("new_password") or ""

    if not current_password:
        errors.add("current_password", "Enter your current password.")
    if len(new_password) < 8:
        errors.add("new_password", "New password must be at least 8 characters.")
    errors.raise_if_any()

    if not current_user.check_password(current_password):
        errors.add("current_password", "That is not your current password.")
        errors.raise_if_any()

    current_user.set_password(new_password)
    db.session.commit()
    return jsonify({"message": "Password updated."}), 200
