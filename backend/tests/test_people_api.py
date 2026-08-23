"""People API tests."""

from app.models import TransactionType


class TestCreate:
    def test_create_returns_201(self, client):
        response = client.post("/api/people", json={"name": "Aisha", "phone": "013-2223333"})
        assert response.status_code == 201
        assert response.get_json()["person"]["name"] == "Aisha"

    def test_name_is_trimmed(self, client):
        response = client.post("/api/people", json={"name": "  Aisha  "})
        assert response.get_json()["person"]["name"] == "Aisha"

    def test_blank_name_is_rejected(self, client):
        response = client.post("/api/people", json={"name": "   "})
        assert response.status_code == 422
        assert "name" in response.get_json()["error"]["fields"]

    def test_phone_is_optional(self, client):
        response = client.post("/api/people", json={"name": "No Phone"})
        assert response.status_code == 201
        assert response.get_json()["person"]["phone"] is None

    def test_duplicate_phone_is_409(self, client):
        client.post("/api/people", json={"name": "First", "phone": "012-1111111"})
        response = client.post("/api/people", json={"name": "Second", "phone": "012-1111111"})
        assert response.status_code == 409

    def test_several_people_may_have_no_phone(self, client):
        """The partial unique index must allow many NULLs."""
        assert client.post("/api/people", json={"name": "A"}).status_code == 201
        assert client.post("/api/people", json={"name": "B"}).status_code == 201

    def test_garbage_phone_is_rejected(self, client):
        response = client.post("/api/people", json={"name": "X", "phone": "not a phone"})
        assert response.status_code == 422


class TestRead:
    def test_new_person_has_zero_balance(self, client, person):
        body = client.get(f"/api/people/{person.id}").get_json()["person"]
        assert body["outstanding"] == "0.00"
        assert body["status"] == "SETTLED"

    def test_balance_reflects_transactions(self, client, person, make_transaction):
        make_transaction(person, TransactionType.LOAN, "1000.00", days_ago=10)
        make_transaction(person, TransactionType.PAYMENT, "300.00", days_ago=5)
        body = client.get(f"/api/people/{person.id}").get_json()["person"]
        assert body["total_lent"] == "1000.00"
        assert body["total_repaid"] == "300.00"
        assert body["outstanding"] == "700.00"
        assert body["status"] == "OWING"

    def test_unknown_id_is_404(self, client):
        assert client.get("/api/people/999999").status_code == 404

    def test_amounts_are_strings_not_numbers(self, client, person, make_transaction):
        """Sending money as a JSON number would turn it into a JavaScript float."""
        make_transaction(person, TransactionType.LOAN, "1000.00")
        body = client.get(f"/api/people/{person.id}").get_json()["person"]
        assert isinstance(body["outstanding"], str)


class TestSearch:
    def test_search_by_name_is_case_insensitive(self, client, person):
        assert len(client.get("/api/people?q=moha").get_json()["people"]) == 1
        assert len(client.get("/api/people?q=MOHA").get_json()["people"]) == 1

    def test_search_by_phone(self, client, person):
        assert len(client.get("/api/people?q=3456").get_json()["people"]) == 1

    def test_no_match_returns_empty_list(self, client, person):
        assert client.get("/api/people?q=zzzz").get_json()["people"] == []

    def test_sql_injection_is_treated_as_text(self, client, person):
        """Parameterised queries mean this is just a weird string, not SQL."""
        response = client.get("/api/people?q=' OR 1=1 --")
        assert response.status_code == 200
        assert response.get_json()["people"] == []

    def test_filter_by_status(self, client, person, make_transaction):
        make_transaction(person, TransactionType.LOAN, "100.00")
        assert len(client.get("/api/people?status=OWING").get_json()["people"]) == 1
        assert client.get("/api/people?status=SETTLED").get_json()["people"] == []


class TestUpdate:
    def test_update_changes_fields(self, client, person):
        response = client.put(
            f"/api/people/{person.id}", json={"name": "New Name", "phone": "019-9999999"}
        )
        assert response.status_code == 200
        assert response.get_json()["person"]["name"] == "New Name"

    def test_keeping_your_own_phone_is_not_a_conflict(self, client, person):
        response = client.put(
            f"/api/people/{person.id}", json={"name": "Mohammed", "phone": person.phone}
        )
        assert response.status_code == 200

    def test_taking_someone_elses_phone_is_409(self, client, person):
        client.post("/api/people", json={"name": "Other", "phone": "017-7777777"})
        response = client.put(
            f"/api/people/{person.id}", json={"name": "Mohammed", "phone": "017-7777777"}
        )
        assert response.status_code == 409


class TestDelete:
    def test_person_without_transactions_can_be_deleted(self, client, person):
        assert client.delete(f"/api/people/{person.id}").status_code == 204
        assert client.get(f"/api/people/{person.id}").status_code == 404

    def test_person_with_transactions_cannot_be_deleted(self, client, person, make_transaction):
        """Financial history is never cascade-deleted by a mis-click."""
        make_transaction(person, TransactionType.LOAN, "100.00")
        response = client.delete(f"/api/people/{person.id}")
        assert response.status_code == 409
        assert client.get(f"/api/people/{person.id}").status_code == 200


class TestStatement:
    def test_running_balance_matches_the_spec_example(self, client, person, make_transaction):
        make_transaction(person, TransactionType.LOAN, "1000.00", days_ago=30, note="Emergency")
        make_transaction(person, TransactionType.PAYMENT, "300.00", days_ago=20)
        make_transaction(person, TransactionType.LOAN, "500.00", days_ago=10)
        make_transaction(person, TransactionType.PAYMENT, "200.00", days_ago=1)

        body = client.get(f"/api/people/{person.id}/transactions").get_json()
        # The API returns newest first, so reverse for chronological order.
        balances = [t["balance_after"] for t in reversed(body["transactions"])]
        assert balances == ["1000.00", "700.00", "1200.00", "1000.00"]
        assert body["totals"]["outstanding"] == "1000.00"

    def test_empty_statement(self, client, person):
        body = client.get(f"/api/people/{person.id}/transactions").get_json()
        assert body["transactions"] == []
        assert body["totals"]["outstanding"] == "0.00"
