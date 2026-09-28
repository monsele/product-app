---
story_id: ST-107
title: "Add a Video Brief, Run Budget Ledger, Bounded Self-Repair, and Decision Log to Prompt-to-Video"
phase: "10 — Prompt to Video"
status: Done
priority: should-have
epics: ["E10", "E16", "E17", "E19", "E21"]
prd_user_stories: ["E10-US1", "E10-US2", "E16-US1", "E16-US2", "E21-US1", "E21-US2"]
depends_on: ["ST-088", "ST-103", "ST-104", "ST-105", "ST-106"]
---

# ST-107 — Add a Video Brief, Run Budget Ledger, Bounded Self-Repair and Decision Log to Prompt-to-Video

## Story

As a user of prompt-to-video, I want to see what the video will cover and cost before any
money is spent, and I want the system to fix its own routine problems before showing me the
preview. I also want to see how every automatic decision was made. That way I can trust an
automatic run as much as one I built step by step.

## Outcome

Four production practices from OpenMontage, rebuilt on AVLP's contracts:

1. **A video brief replaces the bare estimate.** It shows what the video will cover, with the
   source sections for each point, and what it will leave out. It also shows the planned
   length, the chosen style pack and sound bed with a reason for each, and an itemised cost.
   Confirming the brief is the single authorisation for the paid chain.
2. **A run budget ledger.** The confirmed cost is reserved. Each paid step is reconciled
   against the reservation, and the run stops before any call that would exceed the cap.
3. **Bounded self-repair.** Before the preview is shown, the orchestrator fixes routine
   validation problems with the existing scene and narration regeneration jobs. Deterministic
   validation decides what is wrong and whether it is fixed. The model only rewrites.
4. **A production decision log.** A "How this video was made" panel lists every automatic
   decision, with its reason, model and cost.

It also applies ST-103's post-render self-review to one-shot renders, and the brief's promises
are checked before the preview.

## Why (OpenMontage learnings)

These come from the OpenMontage review (`docs/claude_openmontage-final-consolidated.md` §1.4)
and the upstream pipeline design. They matter most when no teacher approves each stage:

| OpenMontage practice | Adapted as | Not adopted |
| --- | --- | --- |
| Proposal stage with human approval before production | Video brief (§1) | Agent web research; the brief uses only the PDF |
| Cost estimate → reservation → reconciliation, total budget cap | Run budget ledger (§2) | `observe`/`warn` modes; AVLP enforces a cap only |
| Agent self-review and revision between stages | Bounded self-repair (§3), where deterministic rules decide | Model-graded pass/fail; the model only advises (§1.3) |
| Delivery-promise validation before composition | Brief-promise check (§4) | Slideshow-risk scoring; ST-088's `scene_monotony` covers repetition |
| Decision audit trail with scored provider selection | Decision log (§5), recording choices from closed enums | Synthetic "alternatives rejected" (§2.3 of the consolidated doc) |
| Post-render review before presenting | ST-103 applied to one-shot runs (§6) | — |

**Licensing:** clean-room only. Do not copy OpenMontage (AGPL-3.0) code, prompts, skills or
schemas.

## Required Reading

- `AGENTS.md`
- ST-104 (contracts, prompts and `docs/adr/ADR-012-prompt-to-video-pilot.md`), ST-105 (the
  runner and endpoints) and ST-106 (the screens)
- ST-103, for the sound-bed catalog and the render review
- ST-088 and `apps/api/src/lesson-validation.ts`, for the validation rule codes
- `docs/claude_openmontage-final-consolidated.md`: §1.3–§1.5, §2.3, §7
- `docs/reference/epic-technical-implementation-guide.md`: the quota section and E16
- `docs/design.md`

## Dependencies

ST-088 (Done), ST-103, ST-104, ST-105 and ST-106. Do not start until all of them are Done.

## Scope

### 1. Video brief

- [ ] **Brief call.** Add a structured model call `ai.one-shot-brief` (prompt family
  `one-shot-brief/v1`). It runs after ingestion and before the paid chain.
  - **Its explicit trigger is "Prepare brief".** It is small, and it is quota-checked and
    metered.
  - **Input:** the focus prompt, audience, duration, the document's title and section
    headings, and each section's first block.
  - **Output (Zod):**
    - `subject`, `lessonTitle`
    - `coverage`: 2–8 points, each `{ point, sectionIds[] }`. Every `sectionId` must exist
      in the snapshot.
    - `notCovered[]`
    - `plannedSceneCount`
    - `stylePackId`: a closed enum of registered packs, plus a `stylePackReason` of 200
      characters at most
    - `soundBed`: an ST-103 `trackId` or `none`, plus a `soundBedReason`
  - This call supersedes ST-104's `ai.lesson-intent` and reuses its fields.
- [ ] **Estimate.** Compute the itemised estimate deterministically from `plannedSceneCount`
  and the model, illustration and TTS pricing. The model never produces a cost.
- [ ] **Brief screen.** Show the coverage points with source-section chips, the not-covered
  list, and the style and sound choices (each changeable from the closed list).
  - The user can edit the prompt and prepare the brief again, at most 3 times per run.
  - **Confirm & create video** posts the brief revision and the accepted estimate. This
    replaces ST-106's direct "Create video" and ST-105's bare estimate.
- [ ] **Downstream.** Pass the confirmed coverage points into the objectives prompt as
  `{{briefCoverage}}`, in a new prompt version, so the objectives are grounded in the promise.

### 2. Run budget ledger

- [ ] **Reservation.** On confirmation, store `reserved_usd` = the accepted estimate.
  `cap_usd` = reserved × `ONE_SHOT_BUDGET_TOLERANCE`, default 1.25, configured in
  `packages/config`.
- [ ] **Pre-call check.** Before enqueuing each paid step, the orchestrator compares
  `actual_usd` plus that step's estimate with `cap_usd`. If it would exceed the cap, the run
  stops with `needs_attention` and `ONE_SHOT_BUDGET_CAP`.
  - Continuing requires the user to explicitly accept a new estimate. That creates a new
    reservation revision.
- [ ] **Reconciliation.** Reconcile from existing usage records by correlation id after each
  step. Store the entries in `one_shot_run_ledger_entries` as
  `{ step, estimateUsd, actualUsd, usageRecordIds[] }`.
- [ ] **Display.** Show estimated vs actual cost on the progress view and the preview.

### 3. Bounded self-repair

- [ ] **Loop.** After validation (ST-105 stage map, step 11), if there are findings, run up to **2 repair
  rounds**, each touching at most **4 scenes**, before any `needs_attention`.
- [ ] **What the repair map covers.** Only these codes (verify each exists in
  `validationIssueCodeSchema`):

  | Code | Repair action |
  | --- | --- |
  | `text_overflow` | Scene regeneration, instruction "shorten on-screen text to fit" |
  | `scene_monotony` | Scene regeneration of the middle scene of the run, instruction "use a different template that fits this content" |
  | `scene_duration_out_of_range` | Narration block transform, "shorten" or "expand" to the target word budget |
  | `objective_uncovered` | Scene regeneration of the closest scene, instruction naming the uncovered objective |

- [ ] **What it never touches.** Anything not in the map goes straight to `needs_attention`.
  In particular, grounding issues are never auto-repaired: `grounding_missing` and
  unsupported claims go to the user.
- [ ] **Existing jobs only.** Repairs use the existing `scene-regeneration` and
  `narration.transform` jobs and their `instruction` fields (500 characters at most). No new
  generation path.
- [ ] **Instructions.** Build instructions deterministically from templates. They never
  include source text beyond what those jobs already receive.
- [ ] **After each repair round:**
  - Re-run the affected audio and the grounding check for touched scenes.
  - Then re-run validation.
  - A round that does not reduce the error count ends the repair phase.
- [ ] **Metering.** Each repair is metered through the ledger and recorded in the decision log.

### 4. Brief-promise check (deterministic, before the preview)

- [ ] **Coverage.** Every confirmed coverage point must be covered by at least one scene
  whose `sourceRefs` include a block from that point's `sectionIds`.
- [ ] **Duration.** The measured duration must be within the existing target band.
- [ ] **Style and sound.** The chosen style pack and sound bed must be the ones the lesson
  version pins.
- [ ] **When it fails.** An unmet coverage point triggers one repair round (scene
  regeneration naming the point). If it is still unmet, the preview shows "Not covered:
  <point>" and the user decides whether to render. Duration and pinning mismatches are errors
  and go to `needs_attention`.

### 5. Production decision log

- [ ] **Table `one_shot_run_decisions`:** `{ runId, seq, kind, summary, reason?, model?, promptVersion?, costUsd?, relatedIds, createdAt }`.
  Append-only, with tenant columns.
- [ ] **Kinds:** `brief`, `style_pack`, `sound_bed`, `auto_approval`, `repair`,
  `budget_reservation`, `coverage_gap` and `render_review`.
- [ ] **Panel.** A "How this video was made" panel on the preview and render pages, and a
  JSON export beside the existing storyboard export.

### 6. Post-render review for one-shot

- [ ] **Blocking findings.** When ST-103's render review has error findings, the run goes to
  `needs_attention` at `render` with the findings and a retry-render action.
- [ ] **Warnings** are listed in the decision log.

## Technical Implementation Requirements

- **Deterministic authority.** Validation rules and the brief-promise check decide what is
  wrong and whether a repair worked. Model output is always parsed against closed schemas.
  The brief cannot introduce style packs, tracks or sections that do not exist.
- **Grounding.** Repairs must not remove `sourceRefs`, and they re-run the grounding check on
  every touched scene. Never auto-repair or auto-acknowledge grounding findings.
- **Idempotency.**
  - Repair jobs use the key `oneshot:<runId>:repair:<round>:<sceneId>`.
  - Ledger entries are unique per `(runId, step)`.
  - Decision rows are unique per `(runId, seq)`.
- **Transactions.** No transaction is held across an enqueue or a provider call. The ledger
  check and the enqueue happen in the same short transaction as the job insert (the outbox
  pattern).
- **Logging.** Never log prompts, brief text, source text or signed URLs. Decision summaries
  are user content, stored like the focus prompt.
- **Pilot gating.** Everything stays behind ST-105's cohort flag.

## Contracts and Persistence

- Schemas:
  - `oneShotBriefSchema`, with a revision field
  - `oneShotLedgerEntrySchema`
  - `oneShotDecisionSchema`
  - the new `one-shot-brief/v1` prompt
  - an objectives prompt version with `{{briefCoverage}}`
  - run statuses `brief_pending` and `brief_ready`
  - `needs_attention` code `ONE_SHOT_BUDGET_CAP`
- Migration:
  - the `one_shot_run_briefs` table (revisioned)
  - the `one_shot_run_ledger_entries` table
  - the `one_shot_run_decisions` table
  - columns `reserved_usd` and `cap_usd` on `one_shot_runs`
- Config: `ONE_SHOT_BUDGET_TOLERANCE` and `ONE_SHOT_MAX_BRIEF_REVISIONS`, both in `.env.example`.

## Interfaces

- `POST /projects/:projectId/one-shot/brief`: prepares or revises the brief. Requires an
  idempotency key.
- `GET /projects/:projectId/one-shot/brief`
- `POST /projects/:projectId/one-shot`: now requires `{ briefRevision, acceptedEstimateUsd }`.
- `POST /projects/:projectId/one-shot/budget/accept`: accepts a raised estimate after
  `ONE_SHOT_BUDGET_CAP`.
- `GET /projects/:projectId/one-shot/decisions`
- UI: the brief screen, the budget readout, the "How this video was made" panel and the
  coverage-gap notices.

## Acceptance Criteria

- [ ] The brief lists coverage points with valid source sections, a not-covered list, the
  style pack and sound bed with reasons, and an itemised deterministic estimate. Nothing paid
  beyond the brief call runs until the user confirms.
- [ ] A brief whose output names a style pack, track or section that does not exist is
  rejected by schema validation. It goes through the bounded repair policy, not a silent fallback.
- [ ] A run whose next paid step would exceed the cap stops with `ONE_SHOT_BUDGET_CAP` before
  that call. After the user accepts a new estimate, it continues.
- [ ] Given a lesson with a `text_overflow` issue and a `scene_monotony` issue, the run
  repairs both automatically within 2 rounds. It then reaches the preview with those findings
  gone, and the decision log shows each repair.
- [ ] A grounding finding is never auto-repaired or acknowledged. It goes to `needs_attention`.
- [ ] A repair round that does not reduce errors ends repair and escalates. There is no
  unbounded looping.
- [ ] An unmet coverage point is shown as "Not covered" on the preview after one repair attempt.
- [ ] A failing post-render review sets `needs_attention` at `render` with the findings.
- [ ] Estimated vs actual cost and the full decision log survive a reload. They match the
  usage records for the run.
- [ ] All new endpoints enforce cohort gating and tenant isolation.

## Required Tests

- [ ] **Unit:**
  - brief schema: closed enums, section-id validation, revision limit
  - estimate calculation
  - ledger cap arithmetic, including boundaries
  - the repair map and round termination
  - the brief-promise check
  - decision log sequencing
- [ ] **Integration** (Postgres, mock provider):
  - brief → confirm → chain
  - the budget cap stop and accept
  - fixtures with overflow and monotony repaired
  - a grounding issue escalated, not repaired
  - replayed repair jobs deduplicated
- [ ] **Authorization, failure and concurrency:**
  - cross-tenant access
  - flag off
  - confirming a stale brief revision is rejected
  - two confirms racing produce one run
- [ ] **UI:** the brief screen with source chips, editing the prompt, the budget readout,
  the decision panel and the coverage-gap notice. Hydrated browser test.
- [ ] **End to end** with `run-app`: at least three different-subject PDFs, recording brief
  accuracy, repair counts and estimate vs actual cost.

## Out of Scope

- Web research and multiple documents.
- Scored multi-provider selection, which waits until AVLP has more than one provider per job.
- Generated music, B-roll and avatars.
- Model-graded quality gates.
- Automatic acknowledgement of warnings.
- Applying self-repair to the normal wizard flow. That is a possible follow-up; the wizard
  keeps teacher control.

## Definition of Done

- [ ] All acceptance criteria pass.
- [ ] Required tests pass.
- [ ] Lint, typecheck, test and build commands pass for the affected workspaces.
- [ ] Documentation and migrations are complete. ADR-012 is amended if the brief changes its
  authorisation model.
- [ ] A licensing review confirms no OpenMontage code or derivative is included.
- [ ] No unresolved security, tenant-isolation, idempotency or data-loss issue remains.
- [ ] Dev Agent Record is completed.
- [ ] Story status and index are updated to Done.

## Dev Agent Record

- **Agent:** Claude Code (Opus 5.5).
- **Started:** 2026-09-27.
- **Completed:** 2026-09-28. Handed off as In Review.
- **Branch/PR:** `feat/st-107-video-brief-budget-self-repair`, branched from
  `feat/st-106-prompt-to-video-screens`. Nothing is committed or pushed yet,
  and there is no PR.

### Files changed

**Contracts:**

- `packages/schemas/src/one-shot.ts` adds:
  - statuses `brief_pending` and `brief_ready`;
  - error codes `ONE_SHOT_BUDGET_CAP`, `BRIEF_PROMISE_UNMET` and
    `RENDER_REVIEW_FAILED`;
  - `createOneShotBriefOutputSchema`, a closed schema built at call time over
    the document's section IDs, the registered style packs and the active
    sound-bed tracks;
  - `oneShotBriefSchema` (revisioned), `oneShotBriefInputSchema` and
    `oneShotBriefResponseSchema`;
  - `oneShotLedgerEntrySchema`, `oneShotBudgetSchema` and
    `oneShotBudgetAcceptInputSchema`;
  - `oneShotDecisionSchema` and `oneShotDecisionDraftSchema` (closed kinds),
    and `oneShotDecisionsResponseSchema`;
  - a new `oneShotCreateInputSchema`:
    `{ briefRevision, acceptedEstimateUsd, stylePackId?, soundBed? }`;
  - on the run view: `briefRevision`, `budget`, `coverageGaps`, `stylePackId`
    and `soundBed`.
- `packages/schemas/src/index.ts` adds the `ai.one-shot-brief` operation, the
  `briefCoverage` objectives param, `briefObjectiveGenerationCompatibility`
  (objectives v4) and `currentOneShotBriefCompatibility`.

**Config:** `packages/config/src/index.ts` and `.env.example` add
`ONE_SHOT_BUDGET_TOLERANCE` (default 1.25) and `ONE_SHOT_MAX_BRIEF_REVISIONS`
(default 3).

**Database:**

- `packages/database/src/schema.ts` adds the three new tables, the new run
  columns, the enum values and the audit event types.
- `drizzle/0070_one_shot_brief_budget_decisions.sql` and its
  `.compatibility.md`, plus a `_journal.json` entry.

**Prompts and mock:**

- `provider-adapters/src/prompts/one-shot-brief/v1.ts` (new) and
  `prompts/objectives/v4.ts` (new, with `{{briefCoverage}}`).
- `prompts/index.ts`, `prompts.ts` (the `one-shot-brief` kind),
  `prompts/audience.ts` (`describeBriefCoverage`), `job-envelope.ts`, and the
  deterministic brief in `dynamic-mock-provider.ts`.

**API:**

- `one-shot-brief.ts` (new): `ProviderOneShotBriefService`, a quota-checked,
  metered and recorded model call with bounded structured-output repair.
- `one-shot-budget.ts` (new): the deterministic estimate, the ledger step
  mapping and the cap arithmetic.
- `one-shot-repair.ts` (new): the repair map, round planning, round
  termination and the brief-promise check.
- `one-shot-runner.ts` adds:
  - the budget guard before each paid action;
  - brief-driven configuration (no lesson-intent call);
  - `briefCoverage` passed to objectives;
  - bounded repair, one action per tick;
  - the brief-promise check with one coverage repair round;
  - decision drafts;
  - handling of the ST-103 render review.
- `one-shot.ts` adds:
  - `brief`, `currentBrief`, the new confirming `create`, `acceptBudget` and
    `decisions`;
  - brief-aware tick hosting with ledger reconciliation and decision appends;
  - the removal of `estimate` (replaced by the brief).
- `one-shot-gateway.ts` adds the repair methods, the promise state, the
  review mapping and the style/sound save.
- `objectives.ts` accepts `briefCoverage` and selects v4.
- `storyboard.ts` attributes `regenerateScene`, `applySceneCandidate` and
  their audit events to the run through `oneShotRunId`.
- `app.ts` adds the routes `POST/GET one-shot/brief`,
  `POST one-shot/budget/accept` and `GET one-shot/decisions`. `runtime.ts`
  does the wiring.

**Web:**

- `lib/one-shot.ts` adds the brief, confirm, budget and decisions clients,
  the view mapping, the sound-bed options and the decision-log export.
- `one-shot-workspace.tsx` adds the request → brief → confirm flow, the
  budget view, the decisions panel and Retry render.
- `one-shot-views.tsx` adds `BriefCard`, `BudgetCapCard`, `DecisionPanel`,
  `CoverageGapNotice` and the budget readout. `one-shot.module.css` has the
  matching styles.

**Tests (new):**

- `apps/api/src`: `one-shot-budget.test.ts`, `one-shot-repair.test.ts`,
  `one-shot-runner-st107.test.ts`, `one-shot-st107.integration.test.ts`, and
  the test support `one-shot-test-brief.ts`.
- `packages/schemas/src/one-shot.test.ts`.
- `packages/provider-adapters/src/one-shot-brief-prompt.test.ts`.

**Tests (updated):**

- API: `one-shot.test.ts`, `one-shot-gateway.test.ts`,
  `one-shot.integration.test.ts`, `focus-intent.integration.test.ts` and
  `one-shot-test-pipeline.ts`.
- Web: `lib/one-shot.test.ts`, `lib/one-shot-fixtures.ts`,
  `one-shot-views.test.tsx` and `one-shot.playwright.test.tsx`.
- E2E: `e2e/one-shot.spec.ts` and `e2e/one-shot-mock.mjs`.
- Provider adapters: `prompts.test.ts`.

**Docs:**

- `docs/prompt-to-video-pilot.md` covers the endpoints, screens, ledger,
  repair and decision log.
- `docs/adr/ADR-013-prompt-to-video-pilot.md` gains §7, an amendment
  recording that the brief is now the authorisation.

### Migrations

`0070_one_shot_brief_budget_decisions` is additive:

- **Enum values:** `usage_operation_type` gains `ai.one-shot-brief`.
  `audit_event_type` gains `one_shot.brief_prepared` and
  `one_shot.budget_accepted`. `one_shot_run_status` gains `brief_pending` and
  `brief_ready`.
- **New `one_shot_runs` columns:** brief attempts, confirmed revision,
  style/sound, reserved/cap/proposal USD, reservation revision, repair state,
  coverage gaps and decision sequence.
- **Active-run index:** recreated as `status not in ('completed', 'cancelled')`.
  This form never uses the new enum values in the transaction that adds them,
  and stays IMMUTABLE.
- **New tables:** `one_shot_run_briefs`, `one_shot_run_ledger_entries`
  (unique `(run_id, step)`) and `one_shot_run_decisions` (unique
  `(run_id, seq)`; a trigger rejects UPDATE).

The migration was applied to the local dev database and to every test
database.

### Public contract changes

- **`POST one-shot`** now takes
  `{ briefRevision, acceptedEstimateUsd, stylePackId?, soundBed? }` instead of
  `{ focusPrompt, audience, targetDurationSeconds, acceptedEstimateUsd }`.
- **`POST one-shot/estimate`** is removed. The estimate now comes from the
  brief.
- **New endpoints:** `POST one-shot/brief` (Idempotency-Key),
  `GET one-shot/brief`, `POST one-shot/budget/accept` and
  `GET one-shot/decisions`.
- **Run view:** gains `briefRevision`, `budget`, `coverageGaps`, `stylePackId`
  and `soundBed`. There are new run statuses and error codes.
- **Prompts:** `one-shot-brief/v1` and `objectives/v4` are new. The wizard
  keeps objectives v3.

### Commands/tests

**Typecheck:** `tsc --noEmit` is clean for `packages/schemas`,
`packages/provider-adapters`, `apps/api`, `apps/pipeline-worker` and
`apps/web`. `pnpm turbo build --filter='./packages/*'` passes (12/12).

**Lint:** `eslint` is clean on every changed file in `apps/api`, `apps/web`,
`packages/schemas` and `packages/provider-adapters`.

**Package tests:** `packages/schemas` 390/390; `packages/provider-adapters`
84/84.

**API tests (with Postgres, `TEST_DATABASE_URL`, `--hookTimeout 180000`):**

| Suite | Result |
| --- | --- |
| Unit: `one-shot-budget` | 8 |
| Unit: `one-shot-repair` | 9 |
| Unit: `one-shot-runner` (ST-105) | 14 |
| Unit: `one-shot-runner-st107` | 12 |
| Unit: `one-shot-gateway` | 12 |
| Unit: `one-shot` (routes) | 8 |
| Integration: `one-shot.integration` | 14/14 |
| Integration: `one-shot-st107.integration` | 8/8 |
| Integration: `focus-intent.integration`, including the new `objectives/v4` job-payload test | passed |

Together these are 96/96. The full `apps/api` result is below the table.

**Full `apps/api` suite** (74 files, 714 tests): 704 passed in the full parallel run. The other 10 were each the first route test of a suite, and each hit vitest's 5 s timeout while the Nest app booted under full-suite load. Rerun on their own, all 10 files pass (124 tests), so all 714 API tests pass.

**Web:** `one-shot-views.test.tsx` 31/31 and `lib/one-shot.test.ts` 19/19.
`one-shot.playwright.test.tsx` (axe) is 11/11, and covers the brief view, the
budget cap, the render-review failure, and the brief, decision log and
coverage gap at 390 px. The full `apps/web` suite is 58 files, 341/341.

**Hydrated E2E:** `npx playwright test e2e/one-shot.spec.ts` passed 7/7 on
the real Next app against the stateful mock. It covers:

- **Golden path:** brief with source chips, prompt edit to revision 2, style
  change, a double-click confirm that creates one run, the cap readout,
  the Not-covered notice, the decision log, the ledger, JSON export, reload
  and download.
- **Budget cap:** stop, reload, and a double-click accept that continues.
- **Existing ST-106 flows:** reload, cancel, attention with resume, and not
  covered with Edit prompt.

**Live end-to-end (`run-app`):** the full local stack, with mock providers
and the real Together key blanked, ran the driver
`node .runtime-logs/st107-drive.mjs` on three PDFs in parallel. Evidence is
in `.runtime-logs/st107-*.png` and `.runtime-logs/st107-results.json`.

| Subject | Briefs | Repairs (queued / applied) | Coverage gaps | Estimate (reserved) | Actual, ledger = usage records | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| Cell biology | 1 | 3 / 3, then one "no progress" stop | 2 | $22.80 | $0.099 = $0.099 | Rendered and downloaded |
| Roman Republic (Students 11–13, Editorial) | 2 (prompt edited) | 4 / 4, then one stop | 3 | $22.80 | $0.1155 = $0.1155 | Rendered |
| Compound interest (Professional) | 1 | 4 / 4, then one stop | 3 | $22.80 | $0.099 = $0.099 | Rendered |

Across the three runs:

- **Before confirmation:** nothing was paid except the brief. Each run had no
  ledger rows and only `brief` decisions.
- **Ingestion wait:** "Prepare brief" answered 409 "still being read" while
  ingestion ran, and each subject retried until the brief was ready.
- **Style and sound:** the confirmed style pack and sound bed were pinned. For
  the Roman Republic run that was Editorial, a change from the suggestion.
- **Render review:** its warnings (`LOUDNESS_OUT_OF_RANGE`) appear in the
  decision log.
- **Layout:** the brief view has no horizontal scroll at phone width (0 px
  overflow).

Brief accuracy is judged on the mock provider:

- Every chip is a real section of the PDF.
- With four sections offered, the mock cites the finance and Roman Republic
  sections that match their focus.
- For biology, the matching section headings are generic ("2. Parts of a
  cell"), so the heading regex in the driver did not match. The chips are
  still the right sections.

The mock judges by keyword overlap, not meaning, so it is not a measure of
real-model accuracy.

### Screenshots/output

- `.runtime-logs/st107-<subject>-<n>-<state>.png` show the request, brief,
  brief revision 2, brief at phone width, progress after reload, approval
  (budget readout, Not covered, "How this video was made" with ledger) and
  delivery.
- `.runtime-logs/st107-results.json` holds the per-subject brief, decision
  kinds, ledger and repair counts.

### Decisions/assumptions

- **The run starts at the brief.** The first "Prepare brief" creates the run
  in `brief_pending`. Revisions revise the same run. Confirmation is a
  conditional `brief_ready → queued` update, pinned to the latest revision and
  the attempt count. So a stale revision is rejected, two racing confirms
  produce one run, and a replay returns that run. The run's correlation id
  therefore covers the brief calls too, and the ledger includes them.
- **Brief limit.** `ONE_SHOT_MAX_BRIEF_REVISIONS` counts brief calls per run,
  the first included, and each call is counted before the model is called. A
  document that is still being read is checked before anything is counted
  (`assertReady`).
- **Estimate.** v2 is computed from `plannedSceneCount` and the configured
  prices. It includes a full repair allowance: 3 rounds × 4 scene
  regenerations, 3 grounding re-checks and 12 re-voiced scenes. That makes
  the upper bound conservative ($22.80 for 3 minutes at the $1.08 bounded
  model-call price).
- **Budget guard.** It runs in the tick before each paid action (generate,
  illustrations, grounding, audio, repair). The proposal is actual spend plus
  the estimate for the remaining steps, and never less than actual plus the
  blocked call.
- **Repair progress.** The count is repairable findings, errors plus mapped
  warnings, because `scene_monotony` is a warning and the acceptance criteria
  require it to be repaired. A round that does not reduce that count ends
  repair. Errors still left escalate; warnings still left are listed and
  never acknowledged.
- **Grounding and re-voicing after repair.** Grounding re-runs as one
  lesson-scope check for the new storyboard revision, which covers the touched
  scenes. Audio re-voices the scenes whose audio went stale. A repair round
  holds grounding and audio until the whole round is applied.
- **Brief sections.** Sections are validated against the project's parsed
  document, because no snapshot exists before the run approves it. Sections
  without content are not offered, since no scene could ever cite them.
- **Pinning check.** Style and sound are compared with the lesson
  configuration, which is what the lesson version saved at render pins.
- **Decision-log export.** It sits in the "How this video was made" panel on
  the preview and delivery views. The one-shot page has no storyboard export
  button to place it beside.

### Deviations

- **Duration repair.** `scene_duration_out_of_range` is repaired with scene
  regeneration, not `narration.transform`. By validation time the run's
  narration set is approved, and `narration.transform` only works on a draft
  set. Reopening narration would regenerate the whole storyboard.
- **Ledger check placement.** The check happens in the tick, immediately
  before the service's own transactional-outbox enqueue, rather than inside
  the same transaction. The tick lease serialises every paid enqueue of a
  run, so no other enqueue of the same run can race it. The services'
  transactions were left unchanged.
- **ADR number.** The story names ADR-012, but ADR-013 is the
  prompt-to-video ADR (see its numbering note). It is amended in §7.

### Known risks/follow-up

- **Large estimate.** The repair allowance makes the upper bound large next to
  typical spend. A pricing review could lower the bounded model-call price or
  the allowance.
- **Mock accuracy.** The mock brief and focus coverage use keyword overlap.
  Brief accuracy against the real model still needs a pilot run with the real
  provider.
- **Non-refusal errors.** A service error that is not a `PublicError` (for
  example a programming error) is still retried as transient until the
  20-minute step timeout, as in ST-105. The live run exposed one such bug
  (below); the error surfaced only as a timeout.
- **Bugs found and fixed during the live run:**
  - An ingestion-wait 409 used up brief calls. `assertReady` now runs first,
    and a regression test covers it.
  - `briefCoverage` was sent as an array, which job params reject (scalars
    only). It is now one line per point, with a real-service Postgres test.
  - Brief points on sections with no content could never be covered. Those
    sections are no longer offered.
- **Filename.** The render download filename is the lesson-title slug from
  ST-105/106. With the mock, that title echoes the focus.
- **Licensing:** clean-room. No OpenMontage code, prompts or schemas were
  used. Only the practices named in the story were re-implemented on AVLP
  contracts.

### Story code review fixes (2026-09-28)

- **Medium: the render-review retry.** A failed ST-103 review is terminal, and
  render identity is content-addressed. So for an unchanged lesson the
  one-shot "Retry render" could only return the same failed render.
  - The stop message now leads with "Fix these in the editor, then retry the
    render", followed by the findings.
  - The delivery view adds **Fix it in the editor**, a link to the
    storyboard, and explains that the same lesson renders to the same video.
  - Covered by the updated runner and view tests.
- **Low: racing brief revisions.** Two revisions racing on one run used to
  surface a raw error. They now answer 409 and leave the run in
  `brief_ready`. A new Postgres test covers it.
- **Lint:** `one-shot-runner.ts` no longer uses `structuredClone` (not a
  global in the ESLint environment). Repair state is never mutated in place.
- **After the fixes:**
  - API one-shot suites (with Postgres): 86/86. Runner, repair and budget
    unit tests: 43/43.
  - Web one-shot views: 31/31.
  - `eslint` and `tsc --noEmit` are clean on every changed file.
