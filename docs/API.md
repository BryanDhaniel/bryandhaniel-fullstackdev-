# IndoKerja.id — API Documentation

REST API for the IndoKerja.id job application platform.

- **Base URL:** `http://localhost:3000/api`
- **Interactive docs (Swagger UI):** `http://localhost:3000/api/docs`
- **OpenAPI JSON:** `http://localhost:3000/api/docs-json` (importable into Postman/Insomnia)
- **Content type:** `application/json` for all request and response bodies

---

## Table of contents

1. [Authentication model](#1-authentication-model)
2. [Roles and permissions](#2-roles-and-permissions)
3. [Status vocabulary](#3-status-vocabulary)
4. [Error format](#4-error-format)
5. [Endpoints](#5-endpoints)
   - [Auth](#51-auth)
   - [Jobs](#52-jobs)
   - [Applications](#53-applications)
6. [Requirement traceability](#6-requirement-traceability)
7. [Quick start with curl](#7-quick-start-with-curl)

---

## 1. Authentication model

Two tokens, two different lifetimes, two different storage locations. The reasoning is
recorded in [`docs/adr/0004`](./adr/0004-access-token-in-memory-refresh-token-httponly-cookie.md).

| | Access token | Refresh token |
|---|---|---|
| **Format** | JWT (signed, HS256) | Opaque random string (not a JWT) |
| **Lifetime** | 15 minutes | 7 days |
| **Transport** | `Authorization: Bearer <token>` | `refresh_token` httpOnly cookie |
| **Stored as** | Nothing — held in client memory only | bcrypt hash in the `refresh_tokens` table |
| **Revocable** | No (expires on its own) | Yes (server-side revocation) |

### Flow

```
POST /api/auth/login
  -> 200 { accessToken, expiresIn, user, refreshTokenExpiresAt }
  -> Set-Cookie: refresh_token=<opaque>; HttpOnly; SameSite=Lax; Path=/
```

1. The client keeps `accessToken` **in memory**. It does not persist it, so closing the
   tab ends the client's knowledge of it.
2. When the access token expires, any request returns `401`. The client calls
   `POST /api/auth/refresh`; the browser attaches the cookie automatically and a **new**
   access token is returned.
3. Refresh tokens **rotate**: each successful refresh revokes the token that was presented
   and issues a replacement. Presenting an already-revoked token is treated as theft and
   **revokes every active session for that user**, forcing a fresh login on all devices.
   (The scope is the user, not a per-device token chain — the reasoning is in
   [ADR-0004](./adr/0004-access-token-in-memory-refresh-token-httponly-cookie.md#revocation-scope).)
4. Because of rotation, a client must never fire two refreshes concurrently. The frontend
   collapses them into one in-flight promise (`frontend/src/api/client.ts`) — without that,
   an ordinary race between two tabs would log the user out everywhere.

### Using the API from a non-browser client

Cookies are a browser convenience, not a requirement. `POST /api/auth/refresh` and
`POST /api/auth/logout` also accept the token in the JSON body:

```http
POST /api/auth/refresh
Content-Type: application/json

{ "refreshToken": "<opaque token>" }
```

The cookie takes precedence when both are supplied. For a curl-based walkthrough see
[§7](#7-quick-start-with-curl).

### Rate limits

Applied globally at 100 requests / 60 seconds per IP, with tighter limits where abuse pays
off. Exceeding a limit returns `429`.

| Endpoint | Limit |
|---|---|
| `POST /api/auth/register` | 5 / 60s |
| `POST /api/auth/login` | 10 / 60s |
| `POST /api/auth/refresh` | 30 / 60s |

---

## 2. Roles and permissions

A user is either a `JOB_SEEKER` or a `COMPANY`. The role is fixed at registration
([ADR-0001](./adr/0001-single-user-table-with-role-discriminator.md)) and cannot be changed
by any endpoint.

| Endpoint | Job Seeker | Company | Anonymous |
|---|:---:|:---:|:---:|
| `POST /api/auth/register` | — | — | ✅ |
| `POST /api/auth/login` | — | — | ✅ |
| `POST /api/auth/refresh` | — | — | ✅ (with cookie/token) |
| `POST /api/auth/logout` | — | — | ✅ (with cookie/token) |
| `POST /api/auth/logout-all` | ✅ | ✅ | ❌ |
| `GET /api/auth/me` | ✅ | ✅ | ❌ |
| `GET /api/jobs` | ✅ | ✅ | ❌ |
| `GET /api/jobs/:id` | ✅ | ✅ | ❌ |
| `GET /api/jobs/mine` | ❌ `403` | ✅ | ❌ |
| `POST /api/jobs` | ❌ `403` | ✅ | ❌ |
| `PATCH /api/jobs/:id` | ❌ `403` | ✅ (own only) | ❌ |
| `POST /api/jobs/:jobId/applications` | ✅ | ❌ `403` | ❌ |
| `GET /api/applications/me` | ✅ | ❌ `403` | ❌ |
| `GET /api/applications/me/:id` | ✅ (own only) | ❌ `403` | ❌ |
| `GET /api/jobs/:jobId/applications` | ❌ `403` | ✅ (own job only) | ❌ |
| `PATCH /api/applications/:id/status` | ❌ `403` | ✅ (own job only) | ❌ |

### `403` versus `404` — read this before debugging

Two different checks happen, at two different layers
([ADR-0005](./adr/0005-authorization-guards-mutations-role-guards-reads.md)):

- **Wrong role → `403 Forbidden`.** A Job Seeker calling `POST /api/jobs` is refused by a
  role guard before any data is read.
- **Wrong owner → `404 Not Found`.** A Company requesting candidates for *another company's*
  job gets `404`, not `403`. Returning `403` would confirm the job exists, which lets an
  attacker enumerate valid IDs. The resource is simply "not found" as far as the caller is
  concerned.

So if you are testing cross-tenant access and expect `403`, a `404` is the correct result.

---

## 3. Status vocabulary

An application has exactly one current status. The database only ever allows these five
values (a PostgreSQL enum):

| Status | Meaning |
|---|---|
| `APPLIED` | The initial state, assigned by the system when the seeker applies. **Cannot be set by a Company.** |
| `REVIEWING` | The company has opened the application. |
| `SHORTLISTED` | The applicant is moving forward. |
| `REJECTED` | The applicant is not proceeding. |
| `ACCEPTED` | The applicant has been accepted. |

**Any status may follow any other** — including `REJECTED` → `REVIEWING`, because a company
reopening a candidacy after an interview is a real workflow, not a data error.

`APPLIED` is rejected with `400` if a Company tries to set it. It is the system-assigned
initial state; allowing a company to write it would let them rewrite history while the
history table still showed the truth.

Every accepted change appends a row to the application history. Setting a status that is
already the current status is a **no-op**: it returns `200` with `changed: false` and writes
no history row, so the audit trail never contains duplicate consecutive entries.

---

## 4. Error format

Every error — validation, auth, database, unhandled — returns the same shape:

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "You have already applied to this job",
  "path": "/api/jobs/8b1f2c3d-.../applications",
  "timestamp": "2026-09-15T13:04:22.108Z"
}
```

`message` is a **string** for most errors and an **array of strings** for `400` validation
failures (one entry per invalid field), so clients should handle both:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": [
    "title should not be empty",
    "jobType must be one of the following values: FULL_TIME, PART_TIME, CONTRACT, INTERNSHIP, FREELANCE"
  ],
  "path": "/api/jobs",
  "timestamp": "2026-09-15T13:04:22.108Z"
}
```

### Status codes used

| Code | Meaning in this API |
|---|---|
| `200` | Success (read, update, status change) |
| `201` | Created (register, create job, apply) |
| `204` | Success with no body (logout, logout-all) |
| `400` | Validation failed, salary range inverted, job inactive, attempting to set `APPLIED` |
| `401` | Missing/expired/invalid access token, bad credentials, unusable refresh token |
| `403` | Authenticated but the wrong **role** for this endpoint |
| `404` | Resource does not exist **or is not owned by the caller** (deliberate) |
| `409` | Duplicate — email already registered, or already applied to this job |
| `429` | Rate limit exceeded |
| `500` | Unexpected server error (internals are never leaked) |

### Validation behaviour

The global `ValidationPipe` runs with `whitelist: true` and `forbidNonWhitelisted: true`.
Consequences worth knowing when calling the API:

- An **unknown property** in a request body is a `400`, not silently ignored. A typo'd field
  name surfaces immediately.
- A property that is not part of the DTO is stripped before it can reach a service, so a
  client cannot smuggle in something like `companyUserId` and have it take effect.
- Enum values are validated strictly — `"full_time"` is rejected; it must be `"FULL_TIME"`.

---

## 5. Endpoints

### 5.1 Auth

---

#### `POST /api/auth/register`

Creates a user. Registering as a `COMPANY` also creates the company profile **in the same
transaction**, so a company can never exist without a name to display on its postings.

**Auth:** none · **Rate limit:** 5/60s

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | ✅ | Valid email, max 254 chars, unique |
| `password` | string | ✅ | Min 8, max 72 chars (bcrypt truncates beyond 72 bytes) |
| `role` | `"JOB_SEEKER"` \| `"COMPANY"` | ✅ | Fixed for the account's lifetime |
| `companyName` | string | ✅ when `role=COMPANY` | Non-blank, max 150 chars. Ignored for `JOB_SEEKER` |

```json
{
  "email": "newuser@example.com",
  "password": "Password123!",
  "role": "COMPANY",
  "companyName": "PT Contoh Sejahtera"
}
```

**Response `201`** — same shape as login, plus a `Set-Cookie` header.

**Errors**

| Code | When |
|---|---|
| `400` | Validation failed, or `companyName` missing/blank while `role=COMPANY` |
| `409` | `"An account with this email already exists"` |
| `429` | Rate limit exceeded |

Note that `companyName` is validated with `@ValidateIf`, not `@IsOptional()`. The latter
short-circuits *every* validator on the property when the value is `undefined`, which would
have made the field effectively optional for companies. Required text fields across the API
also reject whitespace-only values, not just empty strings — a title of `"   "` is a `400`,
because the service would otherwise trim it to `""` and store a nameless job.

---

#### `POST /api/auth/login`

**Auth:** none · **Rate limit:** 10/60s

| Field | Type | Required |
|---|---|---|
| `email` | string | ✅ |
| `password` | string | ✅ |

**Response `200`**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900,
  "user": {
    "id": "3f1a2b4c-5d6e-7f80-9a1b-2c3d4e5f6071",
    "email": "seeker@demo.com",
    "role": "JOB_SEEKER",
    "createdAt": "2026-09-15T13:00:00.000Z"
  },
  "refreshTokenExpiresAt": "2026-09-22T13:00:00.000Z"
}
```

Response header:

```
Set-Cookie: refresh_token=<opaque>; Max-Age=604800; Path=/; Expires=...; HttpOnly; SameSite=Lax
```

A `COMPANY` user additionally carries `companyProfile`:

```json
"companyProfile": {
  "companyName": "PT Teknologi Nusantara",
  "description": "Platform engineering company building logistics software...",
  "website": "https://teknologi-nusantara.example.com",
  "logoUrl": null
}
```

The refresh token is **never** present in the JSON body — only in the httpOnly cookie, so
page JavaScript cannot read it.

**Errors**

| Code | When |
|---|---|
| `400` | Validation failed |
| `401` | `"Invalid email or password"` — returned identically for an unknown email *and* a wrong password, so the response cannot be used to discover which addresses are registered |
| `429` | Rate limit exceeded |

---

#### `POST /api/auth/refresh`

Exchanges a valid refresh token for a new access token. The presented token is revoked and
replaced (rotation).

**Auth:** refresh token via httpOnly cookie **or** request body · **Rate limit:** 30/60s

| Field | Type | Required |
|---|---|---|
| `refreshToken` | string | ❌ — omit when sending the cookie |

**Response `200`** — identical shape to login, with a new `Set-Cookie`.

**Errors**

| Code | When |
|---|---|
| `400` | Malformed body |
| `401` | Token missing, expired, revoked, or already used. Reuse revokes every session for that user. |

---

#### `POST /api/auth/logout`

Revokes the presented refresh token server-side and clears the cookie.

**Auth:** refresh token via cookie or body · **Rate limit:** global (100/60s)

Deliberately does **not** require a valid access token: logging out with an expired access
token must still work, otherwise a session is impossible to end cleanly.

**Response `204`** — no body.

---

#### `POST /api/auth/logout-all`

Revokes every refresh token belonging to the authenticated user — "log out everywhere".

**Auth:** Bearer access token

**Response `204`** — no body.

**Errors:** `401` when not authenticated.

---

#### `GET /api/auth/me`

Returns the authenticated user's profile.

**Auth:** Bearer access token

**Response `200`** — a `UserResponseDto` (the same object as `login`'s `user` field).

Used by the frontend on boot: because the access token lives in memory only, a page reload
loses it, and the app calls `/auth/me` after a silent refresh to recover the session.

**Errors:** `401` when not authenticated.

---

### 5.2 Jobs

---

#### `GET /api/jobs`

Paginated job listing. **Implements requirement 2.**

**Auth:** any authenticated user (Job Seeker or Company)

**Query parameters**

| Name | Type | Default | Notes |
|---|---|---|---|
| `page` | integer ≥ 1 | `1` | 1-based |
| `limit` | integer 1–50 | `10` | Values above 50 are rejected with `400` |
| `q` | string ≤ 100 | — | Case-insensitive across job title, company name, and description |
| `location` | string ≤ 100 | — | Case-insensitive partial match |
| `jobType` | enum | — | `FULL_TIME`, `PART_TIME`, `CONTRACT`, `INTERNSHIP`, `FREELANCE` |

**Response `200`**

```json
{
  "data": [
    {
      "id": "8b1f2c3d-4e5f-6071-8293-a4b5c6d7e8f9",
      "title": "Backend Engineer (Node.js)",
      "description": "Design and build REST services for our logistics platform...",
      "location": "Jakarta, Indonesia",
      "jobType": "FULL_TIME",
      "salaryMin": 12000000,
      "salaryMax": 20000000,
      "currency": "IDR",
      "hasApplied": true,
      "createdAt": "2026-09-03T13:00:00.000Z",
      "company": {
        "id": "a1b2c3d4-...",
        "companyName": "PT Teknologi Nusantara",
        "logoUrl": null,
        "website": "https://teknologi-nusantara.example.com"
      }
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 9,
    "totalPages": 1,
    "hasNextPage": false
  }
}
```

Notes:

- **Only active jobs are returned.** Inactive postings are invisible here to everyone,
  including their owner (who sees them via `GET /api/jobs/mine`).
- **`hasApplied`** tells the calling Job Seeker whether they already applied, so the UI can
  disable the Apply button before the user clicks it. It is always `false` for a Company.
- **`salaryMin`/`salaryMax` may both be `null`**, meaning the salary is undisclosed
  ("Negotiable"). This is deliberately distinct from a salary of `0`. Do not assume the
  fields are present.

**Errors:** `400` (bad `limit`, unknown `jobType`, or unknown query parameter), `401`.

---

#### `GET /api/jobs/mine`

The authenticated company's own postings, **including inactive ones**, each with an
applicant count. **Supports requirement 6** (managing your own postings).

> Route note: `/jobs/mine` is declared before `/jobs/:id`. Any client that calls
> `GET /api/jobs/mine` expecting a job with the id `"mine"` will get this list instead —
> ids are UUIDs, so this cannot collide in practice.

**Auth:** `COMPANY` only

**Response `200`** — array of `JobResponseDto` plus two extra fields:

```json
[
  {
    "id": "8b1f2c3d-...",
    "title": "Backend Engineer (Node.js)",
    "...": "same fields as the listing (salary fields may be null)",
    "isActive": true,
    "applicationCount": 2
  }
]
```

**Errors:** `401`, `403` (caller is a Job Seeker).

---

#### `GET /api/jobs/:id`

Job detail. **Implements requirement 3** (the detail view that precedes applying).

**Auth:** any authenticated user

**Response `200`** — a `JobResponseDto` (same shape as a listing entry).

**Visibility rule:** an **inactive** job is returned only to the company that owns it. For
everyone else — including other companies — the response is `404`. This keeps a withdrawn
posting from being discovered by ID.

**Errors**

| Code | When |
|---|---|
| `400` | `:id` is not a valid UUID |
| `401` | Not authenticated |
| `404` | No such job, **or** the job is inactive and the caller does not own it |

---

#### `POST /api/jobs`

Creates a job posting. **Implements requirement 6.**

**Auth:** `COMPANY` only

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | ✅ | Non-blank, ≤ 150 chars |
| `description` | string | ✅ | Non-blank, ≤ 5000 chars |
| `location` | string | ✅ | Non-blank, ≤ 150 chars |
| `jobType` | enum | ✅ | One of the five `JobType` values |
| `salaryMin` | integer ≥ 0 | ❌ | Omit **both** bounds for an undisclosed salary |
| `salaryMax` | integer ≥ 0 | ❌ | Must be ≥ `salaryMin` |
| `currency` | string | ❌ | Defaults to `IDR`, ≤ 10 chars |
| `isActive` | boolean | ❌ | Defaults to `true` |

```json
{
  "title": "Backend Engineer (Node.js)",
  "description": "Design and build REST services for our logistics platform.",
  "location": "Jakarta, Indonesia",
  "jobType": "FULL_TIME",
  "salaryMin": 12000000,
  "salaryMax": 20000000
}
```

The owning company is taken **from the access token**, never from the request body — there
is no field by which a client could post a job under another company's name.

**Response `201`** — the created `JobResponseDto`.

**Errors**

| Code | When |
|---|---|
| `400` | Validation failed, or `salaryMin > salaryMax` |
| `401` | Not authenticated |
| `403` | Caller is a Job Seeker |

---

#### `PATCH /api/jobs/:id`

Updates a job posting. Send only the fields you want to change.

**Auth:** `COMPANY` only, and only the job's owner

Setting `isActive: false` withdraws the posting: it disappears from `GET /api/jobs` and
refuses new applications. **Existing applications are untouched and keep their statuses** —
the applicant's history is not the company's to rewrite.

To clear a disclosed salary back to "Negotiable", send `null` explicitly:

```json
{ "salaryMin": null, "salaryMax": null }
```

**Response `200`** — the updated `JobResponseDto`.

**Errors**

| Code | When |
|---|---|
| `400` | Validation failed, `salaryMin > salaryMax`, or unknown field |
| `401` | Not authenticated |
| `403` | Caller is a Job Seeker |
| `404` | No such job, **or** the job belongs to another company |

---

### 5.3 Applications

---

#### `POST /api/jobs/:jobId/applications`

Applies to a job. **Implements requirements 3 and 5.**

**Auth:** `JOB_SEEKER` only

| Field | Type | Required | Notes |
|---|---|---|---|
| `coverLetter` | string | ❌ | ≤ 3000 chars |

```json
{ "coverLetter": "I have five years building Node.js services..." }
```

On success the API writes **two rows in a single transaction**: the application itself, and
the initial `APPLIED` history entry with `changedByUserId: null` (it was the system, not a
user, that set it). There is no state in which an application exists without a history.

**The duplicate rule (requirement 5)** is enforced by a database unique constraint on
`(jobId, applicantUserId)` — see [ADR-0003](./adr/0003-duplicate-applications-prevented-by-unique-constraint.md).
A second attempt returns `409`. This holds even if two requests arrive simultaneously: the
database, not application code, is the arbiter.

**Response `201`** — the created application.

**Errors**

| Code | When |
|---|---|
| `400` | Job is inactive, or `coverLetter` too long |
| `401` | Not authenticated |
| `403` | Caller is a Company |
| `404` | No such job |
| `409` | `"You have already applied to this job"` |

---

#### `GET /api/applications/me`

The authenticated seeker's own applications with their current statuses.
**Implements requirement 4.**

**Auth:** `JOB_SEEKER` only

| Query | Type | Default | Notes |
|---|---|---|---|
| `includeHistory` | boolean | `false` | `true` adds the full status history to each item |

**Response `200`**

```json
[
  {
    "id": "9c8b7a65-4321-0fed-cba9-876543210fed",
    "status": "SHORTLISTED",
    "coverLetter": "I have five years building Node.js services...",
    "createdAt": "2026-09-03T13:00:00.000Z",
    "updatedAt": "2026-09-03T15:00:00.000Z",
    "job": {
      "id": "8b1f2c3d-...",
      "title": "Backend Engineer (Node.js)",
      "location": "Jakarta, Indonesia",
      "jobType": "FULL_TIME",
      "isActive": true,
      "company": { "id": "a1b2c3d4-...", "companyName": "PT Teknologi Nusantara" }
    }
  }
]
```

`job.isActive` is included so the UI can mark a posting that has since been withdrawn,
without hiding the application — the seeker's own application history stays visible.

**Errors:** `401`, `403` (caller is a Company).

---

#### `GET /api/applications/me/:id`

One application belonging to the caller, always with its full history.

**Auth:** `JOB_SEEKER` only

**Response `200`** — a `MyApplicationResponseDto` with `history`:

```json
{
  "id": "9c8b7a65-...",
  "status": "SHORTLISTED",
  "...": "as above",
  "history": [
    {
      "id": "1a2b3c4d-...",
      "status": "APPLIED",
      "changedByUserId": null,
      "note": "Application submitted",
      "createdAt": "2026-09-03T13:00:00.000Z"
    },
    {
      "id": "2b3c4d5e-...",
      "status": "REVIEWING",
      "changedByUserId": "a1b2c3d4-...",
      "note": "Strong systems background, moving to technical screen.",
      "createdAt": "2026-09-03T14:00:00.000Z"
    },
    {
      "id": "3c4d5e6f-...",
      "status": "SHORTLISTED",
      "changedByUserId": "a1b2c3d4-...",
      "note": "Passed technical screen. Scheduling on-site.",
      "createdAt": "2026-09-03T15:00:00.000Z"
    }
  ]
}
```

**Errors**

| Code | When |
|---|---|
| `400` | `:id` is not a valid UUID |
| `401` | Not authenticated |
| `403` | Caller is a Company |
| `404` | No such application, **or** it belongs to another seeker |

---

#### `GET /api/jobs/:jobId/applications`

The candidates who applied to one of the company's own jobs.
**Implements requirement 7.**

**Auth:** `COMPANY` only, and only for a job the company owns

| Query | Type | Notes |
|---|---|---|
| `status` | enum | Filter by current status, e.g. `?status=REVIEWING` |

**Response `200`** — candidates with their full history:

```json
[
  {
    "id": "9c8b7a65-...",
    "status": "REVIEWING",
    "coverLetter": "Backend engineer with Go and Node experience...",
    "createdAt": "2026-09-06T13:00:00.000Z",
    "candidate": { "id": "b2c3d4e5-...", "email": "andi@demo.com" },
    "history": [
      { "status": "APPLIED",   "changedByUserId": null,          "note": "Application submitted", "createdAt": "..." },
      { "status": "REVIEWING", "changedByUserId": "a1b2c3d4-...", "note": "Good domain fit.",      "createdAt": "..." }
    ]
  }
]
```

The Candidate's email is exposed here — it is the company's own candidate pool and they need
to contact them. Note the field is , not :  reserves
"Candidate" for the Company's perspective, and the distinction is load-bearing (a Job Seeker
is a Candidate only on jobs they applied to, and a stranger to every other company). Their password hash and refresh tokens live on the same row and are
never serialised.

**Errors**

| Code | When |
|---|---|
| `400` | `:jobId` is not a valid UUID, or unknown `status` value |
| `401` | Not authenticated |
| `403` | Caller is a Job Seeker |
| `404` | No such job, **or** the job belongs to another company |

---

#### `PATCH /api/applications/:id/status`

Changes a candidate's status. **Implements requirements 8 and 9.**

**Auth:** `COMPANY` only, for an application on a job the company owns

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | enum | ✅ | Any status except `APPLIED` |
| `note` | string | ❌ | ≤ 1000 chars, stored on the history row |

```json
{
  "status": "SHORTLISTED",
  "note": "Passed technical screen. Scheduling on-site."
}
```

The status on the application and the new history row are written in **one transaction**
([ADR-0002](./adr/0002-status-history-authoritative-current-status-denormalized.md)), so the
denormalised current status can never drift from the history.

**Response `200`**

A real change. The response is intentionally minimal — it confirms what moved and from where,
which is all the Company UI needs to update its row:

```json
{
  "id": "9c8b7a65-...",
  "status": "SHORTLISTED",
  "previousStatus": "REVIEWING",
  "changed": true
}
```

The created history row is **not** embedded in this response. To read the timeline after a
change, re-fetch the application — `GET /api/applications/me/:id` for the applicant, or
`GET /api/jobs/:jobId/applications` for the Company (whose response includes each candidate's
`history`).

Setting a status the application is **already in** is a no-op — `200` with `changed: false`,
`previousStatus` equal to the current status, and **no** history row, so the audit trail never
contains consecutive duplicates:

```json
{
  "id": "9c8b7a65-...",
  "status": "SHORTLISTED",
  "previousStatus": "SHORTLISTED",
  "changed": false
}
```

**Errors**

| Code | When |
|---|---|
| `400` | `status` is `APPLIED` (the system-assigned initial state), or `status` is missing/unknown |
| `401` | Not authenticated |
| `403` | Caller is a Job Seeker |
| `404` | No such application, **or** it is on another company's job |

---

## 6. Requirement traceability

| # | Requirement | Where it is implemented |
|---|---|---|
| 1 | Login as Job Seeker or Company | `POST /api/auth/register`, `POST /api/auth/login` |
| 2 | Seeker sees jobs (title, company, location, salary, type) | `GET /api/jobs` |
| 3 | Seeker sees detail and can apply | `GET /api/jobs/:id`, `POST /api/jobs/:jobId/applications` |
| 4 | Seeker sees applied jobs and statuses | `GET /api/applications/me` |
| 5 | No duplicate applications | DB unique constraint `(jobId, applicantUserId)` → `409`; see ADR-0003 |
| 6 | Company creates job postings | `POST /api/jobs`, `PATCH /api/jobs/:id`, `GET /api/jobs/mine` |
| 7 | Company sees its own candidates | `GET /api/jobs/:jobId/applications` |
| 8 | Company changes status (5 values) | `PATCH /api/applications/:id/status` |
| 9 | Every change stored in history | `application_history` table, written transactionally; `GET /api/applications/me/:id` returns it |
| 10 | Data in PostgreSQL | Prisma schema + migration in `backend/prisma/` |

Cross-cutting: **Auth & authorization** (§1, §2) · **API validation** (§4) · **Error
handling** (§4) · **DB relationships** (§6) · **Responsive UI** (Tailwind breakpoints in
`frontend/`) · **Maintainable code** (layered modules, ADRs, shared types).

---

## 7. Quick start with curl

Start the stack first — see the root [`README.md`](../README.md). Assumes the API is on
`http://localhost:3000` and the seeded demo data is loaded (`npm run seed`).

```bash
API=http://localhost:3000/api
JAR=/tmp/indokerja-cookies.txt     # curl's cookie jar stands in for the browser
```

### Log in as a Job Seeker

```bash
curl -s -c $JAR -X POST $API/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"seeker@demo.com","password":"Password123!"}'
```

Take `accessToken` from the response and store it:

```bash
ACCESS=$(curl -s -c $JAR -X POST $API/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"seeker@demo.com","password":"Password123!"}' \
  | python -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])')
```

### Browse jobs (requirement 2)

```bash
curl -s $API/jobs?limit=3 -H "Authorization: Bearer $ACCESS"
```

### Search and filter

```bash
curl -s "$API/jobs?q=engineer&jobType=FULL_TIME&location=jakarta" \
  -H "Authorization: Bearer $ACCESS"
```

### View a job and apply (requirements 3 and 5)

```bash
JOB=$(curl -s "$API/jobs?limit=1" -H "Authorization: Bearer $ACCESS" \
  | python -c 'import sys,json; print(json.load(sys.stdin)["data"][0]["id"])')

curl -s -X POST "$API/jobs/$JOB/applications" \
  -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
  -d '{"coverLetter":"I would love to work on this."}'
```

Apply a second time to see the duplicate rule:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$API/jobs/$JOB/applications" \
  -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' -d '{}'
# -> 409
```

### My applications with statuses (requirement 4)

```bash
curl -s "$API/applications/me?includeHistory=true" -H "Authorization: Bearer $ACCESS"
```

### Refresh the access token

The cookie jar supplies the refresh cookie, exactly as a browser would:

```bash
curl -s -b $JAR -c $JAR -X POST $API/auth/refresh
```

Using rotation correctly means the cookie in the jar is replaced on every call. Bypassing
curl's jar (reusing a raw token twice) is what triggers the reuse-revokes-every-session
behaviour.

### Log out

```bash
curl -s -o /dev/null -w '%{http_code}\n' -b $JAR -c $JAR -X POST $API/auth/logout
# -> 204
```

### Switch to a Company account (requirements 6–9)

```bash
CACCESS=$(curl -s -c $JAR -X POST $API/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"company@demo.com","password":"Password123!"}' \
  | python -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])')
```

Create a job posting:

```bash
NEWJOB=$(curl -s -X POST $API/jobs \
  -H "Authorization: Bearer $CACCESS" -H 'Content-Type: application/json' \
  -d '{
        "title":"Platform Engineer",
        "description":"Own our internal platform services.",
        "location":"Jakarta, Indonesia",
        "jobType":"FULL_TIME",
        "salaryMin":15000000,
        "salaryMax":24000000
      }' | python -c 'import sys,json; print(json.load(sys.stdin)["id"])')
```

List your own postings, including inactive ones:

```bash
curl -s $API/jobs/mine -H "Authorization: Bearer $CACCESS"
```

List candidates for a job (requirement 7) — the seeded backend job has applicants:

```bash
curl -s "$API/jobs/$(curl -s $API/jobs/mine -H "Authorization: Bearer $CACCESS" \
  | python -c 'import sys,json,os; j=json.load(sys.stdin); print([x for x in j if x["applicationCount"]>0][0]["id"])')/applications" \
  -H "Authorization: Bearer $CACCESS"
```

Change a candidate's status (requirement 8):

```bash
APP=$(curl -s "$API/applications/me" -H "Authorization: Bearer $ACCESS" \
  | python -c 'import sys,json; print(json.load(sys.stdin)[0]["id"])')

curl -s -X PATCH "$API/applications/$APP/status" \
  -H "Authorization: Bearer $CACCESS" -H 'Content-Type: application/json' \
  -d '{"status":"SHORTLISTED","note":"Strong portfolio. Scheduling a call."}'
```

Confirm the history grew by exactly one (requirement 9):

```bash
curl -s "$API/applications/me/$APP" -H "Authorization: Bearer $ACCESS" \
  | python -c 'import sys,json; [print(h["status"], "|", h["note"]) for h in json.load(sys.stdin)["history"]]'
```

### See the authorization model

```bash
# Wrong role -> 403: a seeker cannot create a job
curl -s -o /dev/null -w '%{http_code}\n' -X POST $API/jobs \
  -H "Authorization: Bearer $ACCESS" -H 'Content-Type: application/json' \
  -d '{"title":"x","description":"x","location":"x","jobType":"FULL_TIME"}'
# -> 403

# No token -> 401
curl -s -o /dev/null -w '%{http_code}\n' $API/jobs
# -> 401

# Cross-tenant -> 404, not 403 (a job belonging to another company)
curl -s -o /dev/null -w '%{http_code}\n' \
  "$API/jobs/$(curl -s "$API/jobs?limit=50" -H "Authorization: Bearer $ACCESS" \
    | python -c 'import sys,json; j=json.load(sys.stdin)["data"]; print([x for x in j if x["jobType"]=="FREELANCE"][0]["id"])')/applications" \
  -H "Authorization: Bearer $CACCESS"
# -> 404 when that job is not company@demo.com's
```

### Inactive jobs are hidden (requirement 6 side effect)

The seed includes a deliberately inactive posting. It never appears in the public listing:

```bash
curl -s "$API/jobs?limit=50" -H "Authorization: Bearer $ACCESS" \
  | python -c 'import sys,json; print([j["title"] for j in json.load(sys.stdin)["data"]]); print("closed jobs listed above?")'
# "DevOps Engineer (Closed)" is absent
```

### Undisclosed salary survives as `null`

```bash
curl -s "$API/jobs?limit=50" -H "Authorization: Bearer $ACCESS" \
  | python -c '
import sys, json
for j in json.load(sys.stdin)["data"]:
    if j["salaryMin"] is None:
        print(j["title"], "->", j["salaryMin"], j["salaryMax"], "(Negotiable)")'
```

---

## Regenerating the OpenAPI spec

Swagger is generated from the DTOs at boot, so it cannot drift from the code. To export it:

```bash
curl -s http://localhost:3000/api/docs-json -o openapi.json
```

## Automated verification

`backend/apitest.js` is a 90-assertion end-to-end script that exercises every requirement
above against a live API and real database:

```bash
cd backend
node apitest.js
```
