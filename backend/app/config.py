"""Application configuration.

Every secret and every environment-specific value is read from the environment,
never hard-coded. That is what lets the same code run on your laptop against
SQLite and in production against PostgreSQL without editing a single line.
"""

import os
from datetime import timedelta


def _bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _normalise_db_url(url: str) -> str:
    # Some hosting providers (Heroku, Render) hand out "postgres://" URLs, but
    # SQLAlchemy 2.x only recognises the "postgresql://" scheme.
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    return url


class Config:
    ENV = os.environ.get("FLASK_ENV", "development")

    # --- Security -------------------------------------------------------
    # SECRET_KEY signs the session cookie. If an attacker learns it they can
    # forge a login session, so it must be random and must never be committed.
    SECRET_KEY = os.environ.get("SECRET_KEY")

    # --- Database -------------------------------------------------------
    SQLALCHEMY_DATABASE_URI = _normalise_db_url(
        os.environ.get("DATABASE_URL", "sqlite:///loantracker.db")
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}

    # --- Session cookie -------------------------------------------------
    # HttpOnly  -> JavaScript cannot read the cookie, so an XSS bug cannot
    #              steal the session.
    # SameSite  -> the browser refuses to send the cookie on cross-site form
    #              posts, which blocks the simplest kind of CSRF attack.
    # Secure    -> the cookie is only sent over HTTPS. Must be true in prod.
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = _bool("SESSION_COOKIE_SECURE", False)
    PERMANENT_SESSION_LIFETIME = timedelta(days=14)

    # CSRF tokens should not expire while a form is open on screen; the session
    # lifetime above is the real limit.
    WTF_CSRF_TIME_LIMIT = None

    CORS_ORIGINS = [
        origin.strip()
        for origin in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
        if origin.strip()
    ]

    # --- Business rules -------------------------------------------------
    DEFAULT_CURRENCY = os.environ.get("DEFAULT_CURRENCY", "MYR")

    # Public sign-up. Convenient while you are building, but it means anyone who
    # reaches the URL can create an account. Set ALLOW_REGISTRATION=false in .env
    # once your own account exists and the app is on the public internet - the
    # CLI (`flask --app run.py create-user`) still works when it is off.
    ALLOW_REGISTRATION = _bool("ALLOW_REGISTRATION", True)

    # Login throttling: how many failed attempts before we make the caller wait.
    LOGIN_MAX_ATTEMPTS = int(os.environ.get("LOGIN_MAX_ATTEMPTS", "10"))
    LOGIN_LOCKOUT_SECONDS = int(os.environ.get("LOGIN_LOCKOUT_SECONDS", "300"))

    @staticmethod
    def resolve_secret_key() -> str:
        key = Config.SECRET_KEY
        if key:
            return key
        if Config.ENV == "production":
            raise RuntimeError(
                "SECRET_KEY is not set. Refusing to start in production without it."
            )
        print(
            "\n  WARNING: SECRET_KEY is not set - using an insecure development key.\n"
            "  Create backend/.env and set SECRET_KEY before deploying.\n"
        )
        return "dev-only-insecure-key-do-not-use-in-production"


class TestConfig(Config):
    ENV = "testing"
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    # Tests call the API directly, so there is no browser to carry a CSRF token.
    WTF_CSRF_ENABLED = False
    LOGIN_MAX_ATTEMPTS = 1000
