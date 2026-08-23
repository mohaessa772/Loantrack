"""Transaction API tests - the rules that guard the money."""

from datetime import date, timedelta

from app.models import Transaction, TransactionType


def payload(person, **overrides):
    body = {
        "person_id": person.id,
        "type": "LOAN",
        "amount": "100.00",
        "occurred_on": date.today().isoformat(),
    }
    body.update(overrides)
    return body


class TestCreate:
    def test_create_loan(self, client, person):
        response = client.post("/api/transactions", json=payload(person))
        assert response.status_code == 201
        assert response.get_json()["transaction"]["amount"] == "100.00"

    def test_create_payment(self, client, person):
        client.post("/api/transactions", json=payload(person, amount="500.00"))
        response = client.post(
            "/api/transactions", json=payload(person, type="PAYMENT", amount="200.00")
        )
        assert response.status_code == 201

    def test_unknown_person_is_404(self, client, person):
        response = client.post("/api/transactions", json=payload(person, person_id=999999))
        assert response.status_code == 404

    def test_note_and_method_are_saved(self, client, person):
        response = client.post(
            "/api/transactions",
            json=payload(person, note="Emergency", payment_method="BANK_TRANSFER"),
        )
        body = response.get_json()["transaction"]
        assert body["note"] == "Emergency"
        assert body["payment_method"] == "BANK_TRANSFER"


class TestAmountValidation:
    def test_negative_is_rejected(self, client, person):
        response = client.post("/api/transactions", json=payload(person, amount="-50"))
        assert response.status_code == 422
        assert "amount" in response.get_json()["error"]["fields"]

    def test_zero_is_rejected(self, client, person):
        assert client.post("/api/transactions", json=payload(person, amount="0")).status_code == 422

    def test_text_is_rejected(self, client, person):
        assert (
            client.post("/api/transactions", json=payload(person, amount="abc")).status_code == 422
        )

    def test_three_decimal_places_is_rejected(self, client, person):
        """Money has two decimal places. 10.999 would have to be rounded, and
        silently rounding someone's money is not acceptable."""
        assert (
            client.post("/api/transactions", json=payload(person, amount="10.999")).status_code
            == 422
        )

    def test_missing_amount_is_rejected(self, client, person):
        assert client.post("/api/transactions", json=payload(person, amount="")).status_code == 422

    def test_absurdly_large_is_rejected(self, client, person):
        assert (
            client.post("/api/transactions", json=payload(person, amount="99999999999999")).status_code
            == 422
        )

    def test_two_decimals_are_accepted(self, client, person):
        assert (
            client.post("/api/transactions", json=payload(person, amount="0.01")).status_code == 201
        )


class TestTypeAndDateValidation:
    def test_invalid_type(self, client, person):
        assert client.post("/api/transactions", json=payload(person, type="GIFT")).status_code == 422

    def test_invalid_date_format(self, client, person):
        assert (
            client.post("/api/transactions", json=payload(person, occurred_on="21-08-2026")).status_code
            == 422
        )

    def test_a_payment_cannot_have_a_due_date(self, client, person):
        client.post("/api/transactions", json=payload(person, amount="500"))
        response = client.post(
            "/api/transactions",
            json=payload(
                person,
                type="PAYMENT",
                amount="100",
                due_date=(date.today() + timedelta(days=30)).isoformat(),
            ),
        )
        assert response.status_code == 422
        assert "due_date" in response.get_json()["error"]["fields"]

    def test_due_date_before_loan_date_is_rejected(self, client, person):
        response = client.post(
            "/api/transactions",
            json=payload(person, due_date=(date.today() - timedelta(days=5)).isoformat()),
        )
        assert response.status_code == 422

    def test_far_future_date_is_rejected(self, client, person):
        response = client.post(
            "/api/transactions",
            json=payload(person, occurred_on=(date.today() + timedelta(days=800)).isoformat()),
        )
        assert response.status_code == 422

    def test_backdating_is_allowed(self, client, person):
        """You often record a loan days after it happened."""
        response = client.post(
            "/api/transactions",
            json=payload(person, occurred_on=(date.today() - timedelta(days=365)).isoformat()),
        )
        assert response.status_code == 201


class TestOverpayment:
    """DESIGN DECISION Q1: a payment cannot exceed the outstanding balance."""

    def test_payment_larger_than_balance_is_rejected(self, client, person):
        client.post("/api/transactions", json=payload(person, amount="1000"))
        response = client.post(
            "/api/transactions", json=payload(person, type="PAYMENT", amount="1500")
        )
        assert response.status_code == 422
        assert "amount" in response.get_json()["error"]["fields"]

    def test_payment_exactly_equal_to_balance_is_allowed(self, client, person):
        client.post("/api/transactions", json=payload(person, amount="1000"))
        response = client.post(
            "/api/transactions", json=payload(person, type="PAYMENT", amount="1000")
        )
        assert response.status_code == 201
        assert client.get(f"/api/people/{person.id}").get_json()["person"]["outstanding"] == "0.00"

    def test_payment_to_someone_who_owes_nothing_is_rejected(self, client, person):
        response = client.post(
            "/api/transactions", json=payload(person, type="PAYMENT", amount="1")
        )
        assert response.status_code == 422

    def test_editing_a_payment_does_not_count_itself_twice(self, client, person):
        """Regression test for a subtle bug: when checking an edited payment we
        must compare against the balance *without* the row being edited."""
        client.post("/api/transactions", json=payload(person, amount="1000"))
        created = client.post(
            "/api/transactions", json=payload(person, type="PAYMENT", amount="300")
        ).get_json()["transaction"]

        response = client.put(
            f"/api/transactions/{created['id']}",
            json=payload(person, type="PAYMENT", amount="301"),
        )
        assert response.status_code == 200


class TestEditAndDelete:
    def test_edit_changes_the_balance(self, client, person):
        created = client.post("/api/transactions", json=payload(person, amount="1000")).get_json()[
            "transaction"
        ]
        client.put(f"/api/transactions/{created['id']}", json=payload(person, amount="1500"))
        assert (
            client.get(f"/api/people/{person.id}").get_json()["person"]["outstanding"] == "1500.00"
        )

    def test_delete_is_soft(self, client, person, app):
        """The row must still exist in the database, just excluded from queries."""
        created = client.post("/api/transactions", json=payload(person, amount="1000")).get_json()[
            "transaction"
        ]
        assert client.delete(f"/api/transactions/{created['id']}").status_code == 204

        assert client.get(f"/api/transactions/{created['id']}").status_code == 404
        assert client.get(f"/api/people/{person.id}").get_json()["person"]["outstanding"] == "0.00"

        row = Transaction.query.filter_by(id=created["id"]).first()
        assert row is not None
        assert row.deleted_at is not None

    def test_deleted_transactions_are_excluded_from_lists(self, client, person):
        created = client.post("/api/transactions", json=payload(person)).get_json()["transaction"]
        client.delete(f"/api/transactions/{created['id']}")
        assert client.get("/api/transactions").get_json()["transactions"] == []

    def test_deleting_twice_is_404(self, client, person):
        created = client.post("/api/transactions", json=payload(person)).get_json()["transaction"]
        client.delete(f"/api/transactions/{created['id']}")
        assert client.delete(f"/api/transactions/{created['id']}").status_code == 404


class TestFiltering:
    def setup_data(self, client, person):
        client.post("/api/transactions", json=payload(person, amount="1000", type="LOAN"))
        client.post("/api/transactions", json=payload(person, amount="200", type="PAYMENT"))

    def test_filter_by_type(self, client, person):
        self.setup_data(client, person)
        loans = client.get("/api/transactions?type=LOAN").get_json()["transactions"]
        assert len(loans) == 1 and loans[0]["type"] == "LOAN"

    def test_filter_by_person(self, client, person):
        self.setup_data(client, person)
        assert len(client.get(f"/api/transactions?person_id={person.id}").get_json()["transactions"]) == 2
        assert client.get("/api/transactions?person_id=999999").get_json()["transactions"] == []

    def test_preset_today(self, client, person):
        self.setup_data(client, person)
        assert len(client.get("/api/transactions?preset=today").get_json()["transactions"]) == 2

    def test_custom_range_excludes_outside_dates(self, client, person, make_transaction):
        make_transaction(person, TransactionType.LOAN, "500.00", days_ago=100)
        recent = (date.today() - timedelta(days=2)).isoformat()
        body = client.get(f"/api/transactions?from={recent}&to={date.today().isoformat()}").get_json()
        assert body["transactions"] == []

    def test_reversed_range_is_422(self, client, person):
        response = client.get("/api/transactions?from=2026-12-01&to=2026-01-01")
        assert response.status_code == 422

    def test_note_search(self, client, person):
        client.post("/api/transactions", json=payload(person, note="Car repair"))
        client.post("/api/transactions", json=payload(person, note="Emergency"))
        assert len(client.get("/api/transactions?q=car").get_json()["transactions"]) == 1

    def test_pagination(self, client, person):
        for _ in range(5):
            client.post("/api/transactions", json=payload(person, amount="10"))
        body = client.get("/api/transactions?per_page=2&page=1").get_json()
        assert len(body["transactions"]) == 2
        assert body["pagination"]["pages"] == 3
        assert body["pagination"]["has_next"] is True


class TestDashboard:
    def test_totals_across_people(self, client, person, make_transaction, db, user):
        from app.models import Person

        other = Person(user_id=user.id, name="Daniel")
        db.session.add(other)
        db.session.commit()

        make_transaction(person, TransactionType.LOAN, "1000.00", days_ago=10)
        make_transaction(person, TransactionType.PAYMENT, "300.00", days_ago=5)
        make_transaction(other, TransactionType.LOAN, "500.00", days_ago=3)

        body = client.get("/api/dashboard").get_json()
        assert body["totals"]["total_lent"] == "1500.00"
        assert body["totals"]["total_repaid"] == "300.00"
        assert body["totals"]["outstanding"] == "1200.00"
        assert body["counts"]["people_owing"] == 2

    def test_top_debtors_are_sorted_highest_first(self, client, person, make_transaction, db, user):
        from app.models import Person

        other = Person(user_id=user.id, name="Daniel")
        db.session.add(other)
        db.session.commit()

        make_transaction(person, TransactionType.LOAN, "100.00")
        make_transaction(other, TransactionType.LOAN, "900.00")

        names = [p["name"] for p in client.get("/api/dashboard").get_json()["top_debtors"]]
        assert names == ["Daniel", "Mohammed"]

    def test_empty_dashboard_does_not_crash(self, client):
        body = client.get("/api/dashboard").get_json()
        assert body["totals"]["outstanding"] == "0.00"
        assert body["counts"]["people"] == 0
