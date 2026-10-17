# ADR-016: Storyboard recovery and immediate editing

Status: Accepted by product-owner instruction, 2026-10-17.

## Decision

Editing and draft preview are independent of final render readiness. A valid
draft is editable and safely displayable scenes can be previewed while media
finishes. Missing, stale and invalid dependencies remain visible. Final approval
and rendering continue to require exact-revision authoritative validation.

A durable, bounded recovery coordinator reuses existing jobs to repair technical
dependencies. It never rewrites teaching content, changes citations, acknowledges
warnings or overwrites teacher edits. Content-changing remedies require explicit
candidate review. Existing pre-authorized prompt-to-video content generation is
unchanged; technical recovery after handoff has no content-writing authority.

Generation/preparation authorization includes a displayed capped recovery allowance
covering saved edits during that preparation session. Page visits grant no paid
authority. Paid attempts reserve allowance before dispatch, including worker
retries, and use existing quota and usage records. A shared project allowance
prevents workflow switches from multiplying spend. Cancellation stops new paid
calls; dispatched calls may finish and incur usage. Three attempts per operation
and dependency fingerprint include existing worker retries.

Recovery survives browser closure and worker restart. Revision/fingerprint checks
protect edits. Completed work and immutable versions remain intact. Recovery task
history stores sanitized codes and outcomes, not source text or signed URLs.

## Consequences

Add recovery-run/task persistence and additive readiness/command contracts. No
LessonSpec or NormalizedDocument shape change. ADR-004 measured duration,
ADR-011 design editing and ADR-014 advisory grounding policies remain in force.
The feature is gated by STORYBOARD_RECOVERY_ENABLED; disabled means legacy
behavior for new requests. Existing authorized jobs retain their safety gates.
