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

DESIGN DECISION (Q4): there is no public registration route. With one intended
user, /register is pure attack surface. Accounts are created from the command
line: `flask --app run.py create-user`.
"""

import time
from collections import defaultdict

from flask import Blueprint, current_app, jsonify, request
from flask_login import current_user, login_required, login_user, logout_user
from flask_wtf.csrf import generate_csrf

from ..errors import ApiError
from ..models import User
from ..validators import FieldErrors, clean_str, get_json

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
