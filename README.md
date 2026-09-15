# IndoKerja.id — Job Application Management

A simplified implementation of the IndoKerja.id job application flow: job seekers browse and
apply to jobs, companies post jobs and manage the resulting candidates through a status
workflow, and every status change is recorded in an append-only history.

| | |
|---|---|
| **Frontend** | React 18 + TypeScript + Vite 6, TanStack Query, Tailwind CSS |
| **Backend** | Node.js + TypeScript + NestJS 10 |
| **Database** | PostgreSQL 16 via Prisma 5 |
| **API** | REST, documented with Swagger/OpenAPI |

---

## Table of contents

1. [What it does](#1-what-it-does)
2. [Quick start](#2-quick-start)
3. [Demo accounts](#3-demo-accounts)
4. [Project structure](#4-project-structure)
5. [Running without Docker](#5-running-without-docker)
6. [Environment variables](#6-environment-variables)
7. [Database schema](#7-database-schema)
8. [Verifying the build](#8-verifying-the-build)
9. [Design decisions](#9-design-decisions)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. What it does

### As a Job Seeker

- Register or log in.
- Browse active jobs — title, company, location, salary, job type — with search and filtering
  by location and job type, and pagination.
- Open a job to read the full description and apply, optionally with a cover letter.
- **Apply at most once per job.** The UI disables the button and the database refuses a second
  attempt.
- Track every application and its current status, and expand any of them to see the full
  status timeline with the notes the company left.

### As a Company

- Register or log in (registration creates the company profile in the same transaction).
- Create job postings with salary ranges, or omit the salary entirely for "Negotiable".
- Manage your own postings: edit them, or deactivate one to withdraw it from the listing.
  Deactivating never disturbs applications already received.
- See the candidates who applied to each of your jobs, with their cover letters and histories.
- Move a candidate through `Reviewing` → `Shortlisted` → `Rejected` / `Accepted`. **Any status
  may follow any other**, so a rejected candidate can be reopened after an interview.
- Every change is written to the application history with a timestamp, the acting user, and an
  optional note.

### What it deliberately does not do

This is a scoped assessment implementation. There is no email delivery, no file upload or CV
storage, no admin role, no password reset, and no pagination on application lists. The brief
asked for functional correctness, clean code, sound database design, a solid API, and security
— so the effort went there instead of into breadth.

---

## 2. Quick start

### Prerequisites

- **Node.js 20+** (`node --version`)
- **Docker** with Compose, *or* a local PostgreSQL 16 ([§5](#5-running-without-docker) covers
  the no-Docker path)

### Steps

```bash
# 1. Clone and enter the repo
git clone <repository-url> jobapp
cd jobapp

# 2. Start PostgreSQL
docker compose up -d

# 3. Configure and start the backend
cd backend
cp .env.example .env          # Windows: copy .env.example .env
npm install
npx prisma migrate deploy     # create the schema
npm run seed                  # load the demo data
npm run start:dev             # http://localhost:3000/api
```

The API is now up:

- API base — <http://localhost:3000/api>
- Swagger UI — <http://localhost:3000/api/docs>

In a **second terminal**:

```bash
# 4. Start the frontend
cd frontend
npm install
npm run dev                   # http://localhost:5173
```

Open <http://localhost:5173> and log in with one of the [demo accounts](#3-demo-accounts).

> **Ports.** The backend listens on `3000`, the frontend dev server on `5173`, and PostgreSQL on
> `5432`. The frontend proxies `/api/*` to the backend, so there is no CORS configuration to
> adjust during development and no API URL to hardcode in the client.

---

## 3. Demo accounts

`npm run seed` creates these. **Every account uses the password `Password123!`** (override with
the `SEED_PASSWORD` environment variable).

| Role | Email | Company |
|---|---|---|
| Job Seeker | `seeker@demo.com` | — |
| Job Seeker | `andi@demo.com` | — |
| Job Seeker | `siti@demo.com` | — |
| Company | `company@demo.com` | PT Teknologi Nusantara |
| Company | `startup@demo.com` | Kopi Digital Indonesia |
| Company | `enterprise@demo.com` | Bank Sentosa Digital |

The login page has one-click buttons that fill these in.

**The seed is designed so nothing looks empty.** It creates 9 active jobs (plus 1 intentionally
inactive one) covering all five job types across Jakarta, Bandung, Surabaya and remote, with
some salaries disclosed and at least one undisclosed. It also creates 10 applications spread
across **every** status, including a `REJECTED → REVIEWING` reopen and one application on the
inactive job — so the applicant-tracking view and the history timeline both have real content
on first load. One job is left with no applicants so the empty state is reachable too.

`seeker@demo.com` has applications spanning `SHORTLISTED`, `REVIEWING`, `REJECTED`, and
`ACCEPTED`, so a single login shows the full range of outcomes.

---

## 4. Project structure

```
jobapp/
├── docker-compose.yml          PostgreSQL 16
├── CONTEXT.md                  Domain glossary — the shared vocabulary
├── README.md                   This file
├── docs/
│   ├── API.md                  API documentation (endpoints, auth, errors, curl examples)
│   └── adr/                    Architecture Decision Records
│       ├── 0001-single-user-table-with-role-discriminator.md
│       ├── 0002-status-history-authoritative-current-status-denormalized.md
│       ├── 0003-duplicate-applications-prevented-by-unique-constraint.md
│       ├── 0004-access-token-in-memory-refresh-token-httponly-cookie.md
│       └── 0005-authorization-guards-mutations-role-guards-reads.md
│
├── backend/
│   ├── .env.example            Copy to .env
│   ├── apitest.js              90-assertion end-to-end verification script
│   ├── test/
│   │   ├── jest-e2e.json       Jest config for the e2e suite
│   │   ├── setup-e2e.ts        Loads .env, lifts rate limits
│   │   └── app.e2e-spec.ts     108-assertion Jest end-to-end suite
│   ├── prisma/
│   │   ├── schema.prisma       Models, enums, constraints  ← the schema deliverable
│   │   ├── migrations/         SQL migration history        ← the migration deliverable
│   │   └── seed.ts             Demo data
│   └── src/
│       ├── main.ts             Bootstrap: helmet, CORS, validation, Swagger
│       ├── app.module.ts       Root module, global rate limiting
│       ├── config/             Typed environment configuration
│       ├── prisma/             PrismaService (global)
│       ├── common/             Guards, decorators, exception filter
│       ├── auth/               Registration, login, refresh, logout
│       ├── jobs/               Job listings and company-owned postings
│       └── applications/       Applying, applicant tracking, status workflow
│
└── frontend/
    ├── vite.config.ts          Dev server + /api proxy
    ├── tailwind.config.js      Design tokens
    └── src/
        ├── api/                Axios client, endpoint wrappers, shared types
        ├── auth/               AuthContext — session state
        ├── components/         Layout, UI primitives
        ├── pages/              One file per screen
        ├── routes/             Route guards
        └── lib/                Formatters
```

### Where to look first

| To understand… | Read |
|---|---|
| The vocabulary (what "Candidate" means, why "Closed" is not a status) | `CONTEXT.md` |
| Why a decision was made | `docs/adr/` |
| The API contract | `docs/API.md`, or Swagger at `/api/docs` |
| How duplicates are actually prevented | `backend/prisma/schema.prisma` → the `Application` model |
| How the session works | `docs/adr/0004` + `frontend/src/api/client.ts` |

---

## 5. Running without Docker

Any PostgreSQL 16 instance works; only the connection string changes.

**Using an existing local PostgreSQL:**

```bash
# Create the role and database
psql -U postgres -c "CREATE ROLE indokerja LOGIN PASSWORD 'indokerja' CREATEDB;"
psql -U postgres -c "CREATE DATABASE indokerja OWNER indokerja;"
```

```bash
cd backend
cp .env.example .env
# Edit .env:
#   DATABASE_URL="postgresql://indokerja:indokerja@localhost:5432/indokerja?schema=public"

npx prisma migrate deploy
npm run seed
npm run start:dev
```

> **`CREATEDB` is required.** Prisma's `migrate dev` creates a throwaway *shadow database* to
> detect schema drift. Without `CREATEDB` on the role, migrations fail with
> `P3014 — could not create the shadow database`. Grant it with
> `ALTER ROLE indokerja CREATEDB;`.

**Using a different host or port:** change `DATABASE_URL` in `backend/.env`. If PostgreSQL is
already on `5432`, either stop it or map the container elsewhere (`docker-compose.yml`,
`ports:` — for example `"5433:5432"`) and update the connection string to match.

**Development migrations.** For schema changes during development use
`npx prisma migrate dev --name <description>`, which writes a new SQL migration *and* applies
it. Production (and a clean reviewer checkout) uses `npx prisma migrate deploy`, which only
applies migrations already committed under `prisma/migrations/`.

---

## 6. Environment variables

All backend configuration lives in `backend/.env`. Only `DATABASE_URL` and
`JWT_ACCESS_SECRET` have no sensible default.

| Variable | Default | Purpose |
|---|---|---|
| `NODE_ENV` | `development` | Set to `production` to enable the hardened checks below |
| `PORT` | `3000` | Backend listen port |
| `DATABASE_URL` | — | **Required.** PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | — | **Required.** Signing key for access tokens |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN_DAYS` | `7` | Refresh token lifetime in days |
| `BCRYPT_ROUNDS` | `10` | Password hashing cost |
| `CORS_ORIGIN` | `http://localhost:5173` | The one origin allowed to send credentialed requests |
| `SEED_PASSWORD` | `Password123!` | Password given to every demo account |

The frontend needs no configuration: it calls `/api/*` on its own origin and the Vite dev server
proxies that to port 3000. For a production build, serve `frontend/dist` behind a reverse proxy
that routes `/api` to the backend.

### Production hardening

When `NODE_ENV=production`, the app **refuses to start** rather than run insecurely:

- `JWT_ACCESS_SECRET` must be at least 32 characters and must not be a development placeholder.
  Generate one with `openssl rand -base64 48`.
- `CORS_ORIGIN` must be an explicit origin. `*` is rejected, because a wildcard cannot be
  combined with credentialed requests — and allowing one would let any website drive
  authenticated calls against the API.

The refresh cookie also becomes `Secure` automatically in production, so **production requires
HTTPS**.

---

## 7. Database schema

Six tables. The constraints are the interesting part — several requirements are enforced by the
database rather than by application code, because application code cannot survive a race.

```
users ──┬── company_profiles        (1:1, only for companies)
        ├── refresh_tokens          (1:N, hashed, revocable)
        ├── jobs                    (1:N, as the owning company)
        └── applications            (1:N, as the applicant)
                                      │
jobs ─── applications ── application_history   (1:N, append-only)
```

| Table | Purpose | Notable constraints |
|---|---|---|
| `users` | Every account, seeker and company alike | `email` unique |
| `company_profiles` | Company display data | `user_id` unique (1:1) |
| `refresh_tokens` | Active sessions | `token_hash` unique, `expires_at`, `revoked_at` |
| `jobs` | Job postings | FK to the owning company; salary bounds nullable |
| `applications` | One application per (job, seeker) | **`UNIQUE (job_id, applicant_user_id)`** |
| `application_history` | Append-only status trail | FK with `ON DELETE CASCADE`; `changed_by_user_id` nullable |

### Three decisions worth calling out

**Duplicate applications are prevented by a unique constraint, not a check.**
`@@unique([jobId, applicantUserId])` is the source of truth for requirement 5. The service
*also* checks first, to return a friendly error on the common path — but if two requests race,
the database rejects the loser and the API translates the violation into `409`. An
application-level check alone would let both requests pass the check and then both insert. See
[ADR-0003](docs/adr/0003-duplicate-applications-prevented-by-unique-constraint.md).

**The current status is denormalised, but the history is authoritative.**
`applications.status` exists so listing queries do not have to find the latest row in the
history per application. It is *always* written in the same transaction as the history row, so
the two cannot drift. See
[ADR-0002](docs/adr/0002-status-history-authoritative-current-status-denormalized.md).

**`application_history.changed_by_user_id` is nullable on purpose.**
The initial `APPLIED` entry is written by the system when the seeker applies — no user is
acting. `NULL` records that honestly. If the acting company is later deleted, the column is set
to `NULL` rather than cascading the delete: the history of what happened must outlive the
account that did it.

To inspect the schema interactively: `cd backend && npx prisma studio`.

---

## 8. Verifying the build

### Automated test suite (Jest e2e)

`backend/test/app.e2e-spec.ts` boots the real Nest application against the real PostgreSQL
database and drives it over HTTP — nothing is mocked. It is the quickest full check:

```bash
cd backend
npm run test:e2e
```

Expected: **108 passed, 108 total**.

It creates its own accounts under the `@e2e.local` domain and cleans them up afterwards, so it
runs against whatever state your database is in and leaves your seeded demo data alone. It does
lift the rate limits via environment variables (`test/setup-e2e.ts`) — the suite makes a few
dozen account creations from one IP, which would otherwise trip the register limit while
testing unrelated behaviour. The limits themselves are asserted on the decorator metadata
instead.

What it covers, in 14 blocks: login and registration, refresh-token rotation and reuse
detection, logout and logout-all, job listing/search/filter/pagination, job detail visibility,
applying, the duplicate rule (including a genuine concurrent race), a seeker's own
applications, company job management, validation, applicant tracking, the full status
workflow, the uniform error shape, rate limiting, and the database constraints themselves.

### Manual end-to-end smoke script

`backend/apitest.js` is a 90-assertion script that checks the same requirements against a
running API, printing each assertion as it goes:

```bash
# Terminal 1: make sure the API is running
cd backend && npm run start:dev

# Terminal 2
cd backend && node apitest.js
```

Expected output ends with `90 passed, 0 failed`.

> Unlike the Jest suite, this script **mutates your data** (it applies to real jobs and changes
> real statuses). Run `npm run seed` afterwards to restore a clean demo state.

### Type checking and builds

```bash
cd backend  && npm run build          # tsc via nest build
cd frontend && npm run typecheck      # tsc --noEmit
cd frontend && npm run build          # production bundle into dist/
```

### Interactive API testing

Open <http://localhost:3000/api/docs>. Log in through `POST /api/auth/login`, copy
`accessToken`, click **Authorize**, and paste it. Every endpoint except `refresh`/`logout` is
then callable from the browser.

### Resetting the database

```bash
cd backend
npm run db:reset    # drops, re-migrates, re-seeds — destroys all data
```

---

## 9. Design decisions

Each of these is recorded as an ADR in [`docs/adr/`](docs/adr/) with its full reasoning,
the alternatives considered, and the conditions under which the decision should be revisited.
The short version:

| # | Decision | Why |
|---|---|---|
| [0001](docs/adr/0001-single-user-table-with-role-discriminator.md) | One `users` table with a role discriminator, not separate seeker/company tables | Authentication is identical for both; separate tables would duplicate the password hash, the token relationship and the login query |
| [0002](docs/adr/0002-status-history-authoritative-current-status-denormalized.md) | Current status denormalised onto `applications`, history authoritative | Fast listings without a correlated subquery; written transactionally so they cannot diverge |
| [0003](docs/adr/0003-duplicate-applications-prevented-by-unique-constraint.md) | Duplicate applies blocked by a DB unique constraint | An application-level check is a race, not a guarantee |
| [0004](docs/adr/0004-access-token-in-memory-refresh-token-httponly-cookie.md) | Access token in memory, refresh token in an httpOnly cookie, rotated | Removes both stored tokens from the reach of XSS; rotation makes a stolen token detectable |
| [0005](docs/adr/0005-authorization-guards-mutations-role-guards-reads.md) | Role guards on mutations, ownership checks in services returning `404` | Roles are coarse and static; ownership is per-row and returning `403` would confirm a resource exists |

Two choices that are not ADRs but matter:

- **Types are hand-maintained on the frontend** (`frontend/src/api/types.ts`) rather than
  generated from the Swagger spec or shared through a workspace package. A shared
  `packages/types` would guarantee they stay in sync but adds a build step and an install-order
  dependency to a two-app repo; the surface is small, changes rarely, and every field is
  exercised by `apitest.js`. The trade-off is recorded in that file's header comment.
- **Argon2 would be a better password hash than bcrypt** in 2026, but bcrypt is battle-tested,
  available without a native build toolchain, and adequate at cost factor 10 for this scope.
  The 72-byte truncation limit is handled by rejecting longer passwords outright rather than
  silently ignoring the tail.

---

## 10. Troubleshooting

**`P1001: Can't reach database server`**
PostgreSQL is not running or `DATABASE_URL` is wrong. Check `docker compose ps`, or test the
connection: `psql "$DATABASE_URL" -c 'select 1'`.

**`P3014: could not create the shadow database` / `permission denied to create database`**
The role lacks `CREATEDB`. `psql -U postgres -c "ALTER ROLE indokerja CREATEDB;"`. Only
`migrate dev` needs it; `migrate deploy` does not.

**`JWT_ACCESS_SECRET` error at startup**
You are running with `NODE_ENV=production` but a placeholder secret. Set a real one:
`openssl rand -base64 48`.

**`401` on every request, immediately after logging in**
The access token is being sent but rejected. Confirm the header is
`Authorization: Bearer <token>` — with a space, and no quotes around the token. If you are
calling through a proxy, check it is not stripping the header.

**Login succeeds but the session disappears on reload**
The refresh cookie is not being stored or sent, so `/auth/refresh` fails on boot. Causes, in
order of likelihood: the frontend is on a different origin than the backend (check
`CORS_ORIGIN` in `backend/.env` — it must match the frontend's origin exactly, including the
port); the connection is not HTTPS while `NODE_ENV=production` (the cookie is `Secure`); or
cookies are blocked in the browser.

**Logout does not work in Swagger UI**
Expected. Swagger runs on the API's own origin and the refresh cookie is set on that origin, so
`logout` and `refresh` need either a browser session that already holds the cookie or an
explicit `refreshToken` in the body. See [§7 of the API docs](docs/API.md#7-quick-start-with-curl)
for a curl walkthrough that handles the cookie correctly with a cookie jar.

**`429 Too Many Requests` while testing**
Auth routes are limited to 5–10 requests per minute per IP on purpose. Wait a minute, or
restart the backend to clear the in-memory counters.

**Frontend build fails with a TypeScript error after editing API types**
The frontend's types are hand-maintained, so a DTO change on the backend must be mirrored in
`frontend/src/api/types.ts`. `npm run typecheck` catches every mismatch.

---

## License

Written as a technical assessment. Not intended for production use.
