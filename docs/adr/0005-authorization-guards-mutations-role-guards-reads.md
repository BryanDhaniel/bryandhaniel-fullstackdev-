# 0005 — `authorization` guards mutations, `role` guards reads

- **Status:** Accepted
- **Date:** 2026-09-15

## Context

Requirements 6 and 7 introduce an obvious authorization boundary: a Company may create
Jobs, and may see the candidates who applied to *its own* Jobs. A Company must not see
another company's candidates.

The tempting simplification, and the one most submissions adopt, is to authorize by role
alone: "only a Company may call `GET /jobs/:id/applications`". This is necessary but not
sufficient. Requirement 7 says "lowongan **miliknya**" — *its own* postings. Role alone
would let Company A read Company B's candidate list simply by knowing a job ID, which is
a real IDOR vulnerability and a plainly wrong implementation of the requirement.

The brief also lists "Authorization" and "Database relationship yang baik" as focus
areas, so the ownership relationship is worth making explicit in the schema rather than
checking ad hoc in each handler.

The design question this surfaces is what "ownership" means *for the applicant side*. A
Job Seeker is not an owner of anything except their own Applications. There is no
resource-level ownership to check — the applicant's identity *is* the scope of the query.

## Decision

We will distinguish two kinds of authorization and implement them differently.

**Authorization — resource-level, on mutations.** Any operation that changes existing
state owned by someone (creating a Job, listing a Job's candidates, changing an
Application's status) is checked against a resource relationship, with ownership derived
from the database rather than from a value supplied by the client. The server resolves
"does this Company own this Job?" from `Job.companyUserId`, and never trusts a
`companyId` in a request body. Where a resource is not owned by the caller, we return
**`404 Not Found`, not `403 Forbidden`**, so the endpoint does not confirm the existence
of another party's resource.

**Role — actor-level, on reads and on creation.** Operations whose scope is inherently
"the caller's own data" (listing available Jobs as a Job Seeker, listing one's own
Applications, creating a Job as a Company) are guarded by role alone, because the query
itself already scopes to the authenticated user. A Job Seeker listing their Applications
cannot leak anything: the query is filtered by `applicantUserId = req.user.id`.

Concretely: `JobSeekerGuard` and `CompanyGuard` are applied per-route alongside
`JwtAuthGuard`, and handler logic enforces ownership where a resource is addressed by ID.

## Alternatives considered

- **Role-only authorization everywhere.** Simplest and satisfies the letter of
  requirement 6. Rejected on requirement 7, which is explicitly about ownership, and
  because role-only checks on `GET /jobs/:jobId/applications` is a textbook IDOR that a
  reviewer scanning for security issues will find.

- **`403` for cross-tenant access.** Arguably more honest and easier to debug. Rejected
  because it confirms that the requested resource exists — a Company can enumerate job
  IDs and learn which ones are real. `404` leaks less.

- **A generic CASL / policy-based authorization layer.** Would be the right call in a
  larger system with many resources and fine-grained rules. Rejected as disproportionate
  here: there are two roles and one ownership relationship. A permission framework would
  add a dependency and an indirection for no additional correctness at this size.

- **Enforcing ownership in the database layer via Postgres row-level security.** Strong,
  and genuinely appealing as a defense-in-depth measure. Rejected because Prisma does not
  manage RLS policies, so the policies would live outside the migration history and be
  invisible to anyone reading the schema — worse for a reviewer trying to understand the
  authorization model than explicit guard + service logic.

## Consequences

- The same requirement is enforced in two mechanisms. A developer adding a new endpoint
  must decide which applies, and getting it wrong is possible. The mitigation is that the
  ownership check lives in the service layer next to the query, so it is hard to add a
  "list candidates" method without noticing that its sibling checks ownership.
- Ownership is derived from `job.companyUserId`, which is set at creation from the
  authenticated user and never accepted from the client. There is no endpoint to
  transfer ownership.
- `404` for cross-tenant access means a legitimate bug in a caller's own data (e.g. a
  stale job ID) reports as "not found" rather than "forbidden", which is slightly harder
  to debug. Accepted in exchange for not leaking existence.
- Every mutation path has an e2e test asserting the cross-tenant case is refused. Without
  those tests the distinction is aspirational rather than verified.

## What would change our mind

If a third role were introduced (e.g. an `ADMIN` who may read across tenants, or a
recruiter role acting on behalf of a company), the two-guard model would need replacing
with a policy layer — the ownership predicate would stop being expressible as "the
Company that created it". Similarly, if the number of ownership relationships grew beyond
this one, hand-written service checks would become a maintenance hazard and CASL or RLS
would start to pay for itself.
