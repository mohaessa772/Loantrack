"""Authentication routes.

DESIGN DECISION (Q3): server-side sessions with an HttpOnly cookie
(Flask-Login), not a JWT in localStorage.

  - The cookie is HttpOnly, so JavaScript cannot read it. If this app ever has
    an XSS bug, the attacker still cannot steal the session. A token sitting in
    localStorage is readable by any script on the page.
  - Logging out genuinely ends the session on the server. A JWT stays valid
    until it expires no matter how many times you "log out".
  - The price we pay is CSRF: because the browser attaches the cookie
    automatically, another site could try to make your browser fire requests at
    us. That is what the CSRF token (and SameSite=Lax) defends against.

DESIGN DECISION (Q4, revised): public registration is enabled, controlled by
ALLOW_REGISTRATION in the config. The honest trade-off: an open sign-up form on
a public URL means anybody can create an account on your instance. They still
cannot see your data - every query is filtered by user_id - but they can use
your server. Turn it off in .env once your own account exists; the CLI
(`flask --app run.py create-user`) keeps working either way.
"""

import time
from collections import defaultdict

from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required, login_user, logout_user
from flask_wtf.csrf import generate_csrf

from ..errors import ApiError, ConflictError
from ..extensions import db
from ..models import User
from ..validators import (
    FieldErrors,
    clean_str,
    get_json,
    parse_email,
    parse_new_password,
)

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


# --- Login throttling ---------------------------------------------------
# Without this, an attacker can try passwords as fast as the network allows.
# An in-memory counter is enough for a single-process personal app; a real
# multi-server deployment would need shared storage.
_attempts = defaultdict(list)


def _throttle_key():
    return request.remote_addr or "unknown"


def _check_throttle():
    key = _throttle_key()
    window = current_app.config["LOGIN_LOCKOUT_SECONDS"]
    limit = current_app.config["LOGIN_MAX_ATTEMPTS"]
    now = time.time()

    _attempts[key] = [t for t in _attempts[key] if now - t < window]
    if len(_attempts[key]) >= limit:
        wait = int(window - (now - _attempts[key][0]))
        raise ApiError(
            f"Too many failed sign-in attempts. Try again in {max(wait, 1)} seconds.",
            status_code=429,
            code="TOO_MANY_REQUESTS",
        )


def _record_failure():
    _attempts[_throttle_key()].append(time.time())


def _clear_failures():
    _attempts.pop(_throttle_key(), None)


# --- Routes -------------------------------------------------------------

@auth_bp.get("/config")
def auth_config():
    """Lets the login page know whether to show a "create account" link.

    The frontend must never decide this on its own - if the server has sign-up
    switched off, a button that leads to a dead form is worse than no button.
    """
    return jsonify({"allow_registration": current_app.config["ALLOW_REGISTRATION"]}), 200


@auth_bp.post("/register")
def register():
    if not current_app.config["ALLOW_REGISTRATION"]:
        raise ApiError(
            "Sign-up is disabled on this server.", status_code=403, code="REGISTRATION_DISABLED"
        )

    data = get_json(request)
    errors = FieldErrors()

    email = parse_email(data.get("email"), errors)
    password = parse_new_password(data.get("password"), errors)
    display_name = clean_str(data.get("display_name"), 120) or "Me"
    currency = (clean_str(data.get("currency_code")) or "MYR").upper()

    # Confirmation is checked on the server too. The React form checks it first
    # for instant feedback, but a request sent with Postman skips that entirely.
    confirm = data.get("confirm_password")
    if confirm is not None and password and confirm != password:
        errors.add("confirm_password", "The two passwords do not match.")

    from ..api.settings import SUPPORTED_CURRENCIES

    if currency not in SUPPORTED_CURRENCIES:
        errors.add("currency_code", "Choose a supported currency.")

    errors.raise_if_any()

    if User.query.filter_by(email=email).first():
        # 409 CONFLICT, not 422: the data is valid, it just clashes with a row
        # that already exists.
        raise ConflictError(
            "An account with that email already exists.",
            fields={"email": "Already registered. Try signing in instead."},
        )

    user = User(email=email, display_name=display_name, currency_code=currency)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    # Sign them straight in - making someone log in immediately after choosing a
    # password is a pointless extra step.
    login_user(user, remember=True)
    return jsonify({"user": user.to_dict(), "csrf_token": generate_csrf()}), 201


@auth_bp.post("/login")
def login():
    _check_throttle()

    data = get_json(request)
    errors = FieldErrors()
    email = clean_str(data.get("email"), 255)
    password = data.get("password") or ""

    if not email:
        errors.add("email", "Email is required.")
    if not password:
        errors.add("password", "Password is required.")
    errors.raise_if_any()

    user = User.query.filter_by(email=User.normalise_email(email)).first()

    # One generic message for "no such user" and "wrong password". Saying
    # "no account with that email" would let someone enumerate valid accounts.
    if user is None or not user.check_password(password):
        _record_failure()
        raise ApiError("Incorrect email or password.", status_code=401, code="BAD_CREDENTIALS")

    _clear_failures()
    login_user(user, remember=bool(data.get("remember", True)))
    return jsonify({"user": user.to_dict(), "csrf_token": generate_csrf()}), 200


@auth_bp.post("/logout")
@login_required
def logout():
    logout_user()
    return "", 204


@auth_bp.get("/me")
def me():
    """Who am I? Called once when the React app boots.

    Returns 401 when nobody is signed in - that is not an error condition, it is
    how the frontend learns to show the login page.
    """
    if not current_user.is_authenticated:
        return (
            jsonify({"error": {"code": "UNAUTHENTICATED", "message": "Not signed in."}}),
            401,
        )
    return jsonify({"user": current_user.to_dict(), "csrf_token": generate_csrf()}), 200
