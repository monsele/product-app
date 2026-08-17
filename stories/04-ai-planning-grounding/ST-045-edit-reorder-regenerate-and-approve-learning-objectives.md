---
story_id: ST-045
title: "Edit, Reorder, Regenerate, and Approve Learning Objectives"
phase: "04 \u2014 AI Planning and Grounding"
status: Done
priority: must-have
epics: ["E7", "E20"]
prd_user_stories: ["E7-US2", "E20-US1"]
depends_on: ["ST-044"]
---

# ST-045 — Edit, Reorder, Regenerate, and Approve Learning Objectives

## Story

As a teacher, I want to add, edit, remove, reorder, regenerate, and approve objectives before they guide the lesson.

## Outcome

A revision-aware objective editor preserves approved content, supports candidate regeneration, and creates an immutable approved objective snapshot.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E7-US2, E20-US1
- `docs/reference/epic-technical-implementation-guide.md` — E7, E20 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-044

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [x] Implement objective CRUD and ordering within a draft revision.
- [x] Allow adding teacher-authored objectives with optional/required source links according to grounding policy.
- [x] Implement regeneration into a candidate revision without discarding current content.
- [x] Require at least one objective.
- [x] Implement approve command that creates an immutable approved revision/snapshot.
- [x] Display citations and unsupported/teacher-added status.
- [x] Use optimistic concurrency and audit approval.

## Technical Implementation Requirements

- Outline generation uses only the approved objective revision.
- Editing approved objectives creates a new draft; it does not mutate the approved snapshot used by prior outputs.
- Teacher-added unsupported claims may be allowed only with a visible warning and grounding status.
- Reordering must preserve objective IDs and citation links.

## Contracts and Persistence

- Objective draft/approved revision.
- Objective ordering.
- Approval event.

## Interfaces

- Objective CRUD/reorder endpoints.
- `POST /projects/:id/objectives/approve`.
- Objective editor UI.

## Acceptance Criteria

- [x] Teachers can add, edit, remove, and reorder objectives.
- [x] At least one objective is required for approval.
- [x] Regeneration preserves the current approved/draft version until the teacher selects a candidate.
- [x] Approval creates an immutable version used by outline generation.
- [x] Stale concurrent saves are rejected.

## Required Tests

- [x] Objective editor domain tests.
- [x] Ordering and ID preservation tests.
- [x] Approval immutability test.
- [x] Regeneration candidate test.
- [x] Concurrency and cross-user API tests.
- [x] Editor Playwright test.

## Out of Scope

- Objective-to-standards mapping.
- Collaborative editing.

## Story-Specific Notes

- Technical guide references: E7 and approval state machine 5.3.

## Implementation Checklist

- [x] Inspect the current repository and related completed stories.
- [x] Write a short implementation plan listing files, contracts, migrations, tests, and risks.
- [x] Implement only this story's scope.
- [x] Add or update schemas before changing consumers.
- [x] Add authorization, validation, error, retry, concurrency, and idempotency behavior where applicable.
- [x] Add structured logs, correlation, audit, and usage records where applicable.
- [x] Run the required automated tests and affected workspace quality commands.
- [x] Self-review the diff for scope creep, insecure access, stale data races, and unbounded provider calls.
- [x] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [x] Every acceptance criterion is implemented and verified.
- [x] Every required test is implemented and passing.
- [x] `lint`, `typecheck`, `test`, and `build` pass for all affected workspaces.
- [x] Database migrations and compatibility notes are complete where applicable.
- [x] Public schemas, events, and endpoints are documented.
- [x] No unresolved tenant-isolation, security, idempotency, concurrency, data-loss, or cost-control defect remains in this scope.
- [x] No out-of-scope feature or unrelated refactor was added.
- [x] The Dev Agent Record is complete.
- [x] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:** Kilo (deepseek/deepseek-v4-flash)
- **Started:** 2026-08-17
- **Completed:** 2026-08-17 (handed to review as In Review)
- **Branch/PR:** `story/st-045` (local; no PR opened).
- **Files changed:**
  - `packages/schemas/src/index.ts` — ST-045 contracts: added `superseded` set status, `revision` on `learningObjectiveSetSchema`, `groundingStatus` on `learningObjectiveSchema` (derived from `sourceRefs`), editor input schemas (`objectiveCreateInputSchema`, `objectiveUpdateInputSchema`, `objectiveRemoveInputSchema`, `objectiveReorderInputSchema`, `objectiveApproveInputSchema`), `approved` + `canApprove` fields and `approved` state on `objectivesResponseSchema`; `packages/schemas/src/objectives.test.ts` (+9 editor input/set tests).
  - `packages/database/src/schema.ts` — `learning_objective_set_status` enum gains `superseded`; `learning_objective_sets.revision` optimistic-concurrency column; `objectives.edited` and `objectives.approved` audit event types; migration `0031_white_ser_duncan` + compatibility doc.
  - `apps/pipeline-worker/src/objectives-job.ts` — `persistObjectiveSet` writes `revision: 0`, objective `groundingStatus: "supported"`, and supersedes prior `draft` sets when a new candidate is persisted (regeneration preserves the approved set until the teacher approves the candidate); `objectives-job.test.ts` +fake update support and supersede test.
  - `apps/api/src/objectives.ts` — added `add`, `update`, `remove`, `reorder`, `approve` to `PostgresObjectivesService`; working draft resolution (latest draft, cloning an approved set into a new draft when the teacher edits approved content); optimistic concurrency via `expectedRevision`; teacher source-block resolution against the approved snapshot (`resolveSnapshotSourceRefs`); reorder validation preserving ids/citations; approval supersedes prior approved set and advances project stage `objectives_review → outline_review`; audit events; `current()` now exposes `approved`, `canApprove`, and `approved` state.
  - `apps/api/src/app.ts` — routes `POST /projects/:id/objectives`, `PATCH /projects/:id/objectives/:objectiveId`, `DELETE /projects/:id/objectives/:objectiveId`, `POST /projects/:id/objectives/reorder`, `POST /projects/:id/objectives/approve`; extended unavailable service.
  - `apps/api/src/objectives.test.ts` — route authz/origin/concurrency tests for the five new endpoints; `objectives-service.test.ts` fixture updated.
  - `apps/api/src/objectives-editor.test.ts` — new service test file: CRUD, reorder id/citation preservation, approval immutability/supersede/stage, regeneration candidate behavior, concurrency, approved-set clone-on-edit, source-ref resolution, audit events (18 tests).
  - `apps/web/app/workspace/[projectId]/objectives/` — `objectives-panel.tsx` is now a full editor (add/edit/remove/reorder/approve, citations, teacher-added badge, unsupported warning, optimistic concurrency, approved snapshot display, polling); `objectives-input.ts` + test updated for `approved` state and grounding labels.
  - `apps/web/app/workspace/page.tsx` — inbound navigation to the objectives review page (ST-044 review follow-up L1).
  - `e2e/objectives.spec.ts` — Playwright editor tests; `e2e/workspace-mock-api.mjs` — objectives endpoints in the mock API.
  - `STORY_INDEX.md` and this story — status transitions.
- **Migrations:** `0031_white_ser_duncan` (adds `objectives.edited`/`objectives.approved` audit event types, `superseded` set status, `learning_objective_sets.revision`).
- **Contracts changed:** new editor input schemas; `learningObjectiveSchema`/`learningObjectiveSetSchema` gained `groundingStatus` and `revision`; `objectivesResponseSchema` gained `approved`/`canApprove` and the `approved` state; new API endpoints listed above; worker draft-persistence now supersedes prior drafts on new candidates.
- **Commands/tests run:**
  - Per-workspace `lint`, `typecheck`, `test`, `build` for `@avlp/schemas` (92 tests), `@avlp/database` (8 pass, 3 skip), `@avlp/api` (131 pass, 49 skip), `@avlp/pipeline-worker` (44 pass, 20 skip), `@avlp/web` (29).
  - Repository-wide `pnpm lint` (16/16), `pnpm typecheck` (16/16), `pnpm build` (16/16).
  - `pnpm --filter @avlp/database db:generate` produced `0031_white_ser_duncan`.
  - `pnpm --filter @avlp/evals eval` — `"passed": true`.
  - `npx playwright test e2e/objectives.spec.ts` — 4/4 passed; `e2e/workspace.spec.ts` — the source-upload test fails identically on the clean baseline (pre-existing flaky mock-upload timing, unrelated to ST-045).
  - `git diff --check` — clean.
- **Screenshots or representative output:** API service tests verify teacher-added objectives (order append, `generated: false`, grounding), reorder preserves ids/citations, approval supersedes the prior approved set and advances stage to `outline_review`, and stale `expectedRevision` returns 409; Playwright verifies add/approve/reorder/conflict flows in the browser.
- **Decisions and assumptions:**
  - Working set = latest `draft` set; if none, the latest `approved` set. Editing an approved set clones it into a new draft revision so the approved snapshot stays immutable (guide 5.3).
  - Approval transitions the working draft to `approved`, supersedes any prior approved set, writes `objectives.approved`, and advances the project stage per the stage machine.
  - Regeneration creates a new candidate set via the existing generate job; the worker supersedes prior drafts only, so the approved set remains authoritative until the teacher approves the candidate.
  - Teacher-added objectives may omit source links (grounding policy): empty `sourceRefs` produce `groundingStatus: "unsupported"` with a visible warning; provided block IDs are resolved against the approved snapshot and unknown blocks are rejected.
  - Optimistic concurrency: every mutation carries `expectedRevision` matched against the working set's `revision`; conflicts return 409. `revision` increments on each mutation; set revisions start at 0.
  - Reordering validates that the submitted ids are exactly the draft's objective ids and updates `order` in place, preserving ids and citation links.
  - `confidence` for teacher-authored objectives is stored as `1` (teacher-authored); `verb` is required on create/update.
- **Deviations from story/technical guide:** None material. The guide's `POST /projects/{id}/objective-generations` surface is already implemented as `POST /projects/:id/objectives/generate` (ST-044); ST-045 adds the guide's `PATCH /objectives/{objectiveId}`, `POST /objectives/reorder`, and `POST /objectives/approve`, plus create/delete for the story's CRUD requirement. `learningObjectiveSetSchema` now allows an empty objective list (approval still requires ≥1) so a draft can be emptied during editing.
- **Known risks or follow-up:**
  - Production model provider adapter + pricing remain unconfigured (ST-044 M1 follow-up, tracked for ST-071).
  - Postgres-backed integration coverage (`objectives-editor.integration.test.ts`) is included but runs only under `TEST_DATABASE_URL`; locally it is skipped.
  - The e2e source-upload spec is flaky on this machine on the baseline and is unrelated to ST-045.
  - ST-046 (outline generation) will consume the approved objective set (`status = 'approved'`); the outline linking contract will reference approved objective ids.

### Review fixes (2026-08-17)

Review findings addressed after the initial In Review handoff:

- **Reorder unique-index safety:** `reorder` now applies a two-phase ordering (`applyObjectiveOrders`) that first negates every objective's order and then assigns the final positive orders, so a swap/rotation never transiently violates the non-deferrable `learning_objectives_set_order_unique` index. `renumberObjectives` (after remove) uses the same helper. Unit tests plus a new Postgres-gated integration test cover swaps and tenant rejection.
- **Clone-on-edit serialization:** `mutableDraftSet` now locks the approved set row (`FOR UPDATE`) and re-checks for a competing draft before cloning, so concurrent first-edits of an approved set cannot create duplicate drafts. A serialization unit test covers the race.
- **Approve concurrency guard:** `approve` now locks the draft row, includes `revision = expectedRevision` in the status update, and verifies the affected row before proceeding.
- **Regeneration candidate semantics:** the worker no longer supersedes prior drafts when a new candidate is persisted (regeneration preserves the current approved/draft version until the teacher approves a candidate); `approve` supersedes all other sets at selection time. The worker test now asserts no supersede-on-persist, and a service test verifies the approved set is preserved until approval.
- **Cross-user route tests:** added "other tenant" 404 tests for update/remove/reorder/approve.
- **Dead code:** removed the unused `objectiveEditHeaders` web helper.

### Review approval (2026-08-17)

Approved for Done by human review. Accepted follow-ups (tracked in the review):

- `approve` does not yet reject while a generation job is in-flight (UI gates it via `canApprove`; a direct API call or narrow race could supersede a just-generated candidate). Track with ST-046 or the next editor story.
- Strengthen real-Postgres integration coverage of approve's supersede-all (prior approved set superseded on new approval).
- Server-side enforcement of the approve-in-flight guard (mirror `canApprove`).
