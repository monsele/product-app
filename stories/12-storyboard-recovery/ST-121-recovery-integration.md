---
story_id: ST-121
title: Recovery workflow integration and release
status: In Review
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


### 2026-10-18 final implementation and release evidence
This record supersedes the implementation checkpoint above. All remaining ST-121
implementation work is complete on the same story branch; the release stays behind
`STORYBOARD_RECOVERY_ENABLED` (default false).

- Files changed: API recovery/readiness/runtime/routes, grounding and prompt-to-video
  services/runner; pipeline audio, illustration, model-dispatch and cleanup handlers;
  storyboard preparation/citations/generation UI and prompt-to-video brief UI;
  schemas, database authority/schema/migrations, provider adapter retry controls,
  observability instruments, focused regression suites and the real-app release
  driver (`apps/api/test-support/recovery-release.ts`). Product, design, technical
  guide, ADR-016 and `docs/reference/storyboard-recovery-release.md` document the
  public behavior and deployment order. The commit file list is the exact inventory.
- Migrations: 0077 adds explicit generation preparation grants and prompt-to-video
  earmarked allowance; 0078 adds sanitized task activity, first-edit/preview
  milestones and scoped indexes. Together with checkpoint migration 0076 they are
  additive and exercised against isolated PostgreSQL. Compatibility/rollback notes
  accompany each migration. No LessonSpec or NormalizedDocument migration.
- Contracts: readiness adds optional bounded activity/metrics and task field paths;
  generation preparation has validated quote/consent contracts and a free estimate
  endpoint; storyboard generation accepts optional explicit preparation consent.
  Prompt-to-video briefs optionally declare preparation enabled. Existing empty
  generation requests and flag-off consumers retain their behavior.
- Authority/concurrency: durable grants precede generation dispatch and replay with
  the same idempotency identity. Project locks serialize shared allowances, worker
  dispatches reserve each attempt, adapters do not add hidden recovery retries,
  stopping cancels future work, and prompt-to-video cancellation is checked before
  provider calls. Recovery waits for captions/timing even when audio is already ready.
  Saved dependency changes replan against current fingerprints; visual edits reuse
  narration. Source changes invalidate grounding independently.
- Technical recovery: exact failed illustration jobs retain their original inputs
  and lifetime attempts; grounding uses existing approved-source checks and remains
  advisory for model judgments. Citation/evidence/content remedies require review.
  Failed or uncertain paid dispatches retain conservative reservations. Every repair
  is verified through authoritative validation before final-render readiness.
- Test commands: API and worker default `vitest run`; schemas/database/provider/
  observability package tests; web `vitest run --maxWorkers=2 --hookTimeout=60000`;
  focused PostgreSQL recovery/readiness, duration-reconciliation and project-cleanup
  suites with TEST_DATABASE_URL; `scene-library` text-overflow tests; final runner/
  gateway suites. Results: API 682 passed (188 opt-in skipped), worker 330 passed
  (64 opt-in skipped), schemas 564, database default 12 (4 opt-in skipped), providers
  84, observability 8 (2 opt-in skipped), web 395 across 67 files, focused API
  PostgreSQL 16, worker PostgreSQL 15, database recovery persistence 1, scene-library
  4 and final runner/gateway 46 passed. Opt-in recovery suites were explicitly run.
- Build/check commands: `pnpm turbo build --filter=@avlp/api
  --filter=@avlp/pipeline-worker --filter=@avlp/web` passed all 14 tasks; the final
  API rebuild passed. Affected workspace lint/typecheck and scoped CRLF-aware
  `git diff --check` were run. Logs are under `.runtime-logs/recovery/` and are
  deliberately excluded from commits.
- Test portability deviations: the existing scene-library test now explicitly types
  an optional title before deleting it (production build strictness); the schema
  fixture test normalizes CRLF for its committed JSON comparison. No production
  rendering or schema behavior changed. The first unbounded web run hit a browser
  startup timeout under concurrent build load; the complete bounded rerun passed.
- Decisions/risks: production provider billing was not exercised; deterministic
  providers drove real local storage, workers and HTTP/UI. The release test does
  not encode a full 238-second video; current-revision render integrity is covered
  by validation/render regression suites. Reservations intentionally err toward
  pausing instead of exceeding consent. Metrics use recorded estimated costs and
  first observed editing/preview, not fabricated completion percentages. No public
  deployment, feature-flag enablement, paid live calls or content rewriting occurred.
- Unrelated user CSS, the untracked scene-list browser test and runtime logs were
  preserved and excluded from this story commit.

- Release verification found and fixed an additional refresh defect: successful
  media jobs can change scene-list status without changing the draft revision.
  Recovery transitions now refresh the scene list directly while retaining the
  mounted editor, selection, unsaved fields and focus. The real-app release driver
  explicitly waits for the old Audio failed badge to disappear, so a ready summary
  cannot conceal stale failure badges.

- Running-app release gate: PASS with real API, Redis/outbox, pipeline worker,
  PostgreSQL, private MinIO and Next UI using deterministic providers. Six original
  audio jobs plus exactly one Scene 6 repair; five successful scenes were reused.
  Audio/captions, reconciliation, grounding and validation settled automatically.
  Final result: 238 seconds versus 180-second planning estimate, two successful
  repair tasks, zero unresolved tasks, one retry, recorded estimated cost $0.00825.
  Fixture observation latencies were 49.602 seconds to editing and 53.793 seconds
  to partial preview (includes cold local startup; not a production benchmark).
  Page opening authorized no paid work. The browser retained unsaved narration
  and focus and removed the old failed-audio badge automatically.
- Screenshots inspected: `.runtime-logs/recovery/live/storyboard-incomplete.png`,
  `storyboard-ready.png`, `lesson-partial-preview.png`, `lesson-preview.png`;
  machine-readable evidence: `.runtime-logs/recovery/live/result.json`.

- Final browser command `pnpm exec playwright test e2e/storyboard-recovery.spec.ts`:
  PASS (1 scenario, 31.4 seconds). Covers preserved fields/focus, keyboard progress
  disclosure, axe preparation-region checks, mobile layout, 200% zoom and incomplete
  scene navigation without paid commands. Representative responsive captures are
  `.runtime-logs/recovery/storyboard-375.png`, `storyboard-1440.png` and
  `storyboard-200-percent.png`. Final affected lint/typecheck passed all 28 tasks;
  web lint/typecheck passed again after the media-status refresh fix.
- Handoff: implementation and release gate complete; In Review follows the
  repository story workflow. Human review owns the Done transition. No subsequent
  story was started.

- Final post-fix production build: `pnpm --filter @avlp/web build` PASS, all 19
  static pages generated plus dynamic routes. Next reports the existing missing
  ESLint-plugin warning; lint and type validation still pass. Staged whitespace
  verification passes with the repository's CRLF-aware setting; the staged secret
  pattern check passes. No implementation or verification remains pending.
