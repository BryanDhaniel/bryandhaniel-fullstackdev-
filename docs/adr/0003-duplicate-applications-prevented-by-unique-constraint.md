# 0003 — Duplicate applications are prevented by a database unique constraint

- **Status:** Accepted
- **Date:** 2026-09-15

## Context

Requirement 5 forbids a Job Seeker from applying to the same job more than once. The
brief does not say *how* this must be enforced, but it is one of the explicitly listed
functional requirements, so it will be tested — likely by a reviewer clicking "Apply"
twice, and possibly by a reviewer sending two requests at once.

This is a correctness requirement, not a UX preference. Two applications for the same
`(jobId, applicantUserId)` pair existing in the database is a data-integrity failure
regardless of how the UI behaves.

There is a well-known race in the naive implementation: the application reads to check
for an existing application, finds none, and inserts. Two requests interleaved between
the read and the insert both find none, and both insert. A guard in application code
does not close this window.

## Decision

We will enforce uniqueness with a database-level unique constraint on
`Application (jobId, applicantUserId)`, expressed in Prisma as `@@unique([jobId, applicantUserId])`
and materialized in a migration.

We will *additionally* perform a pre-check `findUnique` before inserting, so the ordinary
duplicate attempt returns a clean `409 Conflict` with a friendly message without
provoking a constraint violation. The pre-check is an optimization of the common path,
not the guarantee. The database constraint is the guarantee.

The insert path catches Prisma error `P2002` and translates it to the same `409 Conflict`
response. The race is therefore closed by the database, and the loser of the race still
receives a correct, well-formed error.

## Alternatives considered

- **Application-layer check only.** Rejected: it does not actually enforce the
  requirement. The window between `SELECT` and `INSERT` is small but real, and the
  failure mode is silent duplicate data rather than an error. For an explicit
  correctness requirement this is the wrong place to be optimistic.

- **Unique constraint only, no pre-check.** Functionally correct, and one fewer query on
  the happy path. Rejected because every duplicate attempt then produces a database
  exception in the logs, and translating `P2002` into an HTTP response requires the same
  error-handling code anyway — so the pre-check costs one cheap indexed lookup and keeps
  the normal path free of exceptions. Note this does mean the check happens twice in the
  duplicate case, which is fine: duplicates should be rare.

- **A separate "application lock" row or advisory lock per job seeker.** Rejected as
  over-engineered. A unique index is the exact tool for this constraint and needs no
  coordination protocol.

## Consequences

- The duplicate rule is enforced even if a future endpoint, script, or seed file forgets
  to check first. Any writer that violates it fails loudly at the database.
- `P2002` handling is now load-bearing: it must map to `409 Conflict` and not to a
  generic `500`. There is an e2e test asserting this.
- The constraint is per `(jobId, applicantUserId)`, which correctly permits a Job Seeker
  to apply to two different Jobs at the same Company — including two Jobs with identical
  titles. If the product later wanted "one application per company", that is a different
  constraint and a migration.
- A Job Seeker who is rejected cannot re-apply to the same Job by creating a *new*
  application; the existing application is moved back through statuses instead. This is
  consistent with there being no `Withdrawn` status.

## What would change our mind

If the domain ever allowed reapplying after rejection as a genuinely new application
(discarding the prior history), the unique constraint would have to become partial —
unique only among *live* applications — and history would need to distinguish
application attempts. That would be a product decision with real modeling cost, and it
would supersede this ADR.
