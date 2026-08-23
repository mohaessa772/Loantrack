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


class TestRegistration:
    """DESIGN DECISION Q4 (revised): public sign-up, switchable off in config."""

    VALID = {
        "email": "newuser@example.com",
        "password": "a-good-password",
        "confirm_password": "a-good-password",
        "display_name": "New User",
        "currency_code": "MYR",
    }

    def test_register_creates_an_account(self, anon_client):
        response = anon_client.post("/api/auth/register", json=self.VALID)
        assert response.status_code == 201
        assert response.get_json()["user"]["email"] == "newuser@example.com"

    def test_register_signs_you_in_immediately(self, anon_client):
        anon_client.post("/api/auth/register", json=self.VALID)
        assert anon_client.get("/api/dashboard").status_code == 200

    def test_password_is_hashed(self, anon_client, db):
        anon_client.post("/api/auth/register", json=self.VALID)
        account = User.query.filter_by(email="newuser@example.com").first()
        assert account.password_hash != self.VALID["password"]
        assert account.check_password(self.VALID["password"]) is True

    def test_email_is_normalised_to_lowercase(self, anon_client):
        anon_client.post("/api/auth/register", json={**self.VALID, "email": "MiXeD@Example.COM"})
        assert User.query.filter_by(email="mixed@example.com").first() is not None

    def test_duplicate_email_is_409(self, anon_client, user):
        response = anon_client.post("/api/auth/register", json={**self.VALID, "email": TEST_EMAIL})
        assert response.status_code == 409
        assert "email" in response.get_json()["error"]["fields"]

    def test_duplicate_is_case_insensitive(self, anon_client, user):
        response = anon_client.post(
            "/api/auth/register", json={**self.VALID, "email": TEST_EMAIL.upper()}
        )
        assert response.status_code == 409

    def test_short_password_is_rejected(self, anon_client):
        response = anon_client.post(
            "/api/auth/register",
            json={**self.VALID, "password": "short", "confirm_password": "short"},
        )
        assert response.status_code == 422
        assert "password" in response.get_json()["error"]["fields"]

    def test_invalid_email_is_rejected(self, anon_client):
        response = anon_client.post("/api/auth/register", json={**self.VALID, "email": "not-email"})
        assert response.status_code == 422

    def test_mismatched_confirmation_is_rejected(self, anon_client):
        """Checked server-side too - the React form can be bypassed entirely."""
        response = anon_client.post(
            "/api/auth/register", json={**self.VALID, "confirm_password": "something-else"}
        )
        assert response.status_code == 422
        assert "confirm_password" in response.get_json()["error"]["fields"]

    def test_unsupported_currency_is_rejected(self, anon_client):
        response = anon_client.post(
            "/api/auth/register", json={**self.VALID, "currency_code": "ZZZ"}
        )
        assert response.status_code == 422

    def test_a_new_account_starts_empty(self, anon_client, user, person):
        """The critical isolation check: a brand new user must not see the
        existing user's people, even though both rows live in one table."""
        anon_client.post("/api/auth/register", json=self.VALID)
        assert anon_client.get("/api/people").get_json()["people"] == []
        assert anon_client.get("/api/dashboard").get_json()["totals"]["outstanding"] == "0.00"

    def test_registration_can_be_switched_off(self, app, anon_client):
        app.config["ALLOW_REGISTRATION"] = False
        response = anon_client.post("/api/auth/register", json=self.VALID)
        assert response.status_code == 403
        assert response.get_json()["error"]["code"] == "REGISTRATION_DISABLED"

    def test_config_endpoint_reports_the_setting(self, app, anon_client):
        assert anon_client.get("/api/auth/config").get_json()["allow_registration"] is True
        app.config["ALLOW_REGISTRATION"] = False
        assert anon_client.get("/api/auth/config").get_json()["allow_registration"] is False
