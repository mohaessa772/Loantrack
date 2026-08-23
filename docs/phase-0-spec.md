# Personal Loan & Debt Tracker — Phase 0 Specification (DRAFT, awaiting approval)

Status: proposal. Nothing is implemented yet.
Date: 2026-08-21

---

## 1. Problem statement

One person (the lender) needs to answer, at any moment:

> "How much have I lent to each person, how much have they repaid, and how much do they still owe me?"

Everything in this system exists to answer that question. Anything that does not
serve it is out of scope for Version 1.

## 2. Core domain rule

**Transactions are the source of truth.** No stored `balance` column anywhere.

```
person_outstanding = SUM(LOAN.amount) - SUM(PAYMENT.amount)   -- for that person
total_outstanding  = SUM(LOAN.amount) - SUM(PAYMENT.amount)   -- across all people
```

A stored balance would be a *cache*, and a cache that can drift out of sync with
the transactions is a bug factory. At personal scale (hundreds, maybe thousands of
rows) the database computes these aggregates in milliseconds. If it ever becomes
slow, the fix is a materialised view or a cached column with a rebuild command —
not a design change we make on day one.

## 3. Entities

Three tables in Version 1: `users`, `people`, `transactions`.

### 3.1 users

| column        | type          | null | why |
|---------------|---------------|------|-----|
| id            | BIGSERIAL PK  | no   | surrogate key; never reuse a natural key as a PK |
| email         | CITEXT UNIQUE | no   | login identity; CITEXT = case-insensitive comparison |
| password_hash | TEXT          | no   | bcrypt/argon2 output; never the password itself |
| currency_code | CHAR(3)       | no   | default `MYR`; ISO-4217. One currency per user in V1 |
| created_at    | TIMESTAMPTZ   | no   | default now() |
| updated_at    | TIMESTAMPTZ   | no   | default now(), bumped on update |

### 3.2 people

| column     | type         | null | why |
|------------|--------------|------|-----|
| id         | BIGSERIAL PK | no   | |
| user_id    | BIGINT FK -> users(id) ON DELETE CASCADE | no | ownership; makes multi-user possible later at near-zero cost |
| name       | VARCHAR(120) | no   | the only truly required field |
| phone      | VARCHAR(32)  | yes  | optional — you may not have every debtor phone number |
| notes      | TEXT         | yes  | free-form context |
| created_at | TIMESTAMPTZ  | no   | |
| updated_at | TIMESTAMPTZ  | no   | |

Indexes / constraints:

- `INDEX (user_id, name)` — supports listing and name search.
- `UNIQUE (user_id, phone) WHERE phone IS NOT NULL` — a *partial* unique index:
  duplicates blocked when a phone exists, many NULLs still allowed.
- `CHECK (length(btrim(name)) > 0)` — the database refuses blank names even if
  application validation is bypassed.

### 3.3 transactions

| column         | type         | null | why |
|----------------|--------------|------|-----|
| id             | BIGSERIAL PK | no   | |
| user_id        | BIGINT FK -> users(id) | no | lets every query filter by owner without a join |
| person_id      | BIGINT FK -> people(id) ON DELETE RESTRICT | no | money always belongs to someone |
| type           | VARCHAR(10)  | no   | `LOAN` or `PAYMENT`, CHECK-constrained |
| amount         | NUMERIC(12,2)| no   | exact decimal — never FLOAT for money |
| occurred_on    | DATE         | no   | the calendar day the money moved; user-editable, can be backdated |
| due_date       | DATE         | yes  | LOAN only |
| payment_method | VARCHAR(20)  | yes  | `CASH`, `BANK_TRANSFER`, `EWALLET`, `OTHER` |
| note           | TEXT         | yes  | "Emergency", "Partial repayment" |
| created_at     | TIMESTAMPTZ  | no   | when the *row* was written — different from occurred_on |
| updated_at     | TIMESTAMPTZ  | no   | |
| deleted_at     | TIMESTAMPTZ  | yes  | soft delete; NULL = live row |

Constraints:

- `CHECK (type IN ('LOAN','PAYMENT'))`
- `CHECK (amount > 0)` — direction is carried by `type`, never by a negative amount.
- `CHECK (due_date IS NULL OR type = 'LOAN')` — a repayment cannot have a due date.
- `CHECK (payment_method IS NULL OR payment_method IN (...))`

Indexes:

- `INDEX (person_id, occurred_on, id) WHERE deleted_at IS NULL` — the person
  statement query, in exactly its sort order.
- `INDEX (user_id, occurred_on) WHERE deleted_at IS NULL` — dashboard + global history.

Why `user_id` is duplicated on `transactions` even though it is reachable through
`people`: every authorisation check becomes `WHERE user_id = :me` with no join,
which is much harder to get wrong. The cost is one denormalised column the service
layer must always set correctly.

## 4. Running balance

The person statement shows a *running* balance:

```
balance_after(n) = SUM over rows 1..n of (+amount if LOAN else -amount)
```

Ordering must be deterministic: `ORDER BY occurred_on, created_at, id`. Without the
tiebreakers, two transactions on the same day could swap places between page loads
and the balance column would appear to change on its own.

Implementation options:

- **A.** SQL window function `SUM(...) OVER (ORDER BY ...)` — one query, DB does the work.
- **B.** Fetch ordered rows, accumulate in Python.

Recommendation: **B** for V1 (readable, unit-testable with no database), with A
noted as the scaling answer. The statement is per-person and short.

## 5. Overdue, and the allocation problem

Payments are **not** linked to specific loans in V1. There is no "this 300 pays off
that 1000". That means "is loan #7 overdue?" is not strictly answerable.

Proposed V1 rule:

> A loan is shown as OVERDUE when `due_date < today` **and** the person overall
> outstanding balance is greater than zero.

Person-level status: `SETTLED` (outstanding = 0), `OWING` (> 0), `OVERDUE` (> 0 and
at least one past-due loan). Every status renders as a text label plus an icon —
never colour alone.

The alternative — FIFO allocation, where each payment is applied to the oldest open
loan — is what real lending systems do. It is deliberately deferred: it adds an
allocation table and a rebalancing algorithm, and it is the single biggest
complexity jump available in this project.

## 6. REST API

All routes require an authenticated session except `POST /api/auth/login`.
Money is serialised as a **string** (`"1000.00"`) to avoid JavaScript float error.

| Method | Path | Purpose | Success | Notable failures |
|--------|------|---------|---------|------------------|
| POST   | /api/auth/login              | start session       | 200 | 401 bad credentials, 422 malformed |
| POST   | /api/auth/logout             | end session         | 204 | 401 |
| GET    | /api/auth/me                 | current user        | 200 | 401 |
| GET    | /api/people                  | list + `?q=` search | 200 | |
| POST   | /api/people                  | create              | 201 | 409 duplicate phone, 422 invalid |
| GET    | /api/people/:id              | detail + totals     | 200 | 404 |
| PUT    | /api/people/:id              | update              | 200 | 404, 409, 422 |
| DELETE | /api/people/:id              | delete              | 204 | 409 has transactions |
| GET    | /api/people/:id/transactions | statement with running balance | 200 | 404 |
| GET    | /api/transactions            | filter by type/person/date range, paginated | 200 | 422 bad range |
| POST   | /api/transactions            | create              | 201 | 404 person, 422 invalid/overpayment |
| GET    | /api/transactions/:id        | read one            | 200 | 404 |
| PUT    | /api/transactions/:id        | edit                | 200 | 404, 422 |
| DELETE | /api/transactions/:id        | soft delete         | 204 | 404 |
| GET    | /api/dashboard               | every summary number in one call | 200 | |
| GET/PUT| /api/settings                | currency etc.       | 200 | 422 |

Status codes, used consistently:

`400` malformed request · `401` not logged in · `403` logged in but not yours ·
`404` does not exist (or is not yours — we return 404 rather than 403 so the API
does not leak which IDs exist) · `409` conflict with current state · `422`
well-formed but semantically invalid · `500` our bug.

Error body shape, everywhere:

```json
{ "error": { "code": "VALIDATION_FAILED",
             "message": "Amount must be greater than zero.",
             "fields": { "amount": "Must be greater than zero." } } }
```

## 7. Architecture

```
my project/
  backend/
    app/
      __init__.py        app factory
      config.py          env-driven config
      extensions.py      db, migrate, login_manager, cors
      models/            user.py, person.py, transaction.py
      schemas/           request/response validation
      services/          business logic (balances, statements)
      api/               blueprints: auth, people, transactions, dashboard
      errors.py          centralised error handlers
    migrations/          Alembic
    tests/
    .env.example
  frontend/
    src/
      api/               fetch wrapper
      components/
      pages/
      hooks/
      App.jsx
  docs/
```

Layering rule: **api → services → models**. Route functions parse input and choose
a status code; they contain no arithmetic. Services own the business rules and are
testable without HTTP. Models own persistence. This is why the balance logic can be
unit-tested in Phase 12 without starting Flask.

## 8. Frontend pages

Login · Dashboard · People · Person Detail (the centrepiece) · Add Transaction ·
Edit Transaction · Transaction History · Settings.

Primary actions that must always be one click away: **Add Person**, **Add Loan**,
**Record Payment**.

## 9. Roadmap

| Phase | Deliverable | Core lesson |
|-------|-------------|-------------|
| 0  | This spec | Requirements analysis, spotting ambiguity |
| 1  | ERD + migration plan | Relational modelling, keys, constraints |
| 2  | Wireframes | Information hierarchy |
| 3  | Flask app factory, config, health check | Project structure, env vars |
| 4  | Models + Alembic migrations | ORM, schema versioning |
| 5  | Login/logout, protected routes | Hashing, sessions, CSRF |
| 6  | People CRUD end-to-end | REST, validation, first vertical slice |
| 7  | Transactions | Financial invariants |
| 8  | Person statement | Running balance, aggregation |
| 9  | Dashboard | Query design, avoiding N+1 |
| 10 | Search and filters | Indexes, query params, pagination |
| 11 | Validation and error handling | Centralised errors, status codes |
| 12 | Tests | pytest, fixtures, what is worth testing |
| 13 | Security review | Threat modelling |
| 14 | Deployment | Production config, secrets, migrations |
| 15 | README and API docs | Communicating a system |

## 10. Explicitly out of scope for V1

Multi-currency accounting · interest · payment-to-loan allocation · reminders,
SMS or email · file attachments · multi-user sharing · roles and permissions ·
Redis, queues, microservices, container orchestration.
