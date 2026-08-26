"""Command line tools.

Run them with:  flask --app run.py <command>

Accounts are created here rather than through a public /register endpoint. With
a single intended user, a registration route is an open door for no benefit.
"""

from datetime import date, timedelta
from decimal import Decimal

import click
from flask.cli import with_appcontext

from .extensions import db
from .models import Person, Transaction, TransactionType, User


def register_cli(app):
    app.cli.add_command(init_db)
    app.cli.add_command(create_user)
    app.cli.add_command(seed_demo)
    app.cli.add_command(reset_password)


@click.command("init-db")
@with_appcontext
def init_db():
    """Bring the database schema up to date by running the migrations.

    This replaces the old create_all() call. create_all() can only CREATE tables
    that do not exist yet - it cannot ALTER one that already holds data, so the
    moment you add a column it leaves you choosing between losing your records
    and writing SQL by hand.

    Migrations solve that: each schema change is a numbered file, and Alembic
    records which ones a database has already run. Safe on an empty database and
    on one with years of transactions in it.
    """
    from flask_migrate import upgrade

    upgrade()
    click.secho("Database schema is up to date.", fg="green")


@click.command("create-user")
@click.option("--email", prompt=True, help="Login email.")
@click.option(
    "--password",
    prompt=True,
    hide_input=True,
    confirmation_prompt=True,
    help="At least 8 characters.",
)
@click.option("--name", default="Me", help="Display name.")
@click.option("--currency", default="MYR", help="Default currency code.")
@with_appcontext
def create_user(email, password, name, currency):
    """Create the account you will sign in with."""
    email = User.normalise_email(email)

    if len(password) < 8:
        click.secho("Password must be at least 8 characters.", fg="red")
        raise SystemExit(1)

    if User.query.filter_by(email=email).first():
        click.secho(f"A user with email {email} already exists.", fg="red")
        raise SystemExit(1)

    user = User(email=email, display_name=name, currency_code=currency.upper())
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    click.secho(f"Created user {email}.", fg="green")


@click.command("reset-password")
@click.option("--email", prompt=True)
@click.option("--password", prompt=True, hide_input=True, confirmation_prompt=True)
@with_appcontext
def reset_password(email, password):
    """Set a new password for an existing account."""
    user = User.query.filter_by(email=User.normalise_email(email)).first()
    if not user:
        click.secho("No such user.", fg="red")
        raise SystemExit(1)
    user.set_password(password)
    db.session.commit()
    click.secho("Password updated.", fg="green")


@click.command("seed-demo")
@click.option("--email", prompt=True, help="Which account to add demo data to.")
@with_appcontext
def seed_demo(email):
    """Add a few people and transactions so there is something to look at."""
    user = User.query.filter_by(email=User.normalise_email(email)).first()
    if not user:
        click.secho("No such user. Run create-user first.", fg="red")
        raise SystemExit(1)

    today = date.today()

    demo = [
        # (name, phone, notes, [(type, amount, days_ago, note, method, due_in_days)])
        (
            "Mohammed",
            "012-3456789",
            "Cousin",
            [
                ("LOAN", "1000.00", 60, "Emergency", None, -30),
                ("PAYMENT", "300.00", 45, "Partial repayment", "CASH", None),
                ("LOAN", "500.00", 20, "Additional loan", None, 25),
                ("PAYMENT", "200.00", 5, "Bank transfer", "BANK_TRANSFER", None),
            ],
        ),
        (
            "Aisha",
            "013-2223333",
            "Work colleague",
            [
                ("LOAN", "250.00", 15, "Lunch money for the week", None, 5),
                ("PAYMENT", "250.00", 2, "Settled in full", "EWALLET", None),
            ],
        ),
        (
            "Daniel",
            "016-7778888",
            None,
            [
                ("LOAN", "1800.00", 120, "Car repair", None, -60),
                ("PAYMENT", "400.00", 90, None, "CASH", None),
            ],
        ),
        ("Siti", "011-4445555", "Neighbour - no transactions yet", []),
    ]

    created = 0
    for name, phone, notes, txns in demo:
        if Person.query.filter_by(user_id=user.id, name=name).first():
            continue
        person = Person(user_id=user.id, name=name, phone=phone, notes=notes)
        db.session.add(person)
        db.session.flush()  # assigns person.id without committing yet

        for txn_type, amount, days_ago, note, method, due_in in txns:
            occurred = today - timedelta(days=days_ago)
            db.session.add(
                Transaction(
                    user_id=user.id,
                    person_id=person.id,
                    type=getattr(TransactionType, txn_type),
                    amount=Decimal(amount),
                    occurred_on=occurred,
                    due_date=(today + timedelta(days=due_in))
                    if (due_in is not None and txn_type == "LOAN")
                    else None,
                    payment_method=method,
                    note=note,
                )
            )
        created += 1

    db.session.commit()
    click.secho(f"Seeded {created} people with demo transactions.", fg="green")
