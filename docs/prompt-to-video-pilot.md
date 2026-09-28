# The prompt-to-video pilot (runner and API)

Status: invite-only pilot. Delivered by ST-105 on the decisions in
[ADR-013](adr/ADR-013-prompt-to-video-pilot.md). The screens are ST-106. The
video brief, the run budget ledger, bounded self-repair and the decision log
are ST-107 (ADR-013 §7).

## What it does

A pilot user does four things:

1. Uploads a PDF.
2. Describes what the lesson should focus on, and chooses the audience and
   length.
3. Prepares a **video brief**. The brief shows what the video will cover (with
   the source sections behind each point), what it leaves out, the style and
   sound, and an itemised cost.
4. Confirms the brief. That is the **one** authorisation for everything paid
   after it.

The server then drives every existing stage of the normal wizard on the user's
behalf, within the confirmed budget. It stops in one of two places:

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
| `MAX_ONE_SHOT_RUNS_PER_HOUR` | Runs one user may start per rolling hour (default 3). A run starts with its first brief. Every model call in a run still counts against its own generation quota. |
| `ONE_SHOT_BUDGET_TOLERANCE` | ST-107. The cap is the confirmed estimate times this (default 1.25). |
| `ONE_SHOT_MAX_BRIEF_REVISIONS` | ST-107. The most brief calls per run, the first included (default 3). Each call counts before it is made, so a failed call still uses one. |

## Endpoints

All live under `/projects/:projectId`, behind the same project authorizer as
the wizard, so a cross-tenant project ID is rejected before the handler runs.

| Route | Purpose |
| --- | --- |
| `GET one-shot/eligibility` | `{ visible, canStart, reasons }` for the signed-in user. |
| `POST one-shot/brief` | ST-107. Requires `Idempotency-Key`, and a source document on the project (409 otherwise). Body `{ focusPrompt, audience: { ageBand, difficulty, tone? }, targetDurationSeconds }`. The first call creates the run in `brief_pending`. Each later call revises the brief, until the run has used `ONE_SHOT_MAX_BRIEF_REVISIONS` calls (then 409). A call makes one metered `ai.one-shot-brief` model call and returns `{ brief, revisionsUsed, maxRevisions, stylePackIds }`, with the run in `brief_ready`. The call answers 409 while the document is still being read. Replaying the key returns the brief it prepared. |
| `GET one-shot/brief` | ST-107. The latest brief revision of the project's run. Returns 404 outside the cohort. |
| `POST one-shot` | ST-107. Body `{ briefRevision, acceptedEstimateUsd, stylePackId?, soundBed? }`. Confirms the latest revision of a `brief_ready` run. The style pack and sound bed default to the brief's; either can be changed from the closed lists. This is the single authorisation for every paid call after the brief. It reserves the accepted estimate and sets the cap. It is rejected with 409 for a stale revision or an accepted estimate below the brief's. It is a conditional status change, so two racing confirmations produce one run, and a replay returns it. |
| `POST one-shot/budget/accept` | ST-107. Body `{ reservationRevision, acceptedEstimateUsd }`. Only for a run stopped with `ONE_SHOT_BUDGET_CAP`. The accepted estimate must be at least the proposed one. Accepting creates a new reservation revision and continues the run. |
| `GET one-shot/decisions` | ST-107. The latest run's decision log, ledger and budget. |
| `GET one-shot` | The latest run: status, steps, focus coverage, needs-attention details, and cost so far. |
| `POST one-shot/render` | Only in `awaiting_render_approval`. Saves a lesson version, starts the render, then tracks it to `completed` or `failed`. |
| `POST one-shot/resume` | From `needs_attention` or `failed`. |
| `POST one-shot/cancel` | Any active run. Its remaining ticks become no-ops. Cancelling while `rendering` stops tracking the render but does not stop it: the render service has no cancel operation, so the video still finishes and appears in the project's render history. |

One run per project may be active: `brief_pending`, `brief_ready`, `queued`,
`running`, `awaiting_render_approval`, `rendering`, `needs_attention` or
`failed`. A failed run stays active because it can be resumed. Cancel it to
start another.

## The screens (ST-106)

| Where | What |
| --- | --- |
| `/workspace` | The create form offers **Quick video from a PDF** next to the step-by-step editor, only when `one-shot/eligibility` reports `visible`. Eligibility is read through the user's most recent project, so a user with no project yet does not see the option until they have one. |
| `/workspace/<projectId>/one-shot` | One page for the whole run. The view follows the server's run status, so a reload lands on the right step. Outside the cohort it shows an unavailable state. |
| Wizard header | Projects with a run show a **Prompt-to-video run** link back to the run page. |

The run page moves through these views:

1. **Request.** The existing upload panel, a focus prompt (1,000 characters with a counter), the audience (*Myself*, *Students* with an age band, or *Professional*), the length (3, 5 or 7 minutes), and **Prepare brief** (ST-107). No cost is shown here, because the estimate comes from the brief.
2. **Brief (ST-107).** The brief view shows:
   - the coverage points, each with source-section chips;
   - what the video will leave out;
   - the style pack and background sound, each changeable from the closed list and shown with its reason;
   - the itemised estimate;
   - **Confirm & create video**;
   - **Edit request**, which prefills the form. The revision counter shows how many brief calls are left.
3. **Progress.** Seven steps (Reading document → Planning → Outline → Narration → Visuals → Audio → Checks), the cost so far, the approved estimate and the cap, and **Cancel** with confirmation. Polling starts at 2 s and backs off to 15 s while nothing changes. A live region announces the current step.
4. **Budget reached (ST-107).** The stop message and the proposed new estimate, with **Accept $X and continue**.
5. **Needs attention.** The reason, a link to the wizard stage that fixes it, and **Resume**. `not_covered` instead shows the coverage reason and **Edit prompt**, which closes the run and prefills a new request.
6. **Preview approval.** The page shows:
   - the full-lesson player;
   - any partial-coverage note;
   - any **Not covered: <point>** notice for a brief point still unmet after its repair round;
   - validation warnings (read-only);
   - **Render video** and **Refine in editor**;
   - **How this video was made**: the decision log, estimated and actual cost per step, and **Export JSON**.
7. **Delivery.** The render panel from the Deliver stage, including download, sharing and the ST-103 review. A render whose review found an error lists the findings, links to **Fix it in the editor**, and offers **Retry render**. The same lesson always renders to the same video, so fix it first. The decision log is shown here too.

Paid work starts only from **Prepare brief** (one small call), **Confirm & create video**, **Accept … and continue**, and **Render video**:

- Each button ignores a second click while a request is in flight.
- **Prepare brief** sends an `Idempotency-Key` that stays the same until the request changes, so a retry replays the same brief.
- The focus prompt only travels in request bodies.

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
| `configuration` | Takes the subject and title from the confirmed brief (ST-107). A run without a brief infers them with `ai.lesson-intent`. Saves the configuration with the focus, the audience, and the confirmed style pack and sound bed, then saves the `english-aria` voice. A configuration left by an earlier run on the same project (for example before **Edit prompt**) is replaced by this run's request; once this run has configured the lesson, the user's own edits are kept (ST-106). | Refused. |
| `objectives` | Generates with the confirmed coverage points (`objectives/v4`, `{{briefCoverage}}`), then approves with `expectedRevision`. | Coverage is `not_covered` (`FOCUS_NOT_COVERED`), or the job it queued fails. |
| `outline`, `narration` | Generates, then approves. | The draft cannot be approved, or the job it queued fails. |
| `storyboard` | Generates. | The job it queued fails. |
| `illustrations` | Requests missing illustrations once per storyboard. Accepts selectable candidates in required decorative slots only. Grounding-critical slots are never filled; they are left for validation to report. | Refused. |
| `grounding` | Checks the current storyboard revision. | The job it queued fails. |
| `audio` | Generates every scene. | A scene's audio fails. |
| `validation` | Runs validation, then bounded self-repair, then the brief-promise check (ST-107, below). | An error outside the repair map, or one repair did not fix (`VALIDATION_BLOCKING`, stage `preview`); a duration or pinning mismatch (`BRIEF_PROMISE_UNMET`). |

A step with no progress for 20 minutes fails the run with
`ONE_SHOT_STEP_TIMEOUT`. The run can then be resumed.

### Run budget ledger (ST-107)

- **Reservation.** Confirming the brief reserves its estimate. The cap is the
  reservation times `ONE_SHOT_BUDGET_TOLERANCE`.
- **Pre-call check.** Before every paid action, the runner compares the run's
  actual spend plus that action's estimate with the cap. The paid actions are
  a generate, the illustration request, a grounding check, the audio request
  and a repair. A call that would pass the cap is not made. The run stops at
  that step with `ONE_SHOT_BUDGET_CAP` and proposes a new estimate: actual
  spend plus the accepted estimate for every remaining step.
- **Concurrency.** The check runs inside the tick. The tick lease serialises
  every paid enqueue of a run, so no other enqueue of the same run can race
  it. The enqueue itself stays in the services' own transactional outbox.
- **Reconciliation.** After every tick, the ledger reconciles the run's usage
  records (by correlation id) into `one_shot_run_ledger_entries`, one row per
  step. It records `{ step, estimateUsd, actualUsd, usageRecordIds[] }`. The
  ledger total always equals the usage records. The re-checks and re-voicing
  a repair triggers are metered on `grounding` and `audio`.

### Bounded self-repair (ST-107)

After validation, and before any stop at `preview`, the runner may repair
routine findings through the existing `scene-regeneration` job:

- **Limits.** At most 2 rounds, each touching at most 4 scenes, with one action
  per tick. A round must reduce the number of repairable findings, or repair
  ends.
- **Repair map.** Only four codes are repaired. `text_overflow` shortens the
  scene. `scene_monotony` regenerates the middle scene of the run with another
  template. `scene_duration_out_of_range` regenerates the scene to its
  allocation. `objective_uncovered` regenerates the scene closest to the
  objective. Anything else goes to the user. Grounding findings are never
  repaired or acknowledged.
- **Instructions.** Instructions are templates, at most 500 characters. They
  never carry source text.
- **Idempotency.** Job keys are `oneshot:<runId>:repair:<round>:<sceneId>`, so
  a replayed tick reuses its job.
- **Source references.** A candidate that drops a source reference the scene
  cited is discarded, never applied.
- **After a round.** Grounding re-runs for the new storyboard revision, the
  touched scenes are re-voiced, and validation decides again.

Then the brief-promise check runs:

- **Coverage.** Every confirmed coverage point must be cited by at least one
  scene, through a block from one of its sections. An unmet point gets one
  repair round. If it is still unmet, the preview shows "Not covered" and the
  user decides whether to render.
- **Duration.** The measured duration must stay within the band.
- **Style and sound.** The lesson must still pin the confirmed style pack and
  sound bed.

A failed duration or style-and-sound check stops the run with
`BRIEF_PROMISE_UNMET`.

### Decision log (ST-107)

`one_shot_run_decisions` is append-only: a trigger rejects updates. `seq` is
handed out from `one_shot_runs.decision_sequence` in the writer's
transaction. The log records these kinds, each with its reason, model, prompt
version and cost where one applies:

- the brief;
- the style pack and the sound bed (the brief's suggestion or the user's
  change);
- every budget reservation;
- every automatic approval;
- every repair queued, applied or discarded, and why repair stopped;
- every coverage gap;
- the render review.

When the ST-103 review fails a one-shot render, the run stops at `render` with
`RENDER_REVIEW_FAILED` and the findings. Warnings go to the log.

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
| Table and migration | `one_shot_runs` in `packages/database/src/schema.ts`, `drizzle/0069_one_shot_runs.sql`; ST-107: `one_shot_run_briefs`, `one_shot_run_ledger_entries`, `one_shot_run_decisions`, `drizzle/0070_one_shot_brief_budget_decisions.sql` |
| State machine | `apps/api/src/one-shot-runner.ts` |
| Brief call (ST-107) | `apps/api/src/one-shot-brief.ts`, prompt `packages/provider-adapters/src/prompts/one-shot-brief/v1.ts` |
| Budget arithmetic and repair map (ST-107) | `apps/api/src/one-shot-budget.ts`, `apps/api/src/one-shot-repair.ts` |
| Service, cohort, estimate, tick host | `apps/api/src/one-shot.ts` |
| Adapter onto the wizard services | `apps/api/src/one-shot-gateway.ts` |
| Routes | `OneShotController` in `apps/api/src/app.ts` |
| Consumer registration | `apps/api/src/runtime.ts` |

## Known limitations

- **Mock coverage.** The mock provider judges focus coverage by keyword
  overlap (ADR-013). Only the real model judges meaning.
- **Estimate versus spend.** The estimate is an upper bound. It uses the
  brief's planned scene count, six characters per word, and the full repair
  allowance. Actual spend is metered from provider responses.
- **Brief sections.** Brief sections are validated against the parsed
  document. The run's source snapshot is approved from that document later,
  when the run starts.
- **Narration repairs.** A `scene_duration_out_of_range` finding is repaired
  with scene regeneration, not `narration.transform`. By validation time the
  run's narration set is approved, and transforms only apply to a draft set.
- **Wizard runs.** Self-repair applies only to prompt-to-video runs. The
  wizard keeps teacher control.
