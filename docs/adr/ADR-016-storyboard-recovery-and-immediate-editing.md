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

## Workflow and metering details (ST-121)

The storyboard Generate flow displays a separate capped preparation quote before
confirmation. A durable generation grant enrolls only the authoritative completed
draft, using the job's candidate identity. Legacy clients that submit no consent
receive no automatic paid preparation authority. Prompt-to-video confirmations
include preparation within their existing displayed cap: a bounded portion is
earmarked for the shared coordinator and removed from the generation runner's
remaining budget. Preparation uses a distinct correlation identity so those calls
are not charged against both portions. Explicit additional preparation approval
adds to the same project session; switching screens alone adds nothing.

Grounding is checked after media/timing settle, within the approved allowance.
Model judgments remain advisory under ADR-014. Deterministic missing citations
open source review instead of a model call. Asset recovery requeues only the exact
authorized retryable job within its lifetime limit; an intervening scene edit
requires review. Existing candidate review and approved fallback policies apply.
Evidence imagery is never replaced by decorative generated imagery.

Recovery model/image adapters disable transport retries; durable jobs own retry
counts. Model output tokens are bounded by the per-attempt reservation and
configured pricing. Provider output is metered before storage/binding work; an
uncertain failed dispatch retains its reservation. Activity records and first
editable/preview milestones support release metrics without content or signed URLs.
