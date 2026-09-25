---
story_id: ST-107
title: "Add a Video Brief, Run Budget Ledger, Bounded Self-Repair, and Decision Log to Prompt-to-Video"
phase: "10 — Prompt to Video"
status: Draft
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
