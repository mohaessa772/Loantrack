from datetime import datetime, timezone

from flask_login import UserMixin
from werkzeug.security import check_password_hash, generate_password_hash

from ..extensions import db


def utcnow():
    return datetime.now(timezone.utc)


class User(UserMixin, db.Model):
    """The person using the application - the lender.

    Version 1 is single-user, but every Person and Transaction still carries a
    user_id. That costs nothing today and means "support a second user" is a
    configuration change later instead of a rewrite.
    """

    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)

    # Stored lower-cased so "Ali@x.com" and "ali@x.com" are the same account.
    # unique=True creates a unique index, which also makes login lookups fast.
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)

    # The hash, never the password. If this database leaks, the attacker has a
    # scrypt hash that costs real CPU time to crack, not a list of passwords.
    password_hash = db.Column(db.String(255), nullable=False)

    display_name = db.Column(db.String(120), nullable=False, default="Me")

    # One currency per user in V1. Putting it here (rather than on every
    # transaction) keeps V1 simple; adding per-transaction currency later is an
    # additive migration.
    currency_code = db.Column(db.String(3), nullable=False, default="MYR")

    # DESIGN DECISION (Q1, revised): whether a payment may exceed what is owed.
    #
    # Off by default, because an overpayment is usually a typo - an extra zero,
    # or the wrong person picked - and rejecting it turns silent corruption into
    # a visible error. Turn it on if you genuinely receive more than you are
    # owed; the balance then goes negative and the person shows "In credit".
    allow_overpayment = db.Column(db.Boolean, nullable=False, default=False)

    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(
        db.DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    people = db.relationship(
        "Person", back_populates="user", cascade="all, delete-orphan", lazy="dynamic"
    )

    # --- password handling ------------------------------------------------
    def set_password(self, raw_password: str) -> None:
        # generate_password_hash uses scrypt by default in Werkzeug 3, with a
        # random salt baked into the output. Two users with the same password
        # therefore get different hashes.
        self.password_hash = generate_password_hash(raw_password)

    def check_password(self, raw_password: str) -> bool:
        # Constant-time comparison inside - it does not leak how many leading
        # characters were correct via timing.
        return check_password_hash(self.password_hash, raw_password)

    @staticmethod
    def normalise_email(email: str) -> str:
        return (email or "").strip().lower()

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "display_name": self.display_name,
            "currency_code": self.currency_code,
            "allow_overpayment": self.allow_overpayment,
        }

    def __repr__(self):
        return f"<User {self.email}>"
