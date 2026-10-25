---
story_id: ST-126
title: Recovery allowance accounting and liveness fixes
phase: "12"
status: In Review
depends_on: [ST-121]
epics: [E14, E16, E21]
---

# ST-126 - Recovery allowance accounting and liveness fixes

## Story
As a teacher whose lesson is being prepared, I want my saved edits, a Stop
press and worker restarts to behave predictably. Edits during preparation should
stay within the allowance I approved, Stop should always work, and preparation
should never stall silently.

## Outcome
A review of ST-118 to ST-121 found defects in the recovery coordinator
(`apps/api/src/lesson-recovery.ts`). These must be fixed before
`STORYBOARD_RECOVERY_ENABLED` is turned on:

1. Superseded and failed tasks kept their unspent reservation, so one narration
   edit during a full preparation exhausted the allowance. That contradicted
   the estimate's `coversSavedEdits` claim.
2. A save landing during a coordinator tick made `audio.generate` raise a 409.
   The handler then marked every queued task in the run as
   `RECOVERY_REVIEW_REQUIRED`, and nothing re-queued them.
3. An expired coordinator lease blocked signal delivery and grant enrollment
   for that project forever.
4. Stop returned 409 whenever the revision had changed, and the coordinator
   changes the revision itself during timing reconciliation.
5. The pending-grant scan was unordered and capped at 100. Grants that could
   never enroll stayed pending forever, and transient 429/5xx errors
   permanently stopped a paid grant.
6. Each readiness poll (every 3 seconds per tab) re-ran full validation
   whenever the latest report was stale.
7. Production code priced the `fixture-v1` provider at $0, so no test exercised
   real audio allowance accounting.

## Dependencies
ST-121 (Done). ADR-016 remains in force. No ADR change is needed: these fixes
restore the behavior ADR-016 already specifies.

## Scope
- Add one reservation-release helper. Every transition that ends a task's
  ability to dispatch (`succeeded`, `failed`, `superseded`, coordinator
  `needs_action`) returns its unspent reservation to the run. Spent calls stay
  debited.
- Treat a coordinator `edit_conflict` as transient: tasks stay `queued`, the run
  stays `queued` and the next tick replans. Other errors still surface as
  before. An explicit retry also revives tasks the coordinator parked.
- Count a lease as held only while `lease_until > now()`.
- Stop is accepted regardless of `expectedRevision`. The field stays in the
  contract, and the idempotency receipt is unchanged.
- Grant enrollment rotates in least-recently-checked order. It stops grants
  whose candidate can no longer enroll (a non-draft spec, or more than 24 hours
  pending). 429 and 5xx dispatch errors leave the grant pending.
- The readiness read revalidates at most once per project per 10 seconds, with
  concurrent reads in one process sharing a single run.
- Remove the `fixture-v1` pricing branches. The fixture TTS provider calls the
  dispatch hook itself, like a real adapter.
- `advance()` no longer erases unrelated run failure codes when it records the
  voice requirement.

## Contracts and Persistence
No migration, and no LessonSpec, NormalizedDocument or HTTP contract change.
`POST /projects/:id/recovery/stop` still requires `expectedRevision` and
`idempotencyKey`, but it no longer rejects a stale revision. Local fixture
estimates now reflect the configured pricing instead of $0.

## Acceptance Criteria
- A narration edit during a full preparation (all scenes reserved) is prepared
  within the original allowance when the new narration is no longer than the
  old.
- The run's reserved total never includes unspent money from superseded or
  failed tasks.
- A save during a tick leaves the other scenes queued, and the next tick
  dispatches them without any user action.
- With an expired lease, a saved change is delivered on the next drain.
- Stop succeeds after the revision changed and blocks further dispatches.
- A transient generation dispatch failure leaves the grant pending, and a
  conflict stops it.
- Concurrent stale readiness reads trigger one validation run, and reads within
  the throttle window trigger none.
- Integration tests run with non-zero audio pricing.

## Required Tests
Postgres integration, in `apps/api/src/lesson-recovery.integration.test.ts`:
one regression for each acceptance criterion above. Each new case must fail on
the ST-121 code and pass after the fix. Existing recovery, readiness, worker
audio and recovery-dispatch suites must keep passing.

## Out of Scope
These are noted in the review and left for later:
- Partial preview dropping `creativeDesign` for the whole lesson when one scene
  is invalid.
- The duplicated fetch in `use-lesson-readiness.ts`.
- Key-order-sensitive comparison in `mergeEditorRefresh`.
- A retention policy for `lesson_recovery_activity`.
- The alignment estimate's 60-seconds-per-scene assumption.
- Turning on the feature flag.

## Definition of Done
- Acceptance criteria are covered by tests that pass.
- Affected build, lint and typecheck pass.
- There is no line-ending churn.
- `graphify update .` has been run.
- The Dev Agent Record lists commands and results.

## Dev Agent Record
Implemented 2026-10-25 on story/st-124-design-system-interpretation, at the owner's
request ("implement the plan on this branch"). ST-124's own changes are untouched.

- Files: `apps/api/src/lesson-recovery.ts`, `apps/api/src/lesson-readiness.ts`,
  `apps/pipeline-worker/src/scene-audio-job.ts`, and
  `apps/api/src/lesson-recovery.integration.test.ts`.
- Reservations:
  - A single `releaseTasks` helper (advisory lock, `FOR UPDATE`) replaces the
    two hand-written settle paths.
  - It now also covers audio/captions and grounding supersede, failed audio,
    and tasks the coordinator parks.
  - `start()` revives coordinator-parked tasks, and treats a null failure code
    as eligible.
- Liveness:
  - `leaseHeld()` compares `lease_until` with the current time.
  - `edit_conflict` re-queues the run without touching its tasks.
  - `stop()` no longer checks `expectedRevision`.
  - Grant enrollment:
    - rotates by `updated_at`
    - stops non-draft candidates and grants pending longer than 24 hours
    - keeps a grant pending on 429/5xx
    - isolates unexpected per-grant errors, so signal delivery continues
- Readiness:
  - A stale or outdated report is revalidated at most every 10 seconds
    (constructor option).
  - Concurrent reads share a single in-process run.
  - Render stays blocked while the report is stale.
- Pricing:
  - The `fixture-v1` $0 branches are removed from the estimate and the
    per-scene cost.
  - The fixture TTS provider calls `beforeDispatch(0)` itself, and the worker's
    provider-name special case is gone.
  - Local fixture estimates now show the configured price.
  - `advance()` only sets or clears `VOICE_REQUIRED`.
- Migrations and contracts: none changed.
- Tests: six new Postgres regressions, one per acceptance criterion.
  - Against the ST-121 code, five fail directly.
  - The sixth (allowance after an edit) passed on ST-121 only because the
    fixture was priced at $0. It now asserts a non-zero allowance, which makes
    it fail there.
  - With pricing kept and only the supersede release reverted, it fails with
    the edited scene at `needs_action` (allowance exhausted), as the review
    predicted.
- Commands (Postgres at localhost:5433 via `TEST_DATABASE_URL`):
  - `vitest run src/lesson-recovery.integration.test.ts`: 17 passed.
  - API recovery/readiness/scene-audio/validation/one-shot/grounding/storyboard
    integration: 58 passed.
  - Worker audio/recovery/duration/cleanup/illustration integration: 26 passed.
  - API default suite: 677 passed. 7 route tests timed out under parallel
    load, a known baseline; all 93 pass with `--no-file-parallelism`.
  - Worker default suite: 347 passed. The ST-124 PDF-guide test failed under
    load and passes alone.
  - `pnpm turbo build` (API and worker): 12/12.
  - `pnpm turbo lint typecheck` (API and worker): 24/24.
  - Prettier was applied to `lesson-recovery.ts`, which was formatted at HEAD.
    `lesson-readiness.ts`, `scene-audio-job.ts` and the integration test were
    already unformatted at HEAD and were left alone to avoid churn.
  - No CRLF churn (`git diff --ignore-cr-at-eol` matches).
- Environment:
  - Started Docker Desktop and the existing `product-app-postgres-1` container;
    no data was recreated.
  - Ran `pnpm install --frozen-lockfile` to supply ST-124's locked `fontkit`
    and `pdfjs-dist`.
- Running-app release gate (2026-10-25, after the recurring-repair fix):
  - Setup: rebuilt API and worker, then started the existing Redis and MinIO
    containers. Ran the runbook command from `apps/api` with
    `TOGETHER_API_KEY=' '`; no paid providers were used.
  - Result: PASS ("Scene 6 only, 3:58 ready"). `result.json` matches the
    ST-121 run on every outcome: 238 s against a 180 s target, 7 audio jobs,
    1 repaired scene, 1 grounding task, 2 successful repairs, 0 unresolved
    tasks, 1 retry and $0.00825 recorded cost.
  - Differences from ST-121:
    - Time to editing was 158.6 s and to preview 161.9 s, against 49.6 s and
      53.8 s. Both include a cold `next dev` compile after the dependency
      install, so this is not a benchmark, but it should be compared on a warm
      rerun.
    - The ready summary now reads "2 tasks completed" (ST-121: 1).
  - Screenshots: unsaved narration and focus were retained. The scene list
    still shows "Needs attention" on ready scenes, as in ST-121's
    `storyboard-ready.png`, so that predates this story.
- `pnpm exec playwright test e2e/storyboard-recovery.spec.ts`: 1 passed (35.6 s).
  No servers were left running on ports 3000, 3002, 3100 or 3101.

### 2026-10-25 follow-up: recurring repairs and housekeeping
- Recurring-repair defect, now fixed:
  - Cause: a later repair of the same audio has the same operation and
    fingerprint as an earlier succeeded task. The unique index therefore routed
    it to that task, and it was marked `RECOVERY_NO_PROGRESS` with no dispatch.
  - New test "repairs captions again after an earlier repair of the same audio
    succeeded" reproduced it: the first repair dispatched 2 jobs, the second 0.
  - Fix: `advance()` reopens a succeeded media task through `reopenTask()`.
    The task gets fresh attempts and a reservation against the current run,
    and the earlier cycle's spend stays debited. `RECOVERY_NO_PROGRESS` now
    means only a dispatched job that finished with the issue still present.
  - The audio dispatch key now includes the task's `updatedAt`, so a reopened
    cycle gets a new job instead of the earlier one. `updatedAt` is fixed
    between queueing and dispatch, so retries still dedupe.
- Verification:
  - Recovery suite: 18 passed.
  - API recovery/readiness/scene-audio/validation/one-shot/grounding/storyboard
    integration plus the readiness and scene-audio unit tests: 70 passed.
  - API and worker lint/typecheck: 24/24.
  - No CRLF churn.
- Housekeeping, at the owner's request:
  - Added `.runtime-logs/` to `.gitignore` and ran
    `git rm -r --cached .runtime-logs`. That stages 1,669 index deletions; the
    files stay on disk.
  - Moved index rows 118-126 into the main story table, directly after 117.
    They had been appended after later prose with blank lines between them, so
    they did not render as table rows.
  - Fixed the ST-120 heading separator (a `?` from a lost dash).
  - Renumbered the duplicate table-cell follow-up story from ST-118 to ST-127
    on `feat/st117-table-cell-corrections`, in local commit 860ece8
    (not pushed).
