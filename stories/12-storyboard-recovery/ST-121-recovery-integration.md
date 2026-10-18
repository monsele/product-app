---
story_id: ST-121
title: Recovery workflow integration and release
status: In Progress
depends_on: [ST-120]
epics: [E11, E14, E16, E21]
---
# ST-121 - Recovery workflow integration and release

## Implementation plan
Connect durable dependency-change notifications to the existing authorized recovery
coordinator. Coalesce saved edits and job completions, preserve stopped sessions,
and never create authorization from reads. Integrate generation preparation with
the shared project allowance and existing worker dispatch guards. Add activity and
release telemetry, exercise the six-scene failure through the running application,
and retain authoritative render checks. Update contracts before consumers.

## Acceptance
- Authorized preparation resumes after saved dependency changes and job completion,
  including browser closure and worker restart; visual edits reuse valid audio.
- Generation workflows share one displayed capped allowance; every paid attempt
  is metered and bounded, and stopping prevents new dispatches.
- Legacy lessons use explicit estimates; allowance exhaustion leaves editing open.
- Required asset/grounding work uses approved jobs and allowances; content remedies
  require review, and terminal failures remain actionable.
- Six-scene reported failure recovers automatically; 238 seconds of measured audio
  is accepted against the original 180-second planning estimate.
- Concurrency, stale edits, duplicate requests, cancellation, provider failures,
  caption-only repair and final-render integrity have regression coverage.
- Activity and release metrics expose time to editing/preview, successful repairs,
  unresolved tasks, retries and cost without source text or signed URLs.
- Affected lint/typecheck/tests/builds and running-app release gate pass; default
  feature flag remains off until the gate is verified.

## Out of scope
Automatic teaching-content rewrites, citation replacement, warning acknowledgement,
new LessonSpec or NormalizedDocument shapes, and public deployment.

## Dev Agent Record
In progress on story/st-121-recovery-integration. ST-120 is Done. Preserve unrelated
storyboard.module.css, scene-list browser test and runtime logs.

### 2026-10-18 implementation checkpoint
- Files: lesson-recovery coordinator, API runtime notification scheduler, database
  signal schema/migration/journal, integration tests, technical guide and story index.
- Migration 0076: additive tenant/project-scoped durable signals and dependency
  triggers; compatibility/rollback ordering documented beside the SQL. Verified
  migration against a fresh isolated PostgreSQL test database.
- Public contracts: unchanged. Notifications grant no paid authority. Existing
  stopped sessions remain stopped; the feature flag still defaults to disabled.
- Implemented coalesced saved-edit and job-completion wake-ups, atomic outbox
  delivery, concurrent scheduler deduplication, and lease-aware edit preservation.
- Fixed an integration defect: valid captions extending past a planned scene
  duration must await measured-audio reconciliation, not be regenerated first.
- Verification: seven PostgreSQL recovery integration tests pass, including the
  actual audio worker with controlled providers. The six-scene case queues only
  failed Scene 6, preserves five completed tracks, rebuilds captions and reconciles
  to 238 seconds; the 180-second target is informational. Subsequent real editor
  saves reuse audio for a visual change and regenerate only changed narration,
  preserving the teacher's text and visuals. Caption-only repair wakes without
  another command and performs no additional synthesis/storage write.
- Additional checks: API readiness/validation/audio unit suites (55 tests) and
  audio worker suite (18 tests) pass. Database lint/typecheck and API lint pass.
  API build passes. Duration-reconciliation integration suite: 13 tests pass.
- Test maintenance: two existing reconciliation assertions expected rounding down
  from 33.4 seconds to 33. Updated to the established round-up policy (34 seconds,
  total 62) and explicitly assert that measured narration is never truncated.
  Production duration-reconciliation behavior is unchanged.
- Final checkpoint checks: 95 tests pass across the named suites plus database
  ownership conventions. API/database/pipeline-worker builds and affected lint /
  type checks pass. Scoped diff whitespace check passes with CRLF-aware settings.
- Environment: Docker Desktop was stopped; started it and resumed existing Compose
  containers without recreating or deleting data. Tests use isolated databases.
- No new UI screenshots at this checkpoint; this is backend verification, not the
  running-app release gate. ST-120 browser captures remain the interface evidence.
- Still required before completion: generation-path authorization/shared allowance,
  asset/grounding integration, activity/telemetry and full running-app release gate.
  Do not mark ST-121 Done or enable the release flag based on this checkpoint.
