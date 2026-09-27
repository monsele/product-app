# The prompt-to-video pilot (runner and API)

Status: invite-only pilot. Delivered by ST-105 on the decisions in
[ADR-013](adr/ADR-013-prompt-to-video-pilot.md). The screens come in ST-106.

## What it does

A pilot user uploads a PDF, describes what the lesson should focus on, chooses
the audience and length, accepts a cost estimate, and makes **one** request.
The server then drives every existing stage of the normal wizard on the user's
behalf. It stops in one of two places:

- `awaiting_render_approval`: the lesson is previewable and validated. Nothing
  has been versioned for render or rendered. `POST one-shot/render` is the single
  human gate.
- `needs_attention`: a stage needs the user. The run names the stage, an error
  code and a message. After a fix in the wizard, `resume` continues the same run.

## Turning it on

API environment variables, all closed by default:

| Variable | Meaning |
| --- | --- |
| `ONE_SHOT_PILOT_ENABLED` | `true` accepts new runs (estimate and start). `false` rejects them. Runs already in flight keep ticking to their stop, so switching off drains the pilot rather than stranding runs. |
| `ONE_SHOT_PILOT_USER_IDS` | Comma-separated user IDs in the cohort. Everyone else reads `visible: false` and gets 409 on every write. |
| `MAX_ONE_SHOT_RUNS_PER_HOUR` | Runs one user may start per rolling hour (default 3). Every model call in a run still counts against its own generation quota. |

## Endpoints

All live under `/projects/:projectId`, behind the same project authorizer as
the wizard, so a cross-tenant project ID is rejected before the handler runs.

| Route | Purpose |
| --- | --- |
| `GET one-shot/eligibility` | `{ visible, canStart, reasons }` for the signed-in user. |
| `POST one-shot/estimate` | `{ targetDurationSeconds }` → an itemised upper-bound estimate: six bounded model calls (lesson intent, objectives, outline, narration, storyboard, grounding), one illustration per 30 s of lesson, narration audio at the top of the word budget, and caption alignment. |
| `POST one-shot` | Requires `Idempotency-Key`, and a source document on the project that is active or still validating (409 otherwise). Body `{ focusPrompt, audience: { ageBand, difficulty, tone? }, targetDurationSeconds, acceptedEstimateUsd }`. The single authorisation for every paid call in the run. Rejected with 409 when the accepted estimate is below the current one. Replaying the key returns the same run. |
| `GET one-shot` | The latest run: status, steps, focus coverage, needs-attention details, and cost so far. |
| `POST one-shot/render` | Only in `awaiting_render_approval`. Saves a lesson version, starts the render, then tracks it to `completed` or `failed`. |
| `POST one-shot/resume` | From `needs_attention` or `failed`. |
| `POST one-shot/cancel` | Any active run. Its remaining ticks become no-ops. Cancelling while `rendering` stops tracking the render but does not stop it: the render service has no cancel operation, so the video still finishes and appears in the project's render history. |

One run per project may be active: `queued`, `running`,
`awaiting_render_approval`, `rendering`, `needs_attention` or `failed`. A
failed run stays active because it can be resumed; cancel it to start another.

## How the runner works

The runner is ordinary job code, with no agent framework (ADR-013 §5).

- **Hosting.** It is an `orchestration`-queue consumer registered in the API
  process. The pipeline worker's outbox dispatcher and stale-lease reaper
  already cover every queue, so the API only consumes.
- **Ticks.** Each `oneshot.advance` job is one tick. A tick:
  1. claims the run's tick lease;
  2. re-reads the real artifact state from the first stage;
  3. performs at most one action;
  4. saves the run with no transaction held across any service or provider
     call;
  5. enqueues the next tick about 3 s later, with the key
     `oneshot:<runId>:tick:<sequence>`.
- **Restart safety.** If the API dies mid-tick, the reaper requeues the same job,
  and that job reclaims its own lease. Every stage call uses a deterministic
  request key, `oneshot:<runId>:<step>:r<resumeCount>`, so a replayed tick
  reuses the jobs it already queued instead of paying again.
- **Manual edits.** Real state is re-read every tick. When the user edits
  something in the wizard mid-run, the runner continues from that state, and
  regenerates anything the edit made stale.
- **No bypass.** The runner calls the same service instances as the wizard, so
  every check still applies:
  - source snapshot staleness;
  - `expectedRevision`;
  - grounding;
  - deterministic validation;
  - lesson-version readiness;
  - render validation.

  A service refusal stops the run at that stage. The runner never acknowledges
  a validation warning; warnings are only counted in the step detail.

### Stage map

| Step | Action | Stops the run when |
| --- | --- | --- |
| `ingestion` | Waits for the existing ingestion chain. | Parsing, document validation or quality fails (`INGESTION_FAILED`). |
| `source_snapshot` | Approves the source review. | The service refuses (`STAGE_BLOCKED`). |
| `configuration` | Infers subject and title (`ai.lesson-intent`), saves the configuration with the focus and audience, and saves the `english-aria` voice. | Refused. |
| `objectives` | Generates, then approves with `expectedRevision`. | Coverage is `not_covered` (`FOCUS_NOT_COVERED`), or the job it queued fails. |
| `outline`, `narration` | Generates, then approves. | The draft cannot be approved, or the job it queued fails. |
| `storyboard` | Generates. | The job it queued fails. |
| `illustrations` | Requests missing illustrations once per storyboard. Accepts selectable candidates in required decorative slots only. Grounding-critical slots are never filled; they are left for validation to report. | Refused. |
| `grounding` | Checks the current storyboard revision. | The job it queued fails. |
| `audio` | Generates every scene. | A scene's audio fails. |
| `validation` | Runs validation. | Any error (`VALIDATION_BLOCKING`, stage `preview`). |

A step with no progress for 20 minutes fails the run with
`ONE_SHOT_STEP_TIMEOUT`. The run can then be resumed.

### Authorisation, metering and audit

- **Paid jobs.** Every paid job a run queues carries `selectionReason:
  "one_shot_run"` and the run's ID:
  - model calls: in `providerApproval`;
  - image and TTS jobs: in the job payload.

  The usage record's `providerSelection` repeats both, so any spend traces back
  to the run's single authorisation.
- **Actual cost.** `actualCostUsd` sums the usage records that carry the run's
  correlation ID.
- **Audit.** Each automatic approval writes `one_shot.stage_approved` with
  actor `one_shot_run`. That covers the source snapshot, objectives, outline,
  narration and each accepted illustration. The actor user is the owner, and
  the metadata carries `oneShotRunId`.
- **No false teacher approvals.** The services' own audit events for work a
  run does are attributed to the run too: `source.review_approved`,
  `objectives.approved`, `outline.approved`, `narration.approved`, illustration
  acceptance, `ai.generated`, configuration and voice saves, and audio
  requests. The runner passes `oneShotRunId`, and `requestActor` turns it into
  the `one_shot_run` actor. A query for teacher approvals therefore never
  counts an automatic one. The wizard never passes a run, so its events are
  unchanged.
- **Human actions.** Starting, render approval, resuming and cancelling are
  audited as the user; they are the user's actions.
- **Not logged.** The focus prompt is never logged or placed in audit metadata.

## Where the pieces live

| Concern | Location |
| --- | --- |
| Contracts | `packages/schemas/src/one-shot.ts` (`@avlp/schemas/one-shot`); `modelCallProviderApprovalSchema` in `packages/schemas/src/index.ts` |
| Table and migration | `one_shot_runs` in `packages/database/src/schema.ts`, `drizzle/0069_one_shot_runs.sql` |
| State machine | `apps/api/src/one-shot-runner.ts` |
| Service, cohort, estimate, tick host | `apps/api/src/one-shot.ts` |
| Adapter onto the wizard services | `apps/api/src/one-shot-gateway.ts` |
| Routes | `OneShotController` in `apps/api/src/app.ts` |
| Consumer registration | `apps/api/src/runtime.ts` |

## Known limitations

- **Mock coverage.** The mock provider judges focus coverage by keyword
  overlap (ADR-013). Only the real model judges meaning.
- **Fixed style.** Automatic style-pack and sound-bed selection, the video
  brief, the budget ledger and self-repair are ST-107.
- **Estimate versus spend.** The estimate is an upper bound that uses planning
  assumptions: one scene per 30 s and six characters per word. Actual spend is
  metered from provider responses.
