# IndoKerja.id — Domain Glossary

This file is a **glossary and nothing else**. It records the canonical meaning of each
domain term. It contains no implementation details, no API shapes, and no technical
decisions — those live in `docs/adr/`.

If a term is used in code or conversation in a way that contradicts this file, the
contradiction is a bug and should be resolved here first.

---

## Actors

### User

An account that can authenticate. Every authenticated actor in the system is a User.

A User has exactly one **Role**, fixed at registration and never changed afterwards.
There is no mechanism to convert a Job Seeker into a Company or vice versa; doing so
would invalidate the ownership of every Job and Application the account is attached to.

### Role

The single classification that determines what a User may do. Exactly two values:

- **Job Seeker** — a person looking for work.
- **Company** — an organisation posting work.

Role is an authorization boundary, not a display preference. It is not a subscription
tier, a verified/unverified flag, or a permission level.

### Job Seeker

A User whose Role is Job Seeker. May browse Jobs, apply to Jobs, and view their own
Applications.

A Job Seeker is not a "candidate". See **Candidate** below.

### Company

A User whose Role is Company. May create Jobs, and may view and progress Applications
submitted to Jobs it owns.

A Company is a *user account that represents an organisation*. It is not the
organisation itself — see **Company Profile**.

### Company Profile

The descriptive attributes of the organisation behind a Company User: display name,
description, website, logo. Exists only for Users whose Role is Company.

The Company Profile is presentation data. A Job's ownership is determined by the
Company User that created it, never by the Company Profile.

---

## Hiring

### Job

A single job posting, created by exactly one Company. Carries title, description,
location, salary range, and job type.

A Job is **owned** by the Company that created it. Ownership is permanent and
non-transferable. Every authorization check about a Job resolves the question
"does this Company own this Job?"

A Job is either **active** or **inactive**. Only active Jobs appear in the public
listing and only active Jobs can be applied to. Inactive is a visibility state, not a
lifecycle stage — see **Closed** below.

### Job Type

The employment arrangement a Job offers. Exactly five values: Full Time, Part Time,
Contract, Internship, Freelance.

Job Type describes the *nature of the engagement*. It is not the same as a job
category, industry, or seniority level, and it is not a work-arrangement flag
(remote/hybrid/on-site) — that is a separate concept that this system does not model.

### Salary

The compensation a Job offers, expressed as a minimum and maximum amount in a currency
(default Indonesian Rupiah).

A Salary may be entirely absent, meaning the compensation is not disclosed. An absent
Salary is rendered as "Negotiable" and is distinct from a Salary of zero.

### Application

A Job Seeker's expression of interest in a specific Job. Created by a Job Seeker,
against a Job, at a point in time.

An Application is a **long-lived record**, not an event. It exists from the moment it is
submitted and persists even if the Job later becomes inactive.

Each Application carries exactly one **current Status** and an append-only **Status
History**. The current Status and the tip of the Status History always agree; they are
two views of the same fact, not two independent facts.

### Applicant

The Job Seeker who submitted an Application. Distinct from **Candidate** — an Applicant
becomes a Candidate only from the Company's point of view.

### Candidate

A Job Seeker *as seen by a Company*, in the context of that Company's Job. A Job Seeker
applying to a Job becomes a Candidate on that Job.

"Candidate" is a role-relative term, not an entity. There is no Candidate table, no
Candidate identity, and no Candidate lifecycle. The same Job Seeker is simultaneously a
Candidate on one Job and merely a Job Seeker with respect to another Company's Job.

### Status

The current standing of an Application, from the Company's point of view. Exactly five
values:

| Status | Meaning |
| --- | --- |
| **Applied** | The Application exists and has not yet been considered. The initial Status, set by the system. |
| **Reviewing** | The Company is actively evaluating the Application. |
| **Shortlisted** | The Company considers the Applicant a strong contender. |
| **Rejected** | The Company has declined the Application. |
| **Accepted** | The Company has extended an offer, or the Application has otherwise concluded in the Applicant's favour. |

Only a Company may change a Status. A Status is **not** application state that the
Applicant controls: a Job Seeker cannot withdraw, and "Withdrawn" is deliberately not a
Status.

**Every Status is reachable from every other Status.** There is no enforced progression
and no terminal Status. `Rejected` does not mean permanently discarded — a Company may
return a Rejected Application to `Reviewing`, which is why no Status is treated as final.
A Job Seeker must not be shown language implying that Rejected is irreversible.

`Applied` is special in one respect only: it is written by the system when the
Application is created and can never be assigned by a Company afterwards.

### Status History

The append-only record of every Status an Application has ever held, in order, with the
time it changed, who changed it, and an optional note.

An entry is written:

- when the Application is created (recording `Applied`), and
- on every subsequent Status change.

Entries are never modified and never deleted. The Status History is the audit trail: if
it and the Application's current Status ever disagree, the Status History is correct and
the current Status is corrupt.

### Apply / Application Submission

The act of creating an Application. A Job Seeker may submit **at most one** Application
per Job. The second and any subsequent attempt is a duplicate and is refused.

The constraint is per **Job**, not per company, per title, or per role. A Job Seeker who
applied to one Job may freely apply to a different Job at the same Company, including a
Job with an identical title.

---

## Terms deliberately NOT used

These appeared in discussion and were rejected. Recording them prevents them from
creeping back in.

- **"Job Listing"** — synonym for Job. Use **Job**.
- **"Employer"** — synonym for Company. Use **Company**.
- **"Applicant"** for the Company's view — use **Candidate** when the Company's
  perspective is what matters. The distinction carries information.
- **"Application Status"** as a separate entity — Status is an attribute of an
  Application. Use **Status** and **Status History**.
- **"Closed"** as a Status value — closure is a property of a Job (`inactive`), not of an
  Application. A closed Job does not change the Status of Applications against it.
- **"Withdrawn"** as a Status value — Job Seekers cannot withdraw Applications.
- **"Verified"** as a Role or Status qualifier — this system does not verify companies.
