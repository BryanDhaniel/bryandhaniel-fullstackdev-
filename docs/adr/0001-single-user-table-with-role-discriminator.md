# 0001 — Single User table with a Role discriminator

- **Status:** Accepted
- **Date:** 2026-09-15

## Context

The system has two kinds of authenticated actor: Job Seekers and Companies. They
authenticate identically (email + password, same token issuance, same session
lifecycle) but diverge sharply in what they may do — a Job Seeker applies to Jobs, a
Company creates them and manages the resulting Applications.

The obvious modeling question is whether these are one table with a discriminator or two
tables with separate credentials. Both are common in production systems, and the choice
is expensive to reverse because it determines the shape of every foreign key, every auth
guard, and every JWT payload downstream.

The brief additionally asks for "database relationship yang baik" as an explicit grading
criterion, so the answer has to be defensible on its merits, not just convenient.

## Decision

We will model both actors as a single `User` table carrying a `role` enum
(`JOB_SEEKER` | `COMPANY`), with company-specific descriptive fields split into a
one-to-one `CompanyProfile` relation that exists only for Users whose role is `COMPANY`.

`Job.companyUserId` and `Application.applicantUserId` both reference `User.id` directly.

## Alternatives considered

- **Two tables: `JobSeeker` and `Company`, each with credentials.** The strongest
  argument for this is that it makes the domain boundary explicit and prevents a
  company row from carrying nullable seeker fields (or vice versa). We rejected it
  because it duplicates password hashing, token issuance, refresh-token rotation and
  login throttling across two code paths that must stay behaviourally identical
  forever. It also forces every auth guard to answer "which table do I look in?" and
  makes a polymorphic `subjectId` on `RefreshToken` necessary — a foreign key that
  cannot be enforced by the database. The nullable-columns objection is answered by
  moving company-only fields into `CompanyProfile`, which is the actual fix and leaves
  `User` with very few optional columns.

- **Single `User` table, all profile fields inline, no `CompanyProfile`.** Simplest, but
  it puts company description, website and logo columns on every job-seeker row. Since
  we already needed the relation for the descriptive fields and it costs one join that
  is only ever performed when displaying a company, the split is nearly free.

## Consequences

- Authentication is implemented once. There is no divergence risk between a "seeker
  login" and a "company login" because there is only one login.
- A `Role` change is a single-column update, and we have decided role is immutable after
  registration (see `CONTEXT.md`). If that policy ever relaxed, the blast radius is
  large: an existing Company's Jobs would remain owned by an account that is now a Job
  Seeker, which the `JobSeekerGuard` and `CompanyGuard` would then disagree about.
- `CompanyProfile` is optional. A `COMPANY` user without a profile is possible in the
  database, so the display layer must handle a null profile rather than assuming it
  exists. Registration creates one atomically to avoid this in practice.
- `Role` is a database enum. Adding a third actor (e.g. `ADMIN`) is a migration, not a
  config change.

## What would change our mind

If Companies and Job Seekers needed genuinely different authentication — for example
companies required SSO/domain verification to log in, or seekers used phone-OTP while
companies used passwords — then the "single auth path" justification collapses entirely
and two tables become correct. Likewise if company-only fields grew to outnumber shared
fields substantially, the discriminator would start costing more than it saves.
