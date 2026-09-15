# 0002 — Status history is authoritative, current status is a denormalized read model

- **Status:** Accepted
- **Date:** 2026-09-15

## Context

Requirement 9 states that every status change must be recorded in an application
history. Requirement 4 ("see my applied jobs and their status") and requirement 7
("company sees candidates for its job") both require reading the *current* status of an
Application, and both are among the hottest queries in the application — every list view
hits one of them.

This creates a classic tension. History is append-only and correct by construction, but
deriving the current status from it means a correlated subquery or a
`DISTINCT ON (application_id) ... ORDER BY created_at DESC` join on every row of every
list. Storing the current status on the Application row is fast to read but introduces a
second source of truth that can drift from the history.

An application can transition many times (Applied → Reviewing → Rejected → Reviewing →
Shortlisted), so "the history" is not merely a creation record.

## Decision

We will store both: an `Application.status` column holding the current status, and an
append-only `ApplicationHistory` table holding every status the application has held.

Both are written **inside a single database transaction** on every status change, so
they cannot diverge on a committed write. The history entry for the initial `Applied`
state is written by the same transaction that creates the Application, not deferred to
the first change.

If the two ever disagree on an existing row, `ApplicationHistory` is by definition
correct and `Application.status` is corrupt; it is repaired from the history, never the
other way around.

## Alternatives considered

- **Derive current status from history only.** This is the purist position and it is
  genuinely tempting — one source of truth means drift is impossible. We rejected it
  because the two most frequent queries in the system would both become window-function
  joins over a table that grows without bound (every status change adds a row, forever).
  For an assessment-scope application the absolute numbers are small, but the query
  shape is the kind a reviewer notices, and "the list endpoint aggregates the audit
  log" is a design that does not survive contact with real data volume.

- **Store current status only, log changes to the application logger.** Rejected: the
  requirement explicitly says history must be *stored*, and logs are not queryable
  domain data. A company wants to see its own history through the API, not by reading
  server logs.

- **Status changes as events with an event-sourced Application.** Rejected as
  disproportionate. Full event sourcing would mean replaying events to build every read
  model, which is a large amount of machinery for a status field with five values. The
  denormalized-column approach captures the audit benefit without the machinery.

## Consequences

- Every status change is a transaction, not a bare `update`. This is non-negotiable and
  must not be optimized away — the two writes are one unit of work.
- `Application.status` is technically redundant data. A future developer may be tempted
  to "clean this up" by dropping the column and joining the history. The ADR exists to
  stop that.
- Writes are serialized per application in practice. Two concurrent status changes could
  interleave their history entries; since history is ordered by `created_at` and the
  last writer wins on `status`, the result stays consistent, but the ordering of two
  same-instant entries is not guaranteed. Not a problem at this scale; noted for honesty.
- We deliberately do **not** enforce legal transitions between statuses (see
  `CONTEXT.md`), so history ordering carries no state-machine meaning — it is a record
  of what happened, not a validated sequence.

## What would change our mind

If a genuine state machine were introduced (a decision we explicitly rejected), the
history would need transition validation and this ADR would need revisiting. Separately,
if Application rows ever needed to be listed at a volume where even the denormalized
column was insufficient, a materialized view would be the next step — but that is a
performance change, not a change to this decision.
