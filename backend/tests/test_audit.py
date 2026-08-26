"""Audit trail tests.

`updated_at` says a row changed. These assert we can also say what it changed
FROM - which is the question that actually gets asked about money.
"""

from datetime import date

from app.models import Person


def payload(person, **overrides):
    body = {
        "person_id": person.id,
        "type": "LOAN",
        "amount": "100.00",
        "occurred_on": date.today().isoformat(),
    }
    body.update(overrides)
    return body


def history(client, txn_id):
    return client.get(f"/api/transactions/{txn_id}/history").get_json()["history"]


class TestRecording:
    def test_creating_records_created(self, client, person):
        created = client.post("/api/transactions", json=payload(person)).get_json()["transaction"]
        rows = history(client, created["id"])
        assert [r["action"] for r in rows] == ["CREATED"]
        assert rows[0]["changes"] is None

    def test_editing_records_what_changed(self, client, person):
        created = client.post(
            "/api/transactions", json=payload(person, amount="300.00")
        ).get_json()["transaction"]
        client.put(f"/api/transactions/{created['id']}", json=payload(person, amount="500.00"))

        rows = history(client, created["id"])
        assert [r["action"] for r in rows] == ["UPDATED", "CREATED"]
        assert rows[0]["changes"] == {"amount": {"from": "300.00", "to": "500.00"}}

    def test_only_the_changed_fields_are_recorded(self, client, person):
        created = client.post(
            "/api/transactions", json=payload(person, note="first")
        ).get_json()["transaction"]
        client.put(f"/api/transactions/{created['id']}", json=payload(person, note="second"))

        assert set(history(client, created["id"])[0]["changes"]) == {"note"}

    def test_saving_without_changing_anything_records_nothing(self, client, person):
        created = client.post("/api/transactions", json=payload(person)).get_json()["transaction"]
        client.put(f"/api/transactions/{created['id']}", json=payload(person))

        assert [r["action"] for r in history(client, created["id"])] == ["CREATED"]

    def test_moving_a_transaction_records_both_names(self, client, person, db, user):
        other = Person(user_id=user.id, name="Someone Else")
        db.session.add(other)
        db.session.commit()

        created = client.post("/api/transactions", json=payload(person)).get_json()["transaction"]
        client.put(f"/api/transactions/{created['id']}", json=payload(other))

        change = history(client, created["id"])[0]["changes"]["person"]
        assert change == {"from": person.name, "to": "Someone Else"}

    def test_delete_and_restore_are_recorded(self, client, person):
        created = client.post("/api/transactions", json=payload(person)).get_json()["transaction"]
        client.delete(f"/api/transactions/{created['id']}")
        client.post(f"/api/transactions/{created['id']}/restore")

        assert [r["action"] for r in history(client, created["id"])] == [
            "RESTORED",
            "DELETED",
            "CREATED",
        ]

    def test_history_is_readable_for_a_deleted_transaction(self, client, person):
        """Often exactly when you want it."""
        created = client.post("/api/transactions", json=payload(person)).get_json()["transaction"]
        client.delete(f"/api/transactions/{created['id']}")

        response = client.get(f"/api/transactions/{created['id']}/history")
        assert response.status_code == 200
        assert len(response.get_json()["history"]) == 2


class TestAuditIsolation:
    def test_history_requires_a_session(self, anon_client):
        assert anon_client.get("/api/transactions/1/history").status_code == 401

    def test_unknown_transaction_is_404(self, client):
        assert client.get("/api/transactions/999999/history").status_code == 404


class TestAuditSurvivesRestore:
    def test_restoring_a_backup_clears_the_old_audit_rows(self, client, person):
        """Audit rows describing transactions that no longer exist are noise -
        and the foreign key would block the wipe anyway."""
        created = client.post("/api/transactions", json=payload(person)).get_json()["transaction"]
        assert len(history(client, created["id"])) == 1

        backup = client.get("/api/backup").get_json()
        response = client.post("/api/backup/restore", json={"data": backup, "mode": "replace"})
        assert response.status_code == 200

        # SQLite hands out the same id again, so the row exists - but it is a
        # different record, and it starts with no history behind it.
        restored = client.get("/api/transactions").get_json()["transactions"][0]
        assert history(client, restored["id"]) == []
