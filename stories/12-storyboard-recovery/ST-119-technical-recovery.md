---
story_id: ST-119
title: Bounded technical lesson recovery
status: Done
depends_on: [ST-118]
epics: [E14, E16, E21]
---
# ST-119 — Bounded technical recovery

## Implementation plan
Use durable orchestration ticks and existing audio jobs. Persist per-input tasks,
reserve capped usage, guard paid worker calls and reject stale/cancelled work.
Queue deterministic timing reconciliation and revalidate after jobs settle.
Expose estimate/start/retry/stop commands with revision/idempotency boundaries.

## Acceptance
Recovery survives restart, isolates scenes and reuses valid audio. Three attempts
include worker retries. Cancellation/budget limits prevent new paid calls. Repeated
requests do not duplicate jobs. Current validation determines final readiness.

## Dev Agent Record
Completed 2026-10-17 on story/st-119-technical-recovery.
- Files: recovery coordinator/readiness/API/runtime, audio command and worker, provider dispatch hooks, timing job, project cleanup, shared schemas/database authority and integration tests.
- Migration: 0075_recovery_dispatch_authority; additive dispatch reservations and authorization receipts; permits real initial storyboard revision zero. Tested on disposable Postgres.
- Contracts: estimate/start/stop routes; optional prepare/retry/increase_allowance intent; worker recovery task identity and caption repair flag.
- Commands: turbo build for API and pipeline worker (12 packages passed); affected schemas/database/API/worker workspace lint passed; API typecheck passed. Broad dependency lint found an existing unused _title in packages/scene-library/src/text-overflow.test.ts:55; no unrelated change made.
- Tests: API readiness/audio/recovery 15 passed; worker audio/provider/cleanup 36 passed; existing authoritative validation 44 passed. Re-ran actual-worker recovery and validation (48 passed) after settling-loop changes. Worker audio tests (18) also passed after moving synthesis persistence ahead of alignment.
- Evidence: real Postgres plus actual fixture worker repairs audio/captions, then caption-only repair performs no additional synthesis/storage write. Idempotency, tenant rejection, stale estimates, cancellation, allowance exhaustion and fourth-attempt denial tested. Existing measured-duration validation tests pass.
- Decisions: provider calls remain outside transactions; worker retries consume the same three-attempt ceiling. Completed synthesis is stored and metered before alignment. Settled runs stop polling; later authorized commands can resume their allowance. Unknown coordinator errors stop after bounded worker retries.
- Risks/dependencies: generation/edit completion wake-ups and shared one-shot allowance integration are ST-121; the storyboard UI and safe partial preview are ST-120. Feature remains off by default. Paid providers were not called during verification.
- Deviations: no UI screenshots for this backend story; representative output is the actual-worker integration suite. The full release gate remains pending ST-121.
