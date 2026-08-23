"""Centralised error handling.

Every failure in this API returns the same JSON shape:

    { "error": { "code": "...", "message": "...", "fields": {...} } }

A predictable error shape means the frontend needs exactly one function to
display errors, instead of guessing what came back each time.
"""

import logging

from flask import jsonify
from werkzeug.exceptions import HTTPException

log = logging.getLogger(__name__)


class ApiError(Exception):
    """An error we raised deliberately, with an HTTP status we chose."""

    status_code = 400
    code = "BAD_REQUEST"

    def __init__(self, message, status_code=None, code=None, fields=None):
        super().__init__(message)
        self.message = message
        if status_code is not None:
            self.status_code = status_code
        if code is not None:
            self.code = code
        self.fields = fields or {}

    def to_dict(self):
        payload = {"code": self.code, "message": self.message}
        if self.fields:
            payload["fields"] = self.fields
        return {"error": payload}


class ValidationError(ApiError):
    """The request was well-formed JSON but the values are not acceptable.

    422 rather than 400: 400 means "I could not parse this", 422 means "I parsed
    it fine, but 'amount: -5' is not a thing I can accept".
    """

    status_code = 422
    code = "VALIDATION_FAILED"

    def __init__(self, message="Please correct the highlighted fields.", fields=None):
        super().__init__(message, fields=fields)


class NotFoundError(ApiError):
    status_code = 404
    code = "NOT_FOUND"

    def __init__(self, message="Not found."):
        super().__init__(message)


class ConflictError(ApiError):
    """The request is valid but clashes with the current state of the data.

    Example: deleting a person who still has transactions.
    """

    status_code = 409
    code = "CONFLICT"

    def __init__(self, message="That conflicts with existing data.", fields=None):
        super().__init__(message, fields=fields)


class AuthError(ApiError):
    status_code = 401
    code = "UNAUTHENTICATED"

    def __init__(self, message="You need to sign in."):
        super().__init__(message)


_HTTP_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHENTICATED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    422: "VALIDATION_FAILED",
    429: "TOO_MANY_REQUESTS",
}


def register_error_handlers(app):
    @app.errorhandler(ApiError)
    def handle_api_error(err):
        return jsonify(err.to_dict()), err.status_code

    @app.errorhandler(HTTPException)
    def handle_http_error(err):
        # Covers 404 on unknown routes, 405 wrong method, 400 bad JSON, and the
        # 400 that Flask-WTF raises for a missing or invalid CSRF token.
        code = _HTTP_CODES.get(err.code, "HTTP_ERROR")
        message = err.description or "Request failed."
        if err.code == 400 and "CSRF" in str(message):
            code = "CSRF_FAILED"
            message = "Your session expired. Please refresh the page and try again."
        return jsonify({"error": {"code": code, "message": message}}), err.code

    @app.errorhandler(Exception)
    def handle_unexpected_error(err):
        # Anything that reaches here is a bug in our code. We log the real
        # traceback for ourselves but tell the client nothing about it - stack
        # traces in an HTTP response leak file paths and library versions.
        log.exception("Unhandled exception")
        return (
            jsonify(
                {
                    "error": {
                        "code": "INTERNAL_ERROR",
                        "message": "Something went wrong on our side.",
                    }
                }
            ),
            500,
        )
