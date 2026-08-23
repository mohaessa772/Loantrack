# Personal Loan & Debt Tracker

Track money you have lent to people, money they have repaid, and what is still
outstanding. Transactions are the source of truth — no balance is ever stored.

**Stack:** React + Vite + Tailwind CSS · Flask + SQLAlchemy · PostgreSQL (SQLite for local dev)

---

## Quick start

You need two terminals: one for the API, one for the React dev server.

### 1. Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate
pip install -r requirements.txt
cp .env.example .env
```

Open `.env` and set a `SECRET_KEY`. Generate one with:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Then create the tables and your login:

```bash
flask --app run.py init-db
flask --app run.py create-user
python run.py
```

The API runs on <http://127.0.0.1:5000>.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>.

### Demo data

```bash
flask --app run.py seed-demo --email you@example.com
```

Adds four people with a mix of loans, payments, due dates and one fully settled
balance, so every screen has something to show.

---

## Commands

| Command | What it does |
|---------|--------------|
| `flask --app run.py init-db` | Create all tables |
| `flask --app run.py create-user` | Create a login (there is no sign-up page) |
| `flask --app run.py reset-password` | Set a new password for an account |
| `flask --app run.py seed-demo` | Add sample data |
| `pytest` | Run the test suite (91 tests) |
| `npm run build` | Build the frontend into `frontend/dist` |

---

## Project structure

```
backend/
  app/
    __init__.py       application factory
    config.py         environment-driven configuration
    extensions.py     db, migrate, login_manager, csrf, cors
    money.py          Decimal handling - never floats
    errors.py         one JSON error shape for the whole API
    validators.py     request validation helpers
    models/           user.py, person.py, transaction.py
    services/         business logic (balances, people, transactions)
    api/              route blueprints
    cli.py            command line tools
  tests/
frontend/
  src/
    api/client.js     the only place that calls fetch()
    context/          auth and toast providers
    hooks/            useFetch, useDebounced
    components/       shared UI
    pages/            one file per screen
docs/
  phase-0-spec.md     requirements analysis and design decisions
```

The rule that keeps it clean: **api → services → models**. Route functions parse
input and choose an HTTP status code. They contain no arithmetic. All the
business rules live in `services/`, which is why the balance logic can be
unit-tested without starting Flask.

---

## Data model

Three tables.

```
users ──< people ──< transactions
  └──────────────────────┘
      (transactions.user_id, denormalised for authorisation)
```

**No balance column exists anywhere.** Every number in the app is derived:

```
outstanding = SUM(LOAN amounts) − SUM(PAYMENT amounts)
```

A stored balance is a cache, and a cache that can drift out of sync with the
transactions is a bug factory.

Key constraints:

- `amount > 0` — direction is carried by `type`, never by a negative number
- `due_date IS NULL OR type = 'LOAN'` — a repayment cannot be "due"
- `transactions.person_id` uses `ON DELETE RESTRICT` — the database itself
  refuses to orphan financial history
- partial unique index on `(user_id, phone)` — no duplicate phone numbers, but
  many people may have none

---

## API

All routes require a session except `POST /api/auth/login`.
Money is sent as a **string** (`"1000.00"`) so JSON numbers never turn it into a
JavaScript float.

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/login` | Start a session |
| POST | `/api/auth/logout` | End it |
| GET | `/api/auth/me` | Current user |
| GET | `/api/people` | List with balances (`?q=` `?status=` `?sort=`) |
| POST | `/api/people` | Create |
| GET | `/api/people/:id` | Detail with totals |
| PUT | `/api/people/:id` | Update |
| DELETE | `/api/people/:id` | Delete (409 if they have transactions) |
| GET | `/api/people/:id/transactions` | Statement with running balance |
| GET | `/api/transactions` | Filter + paginate |
| POST | `/api/transactions` | Create |
| GET/PUT/DELETE | `/api/transactions/:id` | Read / edit / soft delete |
| GET | `/api/transactions/due` | Overdue and upcoming |
| GET | `/api/dashboard` | Every summary number in one call |
| GET/PUT | `/api/settings` | Currency and display name |
| POST | `/api/settings/password` | Change password |

Status codes: `400` unparseable · `401` not signed in · `404` does not exist (or
is not yours) · `409` conflicts with current state · `422` parsed but invalid ·
`500` our bug.

Every error has the same body:

```json
{ "error": { "code": "VALIDATION_FAILED",
             "message": "Please correct the highlighted fields.",
             "fields": { "amount": "Must be greater than zero." } } }
```

---

## Security

| Measure | Why |
|---------|-----|
| scrypt password hashing with per-user salt | A database leak yields hashes, not passwords |
| HttpOnly session cookie | JavaScript cannot read it, so XSS cannot steal the session |
| CSRF token in a header | Blocks another site from firing requests with your cookie |
| `SameSite=Lax` | Second layer of the same defence |
| Every query filtered by `user_id` | One user can never read another's data |
| Parameterised queries via SQLAlchemy | SQL injection is not possible |
| Server-side validation on every endpoint | The React form is convenience; this is the rule |
| 404 instead of 403 for other users' rows | Does not leak which ids exist |
| Generic "incorrect email or password" | Prevents account enumeration |
| Login attempt throttling | Slows down password guessing |
| Secrets in `.env`, git-ignored | Nothing sensitive is ever committed |

---

## Switching to PostgreSQL

Everything is written to run on Postgres — SQLite is only the zero-setup local
default. Change one line in `.env`:

```
DATABASE_URL=postgresql://loanuser:yourpassword@localhost:5432/loantracker
```

Then `flask --app run.py init-db`. (For a database that already holds data, use
Alembic migrations instead: `flask db init`, `flask db migrate`, `flask db upgrade`.)

---

## Design decisions

Recorded in [docs/phase-0-spec.md](docs/phase-0-spec.md), and marked in the code
with `DESIGN DECISION (Qn)` comments:

1. **Overpayment is rejected** (422). A payment larger than the outstanding
   balance is almost always a typo. Flip `ALLOW_OVERPAYMENT` in
   `services/transaction_service.py` to change this.
2. **Transactions are soft-deleted.** The row stays in the database with a
   `deleted_at` stamp, excluded from every query and total.
3. **Session cookies, not JWT.** No token in localStorage to steal.
4. **No public registration.** Accounts are created from the CLI.
5. **People with transactions cannot be deleted** (409).
6. **Currency lives on the user**, not on each transaction.

Deferred on purpose: payment-to-loan allocation (FIFO), multi-currency
accounting, interest, reminders, multi-user sharing.
