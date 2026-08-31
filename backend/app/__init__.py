"""Application factory.

Why a factory function instead of a module-level `app = Flask(__name__)`?
Because tests need a *different* app (in-memory database, CSRF off) from the one
you run in development. A function that builds an app on demand gives us that
for free, and it removes the import-time side effects that make Flask projects
hard to test.
"""

import os

from flask import Flask, jsonify, send_from_directory
from flask_wtf.csrf import generate_csrf
from sqlalchemy import event
from sqlalchemy.engine import Engine

from .config import Config, ProductionConfig, TestConfig
from .errors import register_error_handlers
from .extensions import cors, csrf, db, login_manager, migrate


@event.listens_for(Engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection, connection_record):
    """SQLite ignores foreign keys unless you ask it not to.

    Without this, the ON DELETE RESTRICT that protects transactions from being
    orphaned would silently do nothing in local development, and you would only
    discover the difference in production on PostgreSQL.
    """
    if dbapi_connection.__class__.__module__.startswith("sqlite3"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def create_app(config_object=None):
    app = Flask(__name__, static_folder=None)

    app.config.from_object(config_object or Config)
    if config_object is not TestConfig:
        app.config["SECRET_KEY"] = Config.resolve_secret_key()
    else:
        app.config["SECRET_KEY"] = "testing-key"

    _init_extensions(app)
    _register_security_headers(app)
    _register_blueprints(app)
    register_error_handlers(app)
    _register_cli(app)
    _register_frontend(app)

    # Production start-up check: refuses to boot on a misconfiguration that
    # would be silent and expensive, and warns about the rest.
    if config_object is ProductionConfig:
        ProductionConfig.check(app)

    return app


def _register_security_headers(app):
    """Headers that tell the browser to be strict with our pages.

    None of these change how the app works; they close off whole categories of
    attack by declining browser behaviour we never want.

    Deliberately NOT here:
      Strict-Transport-Security - it tells a browser "only ever use HTTPS for
        this host", cached for as long as it says. Sending it before HTTPS
        actually works would lock you out of your own site.
      Content-Security-Policy - worth adding, but it needs to be written
        against the real page (Google Fonts, inline styles) and tested, or it
        silently breaks the UI.
    """

    @app.after_request
    def set_security_headers(response):
        # Stop the browser guessing a response is HTML when we said it is JSON.
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        # Refuse to be embedded in a frame - blocks clickjacking.
        response.headers.setdefault("X-Frame-Options", "DENY")
        # Do not leak the page someone came from to other sites.
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        # This app needs none of these device APIs.
        response.headers.setdefault(
            "Permissions-Policy", "geolocation=(), microphone=(), camera=()"
        )
        return response


def _init_extensions(app):
    db.init_app(app)
    migrate.init_app(app, db)
    csrf.init_app(app)
    login_manager.init_app(app)

    # CORS matters only if the browser talks to the API on a different origin.
    # In development we use the Vite proxy instead (same origin, no CORS at
    # all), but this stays configured for deployments that split the two.
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
        supports_credentials=True,  # required for the session cookie to travel
    )

    from .models import User  # imported here to avoid a circular import

    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, int(user_id))

    @login_manager.unauthorized_handler
    def unauthorized():
        # Flask-Login's default is a redirect to a login *page*. This is a JSON
        # API, so a redirect would give the frontend an HTML body it cannot
        # parse. 401 is the correct answer.
        return (
            jsonify(
                {"error": {"code": "UNAUTHENTICATED", "message": "Please sign in."}}
            ),
            401,
        )

    @app.after_request
    def set_csrf_cookie(response):
        """Hand the frontend a CSRF token it can echo back in a header.

        The session cookie is HttpOnly so JavaScript cannot read it. This one is
        deliberately readable: the frontend reads it and sends it back as the
        X-CSRFToken header. A malicious site can make your browser send the
        session cookie, but it cannot read this cookie to build the header -
        which is exactly what stops the attack.
        """
        if response.status_code < 500:
            response.set_cookie(
                "csrf_token",
                generate_csrf(),
                secure=app.config["SESSION_COOKIE_SECURE"],
                samesite="Lax",
                httponly=False,
            )
        return response


def _register_blueprints(app):
    from .api import ALL_BLUEPRINTS

    for blueprint in ALL_BLUEPRINTS:
        app.register_blueprint(blueprint)

    @app.get("/api/health")
    def health():
        """A trivial endpoint that proves the server is up. Deployment platforms
        poll something like this to decide whether a release is healthy."""
        return jsonify({"status": "ok"}), 200


def _register_cli(app):
    from .cli import register_cli

    register_cli(app)


def _register_frontend(app):
    """Serve the built React app in production.

    In development the React dev server runs separately on port 5173. In
    production `npm run build` produces static files and Flask serves them, so
    the whole app is one origin - which also means no CORS and a simpler,
    safer cookie setup.
    """
    dist = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "frontend", "dist")
    dist = os.path.abspath(dist)

    @app.get("/", defaults={"path": ""})
    @app.get("/<path:path>")
    def serve_frontend(path):
        if not os.path.isdir(dist):
            return (
                jsonify(
                    {
                        "message": "API is running. Start the React dev server "
                        "with `npm run dev` in the frontend folder.",
                        "health": "/api/health",
                    }
                ),
                200,
            )
        full_path = os.path.join(dist, path)
        if path and os.path.isfile(full_path):
            return send_from_directory(dist, path)
        # Anything else is a client-side route - hand back index.html and let
        # React Router decide what to render.
        return send_from_directory(dist, "index.html")
