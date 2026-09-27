---
story_id: ST-105
title: "Orchestrate Prompt-to-Video Runs Server-Side behind a Pilot Cohort"
phase: "10 — Prompt to Video"
status: Done
priority: should-have
epics: ["E3", "E4", "E5", "E7", "E8", "E9", "E10", "E14", "E16", "E17", "E21"]
prd_user_stories: ["E7-US1", "E8-US1", "E9-US1", "E10-US1", "E16-US1", "E17-US1", "E21-US1", "E21-US2"]
depends_on: ["ST-059", "ST-063", "ST-066", "ST-068", "ST-096", "ST-104"]
---

# ST-105 — Orchestrate Prompt-to-Video Runs Server-Side behind a Pilot Cohort

## Story

As a pilot user, I want a single authorised request to run the whole lesson pipeline for my
PDF and focus prompt. It should stop at a playable preview for my one render approval, and
tell me exactly where it stopped if something needs my attention.

## Outcome

This is the second of three prompt-to-video stories. It delivers the API and the runner; the
screens come in ST-106.

A run starts with an estimate and one explicit, idempotent `POST one-shot`. It then goes
through every existing stage with the existing NestJS services, approving on the user's
behalf and recording an audit entry for each approval. It stops at `awaiting_render_approval`,
or at `needs_attention` with the stage to fix. `POST one-shot/render` is the single human gate.
Everything is behind a server-enforced pilot cohort.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-012-prompt-to-video-pilot.md` (from ST-104), ADR-001 and ADR-007
- `docs/demonstration-pilot.md`, for the cohort pattern to copy
- `docs/reference/epic-technical-implementation-guide.md`: §5.1, §5.3, the quota section
  (`:2137-2214`) and the cross-cutting sections
- `packages/jobs/src/{dispatcher,queue,worker,contracts}.ts`
- `apps/api/src/{source-snapshot,lesson-configuration,objectives,outline,narration,storyboard,illustration-generation,grounding,scene-audio,lesson-validation,lesson-versions,renders,demonstration-pilot}.ts`

## Dependencies

ST-059, ST-063, ST-066, ST-068 and ST-096 are Done. ST-104 must be Done before this starts.

## Stage Map (from exploration)

| Step | Existing call | What it waits for |
| --- | --- | --- |
| 1 | Ingestion (already chained validation → ingestion) | Stage reaches `ingestion_review` |
| 2 | `SourceSnapshotService` approve, with all sections | A snapshot exists |
| 3 | `LessonIntentService.infer` (ST-104), then save the configuration and the voice configuration (`english-aria`) | The rows are saved |
| 4 | `objectives/generate` | Job done. `not_covered` stops the run; otherwise approve with `expectedRevision` |
| 5 | `outline/generate` | Job done, then approve |
| 6 | `narration/generate` | Job done, then approve |
| 7 | `storyboard/generate` | Job done |
| 8 | `illustrations/generate-missing` | Candidates done, and grounding-critical slots excluded (ST-085). Accept safe candidates only where ST-059's rules allow it; otherwise leave the slot for validation to report |
| 9 | `grounding-checks` | Job done |
| 10 | `audio/generate` | Stage reaches `ready_for_validation` |
| 11 | `validation/run` | Errors → `needs_attention` at `preview`. Warnings are recorded, never acknowledged |
| 12 | — | Set `awaiting_render_approval` |

## Scope

### 1. Pilot flag

- [x] Add `ONE_SHOT_PILOT_ENABLED` and `ONE_SHOT_PILOT_USER_IDS` in `packages/config`,
  copying `:507-521`. Both default closed. Document them in `.env.example`.
- [x] Add a `OneShotPilotCohort` interface, copied from `demonstration-pilot.ts:152-182`.
  - Every read returns eligibility, with `visible: false` for users outside the cohort.
  - Every write fails with 409 (`assertCohort` semantics).
  - The flag gates the API commands only, so when it is off, in-flight runs drain.
  - Add a `GET /one-shot/eligibility` endpoint for the UI.

### 2. Persistence

- [x] **Table `one_shot_runs`**, with tenant columns and these fields:
  - `focus_prompt`, `audience`, `target_duration_seconds`
  - `accepted_estimate_usd`, `actual_cost_usd`
  - `status`, `current_step`, `steps` (jsonb, each `{ step, state, jobId?, startedAt, finishedAt?, detail? }`)
  - `needs_attention_stage`, `error_code`
  - `correlation_id` and timestamps
- [x] **Statuses:** `queued | running | awaiting_render_approval | rendering | completed | needs_attention | failed | cancelled`.
- [x] **One active run per project,** enforced by a unique partial index.

### 3. Runner

- [x] **Queue.** Add an `orchestration` queue (`packages/jobs/src/contracts.ts:11`) with job
  type `oneshot.advance` and payload `{ runId, schemaVersion: 1 }`. It is consumed inside the
  API process through `registerJobConsumer` (`packages/jobs/src/worker.ts:262`), and enqueued
  through the existing outbox.
- [x] **Tick behaviour.** Each tick:
  1. Loads the run and the real artifact state.
  2. Performs at most one action from the stage map.
  3. Persists the step.
  4. Re-enqueues itself with a delay of about 3 seconds, until the run is terminal or waiting.
  5. Never holds a transaction across an enqueue or a provider call.
- [x] **Service calls.**
  - Each call uses the run owner's `ownerUserId`, the run's correlation id, and a
    deterministic idempotency key `oneshot:<runId>:<step>`.
  - Add the `selectionReason` literal `"one_shot_run"`, carrying the `runId`, beside
    `"explicit_job_request"` (`packages/schemas/src/index.ts:3986`).
  - Paid jobs carry this literal, so provider approval is traceable to the run's single
    authorisation.
- [x] **Audit.** Each automatic approval writes an `audit_log` entry with actor
  `one_shot_run` and the `runId`.
- [x] **Manual edits.** If the user changes an artifact in the wizard mid-run, the next tick
  sees the revision and continues from the real state. If a downstream artifact became stale,
  it regenerates it.
- [x] **Failures.**
  - A failed or dead-lettered stage job, or an ingestion quality failure, sets
    `needs_attention` with the stage.
  - A step with no progress for 20 minutes sets `failed` with `ONE_SHOT_STEP_TIMEOUT`, and
    the run can be resumed.
  - Ticks for cancelled runs are no-ops.
- [x] **Cost.** Accumulate `actual_cost_usd` from the usage records by correlation id.
- [x] **Quota.** Add `MAX_ONE_SHOT_RUNS_PER_HOUR` per user. Model calls also still count
  against `PostgresGenerationQuotaGuard`.

### 4. Endpoints (NestJS, `apps/api/src/app.ts`, the `projects` controller)

- [x] `POST /projects/:projectId/one-shot/estimate`: returns an itemised estimate for the
  full chain, built from the model-call estimates (`model-call-approval.ts`) plus typical
  per-scene illustration and TTS costs.
- [x] `POST /projects/:projectId/one-shot`:
  - Requires an idempotency key.
  - The body is `{ focusPrompt, audience, targetDurationSeconds, acceptedEstimateUsd }`.
  - This is the single explicit authorisation for paid work.
  - It rejects the request if the accepted estimate is below the current estimate.
- [x] `GET /projects/:projectId/one-shot`: returns run status, steps, `focusCoverage`,
  `needs_attention` details and cost so far.
- [x] `POST /projects/:projectId/one-shot/render`: the human gate.
  - It is allowed only in `awaiting_render_approval`.
  - It saves the lesson version (`LessonVersionsService`), then calls `RenderService.start`
    (the pattern is `demonstration-pilot.ts:1497`).
  - It tracks the render to `completed` or `failed`.
- [x] `POST /projects/:projectId/one-shot/resume` (from `needs_attention` or `failed`) and
  `POST /projects/:projectId/one-shot/cancel`.

## Technical Implementation Requirements

- The runner is a client of the existing services and must not bypass any of their checks:
  - snapshot staleness
  - `expectedRevision`
  - grounding
  - validation
  - lesson-version requirements (`lesson-versions.ts:891-1009`)
  - render validation (`renders.ts:260-356`)
- Nothing publishes or renders without `POST one-shot/render`.
- Tenant isolation holds in every query, job and signed URL.
- Never log the focus prompt, source text, tokens or signed URLs.

## Contracts and Persistence

- Schemas:
  - the `oneShotRun` DTOs
  - the `oneshot.advance` payload
  - the `selectionReason: "one_shot_run"` literal
  - the `orchestration` queue name
- Migration: the `one_shot_runs` table, its unique partial index, and the audit actor value.
- Config: `ONE_SHOT_PILOT_ENABLED`, `ONE_SHOT_PILOT_USER_IDS` and `MAX_ONE_SHOT_RUNS_PER_HOUR`.

## Interfaces

- The endpoints in scope section 4, plus `GET /one-shot/eligibility`.
- Job: `oneshot.advance` on the `orchestration` queue.

## Acceptance Criteria

- [x] With the mock provider, a run from an uploaded PDF and a focus reaches
  `awaiting_render_approval` with no other API calls. `POST one-shot/render` produces a
  completed render.
- [x] `not_covered` stops the run after objectives. No storyboard, illustration, TTS or render
  job is ever created.
- [x] A blocking validation issue sets `needs_attention` at `preview`. After the user fixes it
  in the wizard, `resume` continues the same run.
- [x] Replaying `POST one-shot` with the same idempotency key returns the same run. A
  concurrent second run on the same project is rejected.
- [x] Every automatic approval has an audit entry with the `runId`. Every paid job has a usage
  record and the `one_shot_run` selection reason.
- [x] Restarting the API mid-run resumes from persisted state without duplicating any job.
- [x] Users outside the cohort get 409 on writes and `visible: false` on reads. With the flag
  off, new runs are rejected and in-flight runs finish.
- [x] Cross-tenant project ids are rejected on every endpoint.
- [x] The normal wizard is unaffected.

## Required Tests

- [x] **Unit:** the runner state machine against fake services:
  - every step, including skip-if-done
  - every stop condition
  - timeout
  - cancel and resume
  - detection of a manual edit mid-run
- [x] **Integration** (real Postgres, mock provider):
  - the full chain to `awaiting_render_approval`
  - the `not_covered` stop
  - restart and resume
  - idempotent replay
- [x] **Authorization, failure and concurrency:**
  - cohort gating and flag drain
  - cross-tenant access
  - concurrent run rejection
  - a failed stage job
  - a render attempted before `awaiting_render_approval`

## Out of Scope

- UI (ST-106).
- The brief, budget ledger, self-repair and decision log (ST-107).
- Automatic style-pack and sound-bed selection (ST-107).
- Autonomous rendering.
- Web research.
- Multiple documents.

## Definition of Done

- [x] All acceptance criteria pass.
- [x] Required tests pass.
- [x] Lint, typecheck, test and build commands pass for the affected workspaces. Run
  `pnpm turbo build --filter='./packages/*'` before app tests.
- [x] Documentation (including `.env.example`) and migrations are complete.
- [x] No unresolved security, tenant-isolation, idempotency or data-loss issue remains.
- [x] Dev Agent Record is completed.
- [x] Story status and index are updated to Done (approved by the product owner, 2026-09-27).

## Dev Agent Record

- **Agent:** Claude Code (Opus 5.5)
- **Started:** 2026-09-27
- **Completed:** 2026-09-27
- **Branch/PR:** `feat/st-105-one-shot-orchestration` (not pushed; no PR)
- **Files changed:**
  - New:
    - `packages/schemas/src/one-shot.ts` (subpath `@avlp/schemas/one-shot`)
    - `apps/api/src/one-shot-runner.ts` (the state machine)
    - `apps/api/src/one-shot.ts` (cohort, estimate, service, tick host, job handler)
    - `apps/api/src/one-shot-gateway.ts` (adapter onto the wizard services)
    - `apps/api/src/one-shot-test-pipeline.ts` (test support)
    - Tests: `one-shot-runner.test.ts`, `one-shot-gateway.test.ts`, `one-shot.test.ts`, `one-shot.integration.test.ts`
    - `docs/prompt-to-video-pilot.md`
    - `packages/database/drizzle/0069_one_shot_runs.{sql,compatibility.md}`
  - Contracts:
    - `packages/schemas/src/index.ts`: `modelCallProviderApprovalSchema` and `providerSelectionReasonSchema`; `oneShotRunId` on the illustration and TTS job payloads.
    - `packages/schemas/package.json`: the subpath export.
    - `packages/jobs`: the `orchestration` queue name only.
    - `packages/observability`: the `one_shot_run` audit actor.
    - `packages/provider-adapters`: the `one_shot_run` selection reason and `providerSelectionReason()`.
    - `packages/config`: three environment variables.
    - `packages/database`: the table, enums and journal.
  - API:
    - `app.ts`: `OneShotController`, and a closed default when the runner is not wired.
    - `runtime.ts`: shared service instances, the gateway, and the `orchestration` consumer.
    - `oneShotRunId` threaded through:
      - `objectives`, `outline`, `narration` and `storyboard` (generate);
      - `grounding` (check);
      - `lesson-intent` (infer);
      - `scene-audio` (generate and generateAll);
      - `illustration-generation` (`generateMissing` also takes a deterministic `requestKey`);
      - `model-call-approval.ts`.
  - Worker: `model-call.ts`, `illustration-generation-job.ts` and `scene-audio-job.ts` stamp the selection reason and run onto usage records.
  - Review follow-up tests:
    - `apps/api/src/model-call-approval.test.ts` (new);
    - cases added to `illustration-generation.test.ts` and `focus-intent.integration.test.ts`;
    - `packages/schemas/src/model-call.test.ts`;
    - `packages/provider-adapters/src/job-envelope.test.ts`;
    - worker `model-call.test.ts`, `illustration-generation-job.test.ts` and `scene-audio-job.test.ts`.
  - `.env.example`.
- **Migrations:** `0069_one_shot_runs`. It is additive:
  - the `one_shot_runs` table, with `one_shot_runs_request_unique` and the partial unique index `one_shot_runs_one_active_per_project`;
  - the enum `one_shot_run_status`;
  - `audit_actor_type += one_shot_run`;
  - five `one_shot.*` audit event types.

  The compatibility note is `0069_one_shot_runs.compatibility.md`. The migration was applied to the dev database.
- **Commands/tests:**
  - `pnpm turbo build --filter='./packages/*'`: 12/12.
  - `pnpm turbo lint typecheck build` for the API, worker and six packages: 36/36.
  - `pnpm turbo typecheck` repo-wide: 16/16.
  - `apps/api` vitest with `TEST_DATABASE_URL`, after the review fixes: 69 files, 662 of 663 passing.
    - The one failure is `correlation.integration.test.ts`, which is timing-flaky here. With identical code it gave pass, fail, fail, fail in back-to-back runs.
    - That test does not touch this story's code: it dispatches with the Node clock rows whose `availableAt` defaults to the Postgres container's `now()`, and `PostgresJobRepository` is unchanged from HEAD. It passed in the earlier full run of 651.
    - New: runner unit tests (12), gateway mapping (6), routes, cohort and estimate (7), Postgres integration (12, stable across 3 repeat runs, including the atomic-enqueue rollback case).
  - After the review fixes: schemas 384, provider-adapters 81, observability 10 and jobs 27 pass. The worker passes 280/287, and the same 7 pre-existing failures remain.
  - Package suites: schemas 383, jobs 27, observability 10, provider-adapters 79 and config 15 pass. Database passes 11/11 with `--testTimeout=120000`; its 5 s migration-lifecycle timeout fails identically without this change.
  - `apps/pipeline-worker`: 277/284 pass. The 7 failures are in `document-ingestion-job.integration` (ingestion storage unavailable) and `duration-reconciliation.integration` (33 vs 34 s). They are pre-existing: I stashed every change including untracked files, rebuilt, and saw the same 7 failures at `afd4734`.
- **Screenshots/output:** a live run against the booted stack, driven by `.runtime-logs/st105-drive.mjs` (untracked) using only public API routes.
  - **Stack:** API, pipeline worker, renderer and Docling; mock provider (`TOGETHER_API_KEY` blanked); flag on; the user in the cohort.
  - **Setup:** the user registered, created a project and uploaded a PDF.
  - **Before the run:**
    - The estimate came back at $6.53274, with 9 items.
    - `POST one-shot` returned `queued`; replaying the same key returned the same run ID.
    - A second key was rejected (409), and an early render was rejected (409).
  - **The run:**
    - Steps advanced in order: ingestion → source_snapshot → configuration → objectives → … → validation.
    - The run reached `awaiting_render_approval` in about 90 s with every step `done`, and no other API call was made.
    - Focus coverage was `partial` (advisory).
  - **The render:** `POST one-shot/render` saved lesson version `01a0e365-ee5b…` and started render `01a0e365-efe4…`. The run tracked its progress (0 → 0.432 → 1) and reached `completed` at 15:10:25Z. Metered cost was $0.05775 (mock pricing).
  - **Database evidence:**
    - Every usage record (objectives, outline, narration, storyboard, grounding ×2, TTS ×4, lesson intent) has `providerSelection.selectionReason = one_shot_run` and `oneShotRunId`.
    - The audit rows are:
      - `one_shot.stage_approved` with `actor_type = one_shot_run` and `oneShotRunId`, for source_snapshot, objectives, outline and narration;
      - `run_started` and `render_approved` as the user.
    - The run used 40 `oneshot.advance` jobs in total, all succeeded with no duplicate key.
  - **Third live run,** after the second review's fixes, on a fresh project: the run reached `awaiting_render_approval`, then render `completed` ($0.05775, mock pricing). On that project:
    - `source.review_approved`, `objectives.approved`, `outline.approved`, `narration.approved`, `lesson.configuration_saved`, `voice.configuration_saved`, `ai.generated` ×7 and `audio.generation_requested` ×4 all have `actor_type = one_shot_run` and `oneShotRunId`.
    - No approval is attributed to the user. The user-attributed rows are the user's own actions: project created, document validation requested, run started, render approved and render initiated.
  - **After those fixes:** the API vitest suite passes 665/667, and lint, typecheck and build pass 42/42. The two failures are timing flakes in files this story does not touch:
    - `correlation.integration.test.ts`, explained above;
    - `source-uploads.test.ts`, which failed once under `--maxWorkers=3` and then passed 10/10 three times on its own.
  - **Second live run,** after the transactional-scheduling fix, on the same project: a new run with idempotent replay, the concurrent run and early render both 409, `awaiting_render_approval` with every step done, then render `completed`. Cost was $0 because every artifact was already current (skip-if-done) and the content-addressed render was reused.
- **Decisions/assumptions:**
  - **Pure state machine.** The runner is a state machine over a narrow `OneShotStageGateway` port. The production gateway calls the same service instances the wizard routes use, so no check is bypassed and the logic is unit-testable.
  - **Tick chain.** Each tick claims a lease on the run row (`tick_lease_expires_at` and `tick_job_id`), acts, then saves with a guard on `tick_sequence` and status. The next tick (key `oneshot:<runId>:tick:<seq>`, with a delayed outbox `availableAt`) is inserted into `jobs` and `outbox_events` in the same transaction as that save.
  - **Atomic enqueue (review finding 1).** Start, resume and render approval also commit their run change, audit event and tick job in one transaction, so a run can never be left in a ticking status without the job that advances it. The scheduler writes the job and outbox rows directly, the same pattern the stage services use.
    - The same job retried after a crash reclaims its own lease; a stray job no-ops (`lease_held`).
    - A cancel or render approval made during a tick wins the save.
  - **Request keys.** Keys are `oneshot:<runId>:<step>:r<resumeCount>`. Resume clears the stopped step's job, so the explicit retry runs the stage again under the next resume key instead of re-stopping on the old failure.
  - **Active runs.** A run counts as active in `queued`, `running`, `awaiting_render_approval`, `rendering`, `needs_attention` and `failed`. Failed and stopped runs are resumable, so the user must cancel one to start another.
  - **Flag scope.** The flag gates `estimate` and `create` only. Render, resume and cancel of an existing run require cohort membership but still work with the flag off, which is the drain. The consumer is always registered.
  - **Illustrations** are requested once per storyboard ID; accepting a candidate changes the scene revision, so re-requesting would pay again. Only selectable candidates (the ST-059 gate) in required decorative slots are accepted, and guarded slots are left for validation.
  - **Transient errors** are retried next tick and bounded by the 20-minute step timeout: `edit_conflict`, `rate_limited` and 5xx. Any other `PublicError` from a service stops the run with `STAGE_BLOCKED` and the service's message.
  - **Estimate.** Six model calls at the bounded $1.08 per call, one illustration per 30 s, TTS at the top of the word budget, and caption alignment. The pricing version is `one-shot-estimate-v1`.
  - **Defaults.** The runner uses `includeRecallQuestions: false` unless a configuration already exists. Tone comes from `audience.tone`, which defaults to `friendly`.
  - **Audit attribution (second review, finding 1).** `apps/api/src/audit-actor.ts` adds `requestActor`, and the runner's service calls pass `oneShotRunId`. As a result, the services' own audit events for work a run does are attributed to `one_shot_run`, with the owner as actor user and `oneShotRunId` in the metadata:
    - `source.review_approved`, `objectives.approved`, `outline.approved` and `narration.approved`;
    - illustration acceptance;
    - `ai.generated`;
    - configuration and voice saves;
    - audio requests.

    The wizard never passes a run, so its events are unchanged. This required an optional `oneShotRunId` on source-snapshot `approve`, objectives, outline and narration `approve`, storyboard `acceptIllustrationCandidate`, lesson-configuration `save` and voice-configuration `save`.
  - **Source precondition (second review, finding 2).** `POST one-shot` returns 409 unless the project has a source document that is `pending_validation`, `validating` or `active`.
  - **Cancel during a render (second review, finding 3).** The render keeps running, because the render service has no cancel operation. This is documented in `docs/prompt-to-video-pilot.md`.
- **Deviations:**
  - The ADR is `ADR-013`, not ADR-012 (numbering, recorded by ST-104).
  - The audit table is `audit_events`; the story says `audit_log`.
  - The audience body is `{ ageBand, difficulty, tone? }`; the story names the field but not its shape.
  - Beyond the stage map, `POST one-shot/estimate` takes `{ targetDurationSeconds }`, and `GET one-shot/eligibility` was added as the story asks.
  - The Postgres integration test drives real outbox, job and lease machinery with a simulated pipeline behind the gateway. The full chain against the real services, with the mock provider and a real render, is shown by the live run above rather than inside vitest.
- **Known risks/follow-up:**
  - Duration reconciliation after TTS bumps the lesson-spec revision, so the runner re-runs the grounding check once for the new revision. That is one extra bounded model call, visible as grounding ×2 in the live run.
  - Tick jobs appear in project job history: about 40 for a 3-minute lesson.
  - If the process crashes after the intent call but before the configuration is saved, `LessonIntentService` refuses to reuse the key (`edit_conflict`). The gateway turns that refusal into a stop with `STAGE_BLOCKED` at configuration, and resume retries it with a new key (one extra paid intent call).
  - The pipeline-worker integration failures above predate this story and are not addressed here.
