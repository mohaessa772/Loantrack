"""Shared test fixtures.

pytest injects any fixture whose name matches a test function's argument. That
is how `def test_x(client)` below gets a logged-in API client without any setup
code inside the test itself.
"""

import os
import sys
from datetime import date, timedelta
from decimal import Decimal

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app  # noqa: E402
from app.config import TestConfig  # noqa: E402
from app.extensions import db as _db  # noqa: E402
from app.models import Person, Transaction, TransactionType, User  # noqa: E402

TEST_EMAIL = "tester@example.com"
TEST_PASSWORD = "supersecret123"


@pytest.fixture
def app():
    """A fresh application with an empty in-memory database for every test.

    Isolation matters: a test that passes only because a previous test left data
    behind is worse than no test at all.
    """
    application = create_app(TestConfig)
    with application.app_context():
        _db.create_all()
        yield application
        _db.session.remove()
        _db.drop_all()


@pytest.fixture
def db(app):
    return _db


@pytest.fixture
def user(db):
    account = User(email=TEST_EMAIL, display_name="Tester", currency_code="MYR")
    account.set_password(TEST_PASSWORD)
    db.session.add(account)
    db.session.commit()
    return account


@pytest.fixture
def anon_client(app):
    """A client with no session - used for the authentication tests."""
    return app.test_client()


@pytest.fixture
def client(app, user):
    """A client that is already signed in."""
    test_client = app.test_client()
    response = test_client.post(
        "/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
    )
    assert response.status_code == 200
    return test_client


@pytest.fixture
def person(db, user):
    record = Person(user_id=user.id, name="Mohammed", phone="012-3456789")
    db.session.add(record)
    db.session.commit()
    return record


@pytest.fixture
def make_transaction(db, user):
    """Factory fixture: build transactions inline inside a test."""

    def _make(person, txn_type, amount, days_ago=0, due_in=None, note=None):
        txn = Transaction(
            user_id=user.id,
            person_id=person.id,
            type=txn_type,
            amount=Decimal(str(amount)),
            occurred_on=date.today() - timedelta(days=days_ago),
            due_date=(date.today() + timedelta(days=due_in))
            if due_in is not None and txn_type == TransactionType.LOAN
            else None,
            note=note,
        )
        db.session.add(txn)
        db.session.commit()
        return txn

    return _make
