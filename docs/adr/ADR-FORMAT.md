# ADR Format

One file per decision, in `docs/adr/`, named `NNNN-kebab-case-title.md`.

```markdown
# NNNN — <Title>

- **Status:** Proposed | Accepted | Superseded by NNNN
- **Date:** YYYY-MM-DD

## Context

What situation forced a decision? What constraints were in play? Be concrete: name the
requirement, the existing design, or the incident that made this urgent. Assume the
reader has none of your context.

## Decision

What we will do, stated in the active voice: "We will...". One paragraph is usually
enough. If it needs a list, the decision is probably two decisions.

## Alternatives considered

- **<Alternative>** — why it was rejected. "It was simpler" is not a reason; say what
  it would have cost.
- **<Alternative>** — why it was rejected.

## Consequences

What becomes true as a result. Include the bad parts. An ADR with no downsides listed is
an ADR that has not been thought through — every real decision costs something.

## What would change our mind

The concrete evidence or condition that should reopen this. Without this section the ADR
reads as permanent, which invites people to either obey it blindly or ignore it.
```

## When to write one

All three must hold:

1. **Hard to reverse** — changing course later costs real work.
2. **Surprising without context** — a future reader will ask "why on earth is it like
   this?"
3. **The result of a real trade-off** — genuine alternatives existed and one was picked
   for stated reasons.

Missing any one, skip it. An ADR is a record of a decision that someone will otherwise
undo by accident, not a log of everything that was built.
