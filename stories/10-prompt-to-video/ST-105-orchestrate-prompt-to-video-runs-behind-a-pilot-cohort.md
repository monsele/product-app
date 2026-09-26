---
story_id: ST-105
title: "Orchestrate Prompt-to-Video Runs Server-Side behind a Pilot Cohort"
phase: "10 — Prompt to Video"
status: Ready
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

- [ ] Add `ONE_SHOT_PILOT_ENABLED` and `ONE_SHOT_PILOT_USER_IDS` in `packages/config`,
  copying `:507-521`. Both default closed. Document them in `.env.example`.
- [ ] Add a `OneShotPilotCohort` interface, copied from `demonstration-pilot.ts:152-182`.
  - Every read returns eligibility, with `visible: false` for users outside the cohort.
  - Every write fails with 409 (`assertCohort` semantics).
  - The flag gates the API commands only, so when it is off, in-flight runs drain.
  - Add a `GET /one-shot/eligibility` endpoint for the UI.

### 2. Persistence

- [ ] **Table `one_shot_runs`**, with tenant columns and these fields:
  - `focus_prompt`, `audience`, `target_duration_seconds`
  - `accepted_estimate_usd`, `actual_cost_usd`
  - `status`, `current_step`, `steps` (jsonb, each `{ step, state, jobId?, startedAt, finishedAt?, detail? }`)
  - `needs_attention_stage`, `error_code`
  - `correlation_id` and timestamps
- [ ] **Statuses:** `queued | running | awaiting_render_approval | rendering | completed | needs_attention | failed | cancelled`.
- [ ] **One active run per project,** enforced by a unique partial index.

### 3. Runner

- [ ] **Queue.** Add an `orchestration` queue (`packages/jobs/src/contracts.ts:11`) with job
  type `oneshot.advance` and payload `{ runId, schemaVersion: 1 }`. It is consumed inside the
  API process through `registerJobConsumer` (`packages/jobs/src/worker.ts:262`), and enqueued
  through the existing outbox.
- [ ] **Tick behaviour.** Each tick:
  1. Loads the run and the real artifact state.
  2. Performs at most one action from the stage map.
  3. Persists the step.
  4. Re-enqueues itself with a delay of about 3 seconds, until the run is terminal or waiting.
  5. Never holds a transaction across an enqueue or a provider call.
- [ ] **Service calls.**
  - Each call uses the run owner's `ownerUserId`, the run's correlation id, and a
    deterministic idempotency key `oneshot:<runId>:<step>`.
  - Add the `selectionReason` literal `"one_shot_run"`, carrying the `runId`, beside
    `"explicit_job_request"` (`packages/schemas/src/index.ts:3986`).
  - Paid jobs carry this literal, so provider approval is traceable to the run's single
    authorisation.
- [ ] **Audit.** Each automatic approval writes an `audit_log` entry with actor
  `one_shot_run` and the `runId`.
- [ ] **Manual edits.** If the user changes an artifact in the wizard mid-run, the next tick
  sees the revision and continues from the real state. If a downstream artifact became stale,
  it regenerates it.
- [ ] **Failures.**
  - A failed or dead-lettered stage job, or an ingestion quality failure, sets
    `needs_attention` with the stage.
  - A step with no progress for 20 minutes sets `failed` with `ONE_SHOT_STEP_TIMEOUT`, and
    the run can be resumed.
  - Ticks for cancelled runs are no-ops.
- [ ] **Cost.** Accumulate `actual_cost_usd` from the usage records by correlation id.
- [ ] **Quota.** Add `MAX_ONE_SHOT_RUNS_PER_HOUR` per user. Model calls also still count
  against `PostgresGenerationQuotaGuard`.

### 4. Endpoints (NestJS, `apps/api/src/app.ts`, the `projects` controller)

- [ ] `POST /projects/:projectId/one-shot/estimate`: returns an itemised estimate for the
  full chain, built from the model-call estimates (`model-call-approval.ts`) plus typical
  per-scene illustration and TTS costs.
- [ ] `POST /projects/:projectId/one-shot`:
  - Requires an idempotency key.
  - The body is `{ focusPrompt, audience, targetDurationSeconds, acceptedEstimateUsd }`.
  - This is the single explicit authorisation for paid work.
  - It rejects the request if the accepted estimate is below the current estimate.
- [ ] `GET /projects/:projectId/one-shot`: returns run status, steps, `focusCoverage`,
  `needs_attention` details and cost so far.
- [ ] `POST /projects/:projectId/one-shot/render`: the human gate.
  - It is allowed only in `awaiting_render_approval`.
  - It saves the lesson version (`LessonVersionsService`), then calls `RenderService.start`
    (the pattern is `demonstration-pilot.ts:1497`).
  - It tracks the render to `completed` or `failed`.
- [ ] `POST /projects/:projectId/one-shot/resume` (from `needs_attention` or `failed`) and
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

- [ ] With the mock provider, a run from an uploaded PDF and a focus reaches
  `awaiting_render_approval` with no other API calls. `POST one-shot/render` produces a
  completed render.
- [ ] `not_covered` stops the run after objectives. No storyboard, illustration, TTS or render
  job is ever created.
- [ ] A blocking validation issue sets `needs_attention` at `preview`. After the user fixes it
  in the wizard, `resume` continues the same run.
- [ ] Replaying `POST one-shot` with the same idempotency key returns the same run. A
  concurrent second run on the same project is rejected.
- [ ] Every automatic approval has an audit entry with the `runId`. Every paid job has a usage
  record and the `one_shot_run` selection reason.
- [ ] Restarting the API mid-run resumes from persisted state without duplicating any job.
- [ ] Users outside the cohort get 409 on writes and `visible: false` on reads. With the flag
  off, new runs are rejected and in-flight runs finish.
- [ ] Cross-tenant project ids are rejected on every endpoint.
- [ ] The normal wizard is unaffected.

## Required Tests

- [ ] **Unit:** the runner state machine against fake services:
  - every step, including skip-if-done
  - every stop condition
  - timeout
  - cancel and resume
  - detection of a manual edit mid-run
- [ ] **Integration** (real Postgres, mock provider):
  - the full chain to `awaiting_render_approval`
  - the `not_covered` stop
  - restart and resume
  - idempotent replay
- [ ] **Authorization, failure and concurrency:**
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

- [ ] All acceptance criteria pass.
- [ ] Required tests pass.
- [ ] Lint, typecheck, test and build commands pass for the affected workspaces. Run
  `pnpm turbo build --filter='./packages/*'` before app tests.
- [ ] Documentation (including `.env.example`) and migrations are complete.
- [ ] No unresolved security, tenant-isolation, idempotency or data-loss issue remains.
- [ ] Dev Agent Record is completed.
- [ ] Story status and index are updated to Done.

## Dev Agent Record

- **Agent:**
- **Started:**
- **Completed:**
- **Branch/PR:**
- **Files changed:**
- **Migrations:**
- **Commands/tests:**
- **Screenshots/output:**
- **Decisions/assumptions:**
- **Deviations:**
- **Known risks/follow-up:**
