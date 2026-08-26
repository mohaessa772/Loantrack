"""Backup and restore tests.

The point of a backup is that it works on the worst day you have. These tests
care most about two things: a round trip must not change your numbers, and a
bad file must not damage the records already in the account.
"""

from datetime import date, timedelta

from app.models import Person, Transaction, User


def payload(person, **overrides):
    body = {
        "person_id": person.id,
        "type": "LOAN",
        "amount": "100.00",
        "occurred_on": date.today().isoformat(),
    }
    body.update(overrides)
    return body


def seed(client, person):
    client.post("/api/transactions", json=payload(person, amount="1000", note="Emergency"))
    client.post(
        "/api/transactions",
        json=payload(person, type="PAYMENT", amount="300", payment_method="CASH"),
    )


class TestExport:
    def test_export_has_the_format_marker(self, client, person):
        body = client.get("/api/backup").get_json()
        assert body["loantrack_backup"] == 1
        assert body["exported_at"]

    def test_export_contains_people_and_transactions(self, client, person):
        seed(client, person)
        body = client.get("/api/backup").get_json()
        assert body["counts"] == {"people": 1, "transactions": 2}
        assert body["people"][0]["name"] == person.name
        assert {t["amount"] for t in body["transactions"]} == {"1000.00", "300.00"}

    def test_export_includes_soft_deleted_transactions(self, client, person):
        """They are part of your history - a restore that dropped them would
        silently remove your ability to undo."""
        created = client.post("/api/transactions", json=payload(person)).get_json()["transaction"]
        client.delete(f"/api/transactions/{created['id']}")

        body = client.get("/api/backup").get_json()
        assert len(body["transactions"]) == 1
        assert body["transactions"][0]["deleted_at"] is not None

    def test_export_requires_a_session(self, anon_client):
        assert anon_client.get("/api/backup").status_code == 401

    def test_export_only_covers_your_own_account(self, client, db, user, person):
        seed(client, person)
        intruder = User(email="other@x.com")
        intruder.set_password("password123")
        db.session.add(intruder)
        db.session.commit()
        db.session.add(Person(user_id=intruder.id, name="Not Yours"))
        db.session.commit()

        names = [p["name"] for p in client.get("/api/backup").get_json()["people"]]
        assert names == [person.name]


class TestRestore:
    def test_restore_into_an_empty_account(self, client, person, db):
        seed(client, person)
        backup = client.get("/api/backup").get_json()

        # Empty the account the blunt way, then restore from the file.
        Transaction.query.delete()
        Person.query.delete()
        db.session.commit()

        response = client.post("/api/backup/restore", json={"data": backup})
        assert response.status_code == 200
        assert response.get_json()["restored"]["people"] == 1
        assert response.get_json()["restored"]["transactions"] == 2

    def test_round_trip_preserves_the_balance(self, client, person, db):
        seed(client, person)
        before = client.get("/api/dashboard").get_json()["totals"]

        backup = client.get("/api/backup").get_json()
        client.post("/api/backup/restore", json={"data": backup, "mode": "replace"})

        after = client.get("/api/dashboard").get_json()["totals"]
        assert after == before

    def test_round_trip_preserves_the_running_balance(self, client, person):
        seed(client, person)
        client.post("/api/transactions", json=payload(person, amount="500"))
        backup = client.get("/api/backup").get_json()
        before = [
            t["balance_after"]
            for t in client.get(f"/api/people/{person.id}/transactions").get_json()["transactions"]
        ]

        client.post("/api/backup/restore", json={"data": backup, "mode": "replace"})

        new_id = client.get("/api/people").get_json()["people"][0]["id"]
        after = [
            t["balance_after"]
            for t in client.get(f"/api/people/{new_id}/transactions").get_json()["transactions"]
        ]
        assert after == before

    def test_restoring_over_existing_data_needs_replace(self, client, person):
        seed(client, person)
        backup = client.get("/api/backup").get_json()

        response = client.post("/api/backup/restore", json={"data": backup})
        assert response.status_code == 409

    def test_replace_does_not_duplicate(self, client, person):
        seed(client, person)
        backup = client.get("/api/backup").get_json()

        client.post("/api/backup/restore", json={"data": backup, "mode": "replace"})
        body = client.get("/api/backup").get_json()
        assert body["counts"] == {"people": 1, "transactions": 2}

    def test_ids_from_the_file_are_not_trusted(self, client, person, db):
        """People are re-inserted with fresh ids and transactions re-pointed."""
        seed(client, person)
        backup = client.get("/api/backup").get_json()
        backup["people"][0]["id"] = 999999
        for txn in backup["transactions"]:
            txn["person_id"] = 999999

        client.post("/api/backup/restore", json={"data": backup, "mode": "replace"})
        people = client.get("/api/people").get_json()["people"]
        assert len(people) == 1
        assert people[0]["id"] != 999999
        assert people[0]["outstanding"] == "700.00"

    def test_soft_deleted_rows_survive_a_round_trip(self, client, person):
        client.post("/api/transactions", json=payload(person, amount="1000"))
        created = client.post("/api/transactions", json=payload(person)).get_json()["transaction"]
        client.delete(f"/api/transactions/{created['id']}")

        backup = client.get("/api/backup").get_json()
        client.post("/api/backup/restore", json={"data": backup, "mode": "replace"})

        assert len(client.get("/api/transactions/deleted").get_json()["transactions"]) == 1

    def test_restore_requires_a_session(self, anon_client):
        assert anon_client.post("/api/backup/restore", json={"data": {}}).status_code == 401


class TestRestoreRejectsBadFiles:
    """Every one of these must leave the existing records untouched."""

    def good_backup(self, client):
        return client.get("/api/backup").get_json()

    def test_not_a_backup_at_all(self, client, person):
        assert client.post("/api/backup/restore", json={"data": "hello"}).status_code == 422

    def test_wrong_format_version(self, client, person):
        backup = self.good_backup(client)
        backup["loantrack_backup"] = 99
        assert client.post("/api/backup/restore", json={"data": backup}).status_code == 422

    def test_missing_lists(self, client, person):
        response = client.post(
            "/api/backup/restore", json={"data": {"loantrack_backup": 1}}
        )
        assert response.status_code == 422

    def test_person_without_a_name(self, client, person, db):
        seed(client, person)
        backup = self.good_backup(client)
        backup["people"][0]["name"] = "   "

        response = client.post("/api/backup/restore", json={"data": backup, "mode": "replace"})
        assert response.status_code == 422
        # nothing was wiped
        assert client.get("/api/backup").get_json()["counts"]["transactions"] == 2

    def test_transaction_pointing_at_a_missing_person(self, client, person):
        seed(client, person)
        backup = self.good_backup(client)
        backup["transactions"][0]["person_id"] = 4242

        response = client.post("/api/backup/restore", json={"data": backup, "mode": "replace"})
        assert response.status_code == 422
        assert client.get("/api/backup").get_json()["counts"]["transactions"] == 2

    def test_negative_amount(self, client, person):
        seed(client, person)
        backup = self.good_backup(client)
        backup["transactions"][0]["amount"] = "-5"
        assert (
            client.post("/api/backup/restore", json={"data": backup, "mode": "replace"}).status_code
            == 422
        )

    def test_bad_transaction_type(self, client, person):
        seed(client, person)
        backup = self.good_backup(client)
        backup["transactions"][0]["type"] = "GIFT"
        assert (
            client.post("/api/backup/restore", json={"data": backup, "mode": "replace"}).status_code
            == 422
        )

    def test_payment_carrying_a_due_date(self, client, person):
        seed(client, person)
        backup = self.good_backup(client)
        for txn in backup["transactions"]:
            if txn["type"] == "PAYMENT":
                txn["due_date"] = (date.today() + timedelta(days=10)).isoformat()
        assert (
            client.post("/api/backup/restore", json={"data": backup, "mode": "replace"}).status_code
            == 422
        )

    def test_unknown_payment_method(self, client, person):
        seed(client, person)
        backup = self.good_backup(client)
        backup["transactions"][0]["payment_method"] = "CRYPTO"
        assert (
            client.post("/api/backup/restore", json={"data": backup, "mode": "replace"}).status_code
            == 422
        )

    def test_two_people_sharing_a_phone(self, client, person):
        seed(client, person)
        backup = self.good_backup(client)
        backup["people"].append({"id": 77, "name": "Twin", "phone": backup["people"][0]["phone"]})
        assert (
            client.post("/api/backup/restore", json={"data": backup, "mode": "replace"}).status_code
            == 422
        )

    def test_edited_file_that_would_create_a_negative_balance(self, client, person):
        """A genuine backup can never do this - the app blocks overpayment on the
        way in - so a file that would is edited, and gets refused."""
        seed(client, person)
        backup = self.good_backup(client)
        for txn in backup["transactions"]:
            if txn["type"] == "PAYMENT":
                txn["amount"] = "99999.00"

        response = client.post("/api/backup/restore", json={"data": backup, "mode": "replace"})
        assert response.status_code == 422
        assert "credit" in response.get_json()["error"]["message"].lower()
        assert client.get("/api/backup").get_json()["counts"]["transactions"] == 2
