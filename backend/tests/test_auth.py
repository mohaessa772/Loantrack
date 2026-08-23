"""Authentication and authorisation tests."""

from app.models import User
from tests.conftest import TEST_EMAIL, TEST_PASSWORD


class TestPasswordStorage:
    def test_password_is_not_stored_in_plain_text(self, user):
        assert user.password_hash != TEST_PASSWORD
        assert TEST_PASSWORD not in user.password_hash

    def test_hash_verifies_the_right_password(self, user):
        assert user.check_password(TEST_PASSWORD) is True
        assert user.check_password("wrong") is False

    def test_same_password_produces_different_hashes(self, db):
        """Each hash carries its own random salt, so identical passwords do not
        produce identical hashes - that is what defeats rainbow tables."""
        a, b = User(email="a@x.com"), User(email="b@x.com")
        a.set_password("identical-password")
        b.set_password("identical-password")
        assert a.password_hash != b.password_hash

    def test_email_is_case_insensitive(self, anon_client, user):
        response = anon_client.post(
            "/api/auth/login", json={"email": TEST_EMAIL.upper(), "password": TEST_PASSWORD}
        )
        assert response.status_code == 200


class TestLogin:
    def test_valid_login(self, anon_client, user):
        response = anon_client.post(
            "/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        assert response.get_json()["user"]["email"] == TEST_EMAIL

    def test_wrong_password(self, anon_client, user):
        response = anon_client.post(
            "/api/auth/login", json={"email": TEST_EMAIL, "password": "nope"}
        )
        assert response.status_code == 401

    def test_unknown_email_gives_the_same_message_as_a_wrong_password(self, anon_client, user):
        """Different messages would let an attacker discover which emails have
        accounts - that is called user enumeration."""
        unknown = anon_client.post(
            "/api/auth/login", json={"email": "nobody@x.com", "password": "whatever"}
        )
        wrong = anon_client.post(
            "/api/auth/login", json={"email": TEST_EMAIL, "password": "whatever"}
        )
        assert unknown.status_code == wrong.status_code == 401
        assert unknown.get_json()["error"]["message"] == wrong.get_json()["error"]["message"]

    def test_missing_fields_are_422_not_401(self, anon_client, user):
        response = anon_client.post("/api/auth/login", json={"email": "", "password": ""})
        assert response.status_code == 422
        assert set(response.get_json()["error"]["fields"]) == {"email", "password"}

    def test_response_never_contains_the_hash(self, anon_client, user):
        response = anon_client.post(
            "/api/auth/login", json={"email": TEST_EMAIL, "password": TEST_PASSWORD}
        )
        assert "password_hash" not in response.get_data(as_text=True)


class TestProtectedRoutes:
    ROUTES = [
        ("get", "/api/dashboard"),
        ("get", "/api/people"),
        ("get", "/api/transactions"),
        ("get", "/api/settings"),
        ("post", "/api/people"),
        ("post", "/api/transactions"),
    ]

    def test_every_route_requires_a_session(self, anon_client):
        for method, url in self.ROUTES:
            response = getattr(anon_client, method)(url, json={})
            assert response.status_code == 401, f"{method.upper()} {url} was not protected"

    def test_401_is_json_not_a_redirect(self, anon_client):
        """A JSON API must answer 401, not redirect to an HTML login page - the
        frontend cannot parse HTML."""
        response = anon_client.get("/api/dashboard")
        assert response.status_code == 401
        assert response.get_json()["error"]["code"] == "UNAUTHENTICATED"


class TestLogout:
    def test_logout_ends_the_session(self, client):
        assert client.get("/api/dashboard").status_code == 200
        assert client.post("/api/auth/logout").status_code == 204
        assert client.get("/api/dashboard").status_code == 401


class TestOwnership:
    def test_cannot_read_another_users_person(self, client, db, person):
        """The core multi-tenancy rule, tested even though V1 has one user.

        A 404 rather than 403 is deliberate: 403 would confirm that the id
        exists and belongs to someone else.
        """
        from app.models import Person

        intruder = User(email="intruder@x.com")
        intruder.set_password("password123")
        db.session.add(intruder)
        db.session.commit()

        theirs = Person(user_id=intruder.id, name="Someone Else")
        db.session.add(theirs)
        db.session.commit()

        assert client.get(f"/api/people/{theirs.id}").status_code == 404
        assert client.get("/api/people").get_json()["people"].__len__() == 1
