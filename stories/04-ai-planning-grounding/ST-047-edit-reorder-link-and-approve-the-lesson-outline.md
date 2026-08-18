---
story_id: ST-047
title: "Edit, Reorder, Link, and Approve the Lesson Outline"
phase: "04 \u2014 AI Planning and Grounding"
status: Done
priority: must-have
epics: ["E8", "E20"]
prd_user_stories: ["E8-US2", "E20-US1"]
depends_on: ["ST-046"]
---

# ST-047 — Edit, Reorder, Link, and Approve the Lesson Outline

## Story

As a teacher, I want to change outline titles, descriptions, order, and objective links before narration is generated.

## Outcome

A revision-aware outline editor supports CRUD, drag ordering, objective mapping, duration recalculation, and immutable approval.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E8-US2, E20-US1
- `docs/reference/epic-technical-implementation-guide.md` — E8, E20 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-046

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [x] Implement outline item add/edit/delete/reorder operations.
- [x] Allow linking each item to one or more approved objectives.
- [x] Recalculate duration totals and show under/over target warnings.
- [x] Require structural validity and objective coverage before approval.
- [x] Implement approve command creating an immutable outline revision.
- [x] Display citations and source drill-down links.
- [x] Use optimistic concurrency and audit approval.

## Technical Implementation Requirements

- Narration generation reads only an approved outline revision.
- Editing an approved outline creates a new draft.
- Deleting an item cannot silently leave an objective uncovered.
- Order is persisted with stable item IDs.

## Contracts and Persistence

- Outline draft/approved revision.
- Ordering and objective-link updates.
- Approval snapshot.

## Interfaces

- Outline CRUD/reorder/link endpoints.
- `POST /projects/:id/outline/approve`.
- Outline editor UI.

## Acceptance Criteria

- [x] Teachers can edit, add, delete, and reorder outline items.
- [x] Objective links and total duration update immediately after save.
- [x] Approval is blocked for invalid structure or uncovered objectives.
- [x] Approved outline is immutable and used by narration generation.
- [x] Concurrent stale edits show a conflict.

## Required Tests

- [x] CRUD/order tests.
- [x] Coverage guard tests.
- [x] Duration recalculation tests.
- [x] Approval immutability test.
- [x] API authorization/concurrency tests.
- [x] Drag-and-drop Playwright test.

## Out of Scope

- Narration generation.
- Scene planning.
- Automatic prerequisite lessons.

## Story-Specific Notes

- Technical guide references: E8 and approval state machine.

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
- [x] This story and `STORY_INDEX.md` are marked **Done** (approved by human review on 2026-08-18).

## Dev Agent Record

- **Agent:** Kilo (deepseek/deepseek-v4-flash:discounted)
- **Started:** 2026-08-18
- **Completed:** 2026-08-18 (handed to review as In Review)
- **Branch/PR:** `story/st-046` working tree (local; no new branch or PR published).
- **Files changed:**
  - `packages/schemas/src/index.ts` — ST-047 contracts: `outlineItemCreateInputSchema`,
    `outlineItemUpdateInputSchema`, `outlineItemRemoveInputSchema`,
    `outlineReorderInputSchema` (duplicate-id guard), `outlineApproveInputSchema`,
    `outlineDurationStatusSchema`, `outlineValidationSchema`, and `outlineResponseSchema`
    now carries a required `validation` object (`structurallyValid`, `durationStatus`,
    `durationWarning`, `uncoveredObjectiveIds`, `structureWarning`);
    `packages/schemas/src/outline.test.ts` (+11 editor/validation tests).
  - `packages/database/src/schema.ts` — audit event enum gains `outline.edited` and
    `outline.approved`; migration `0033_needy_black_panther.sql`.
  - `apps/api/src/outline.ts` — `PostgresOutlineService` now implements `add`, `update`,
    `remove`, `reorder`, and `approve`; working-draft resolution with clone-on-edit of an
    approved set (`mutableDraftSet`/`cloneApprovedToDraft`, serialized via `FOR UPDATE`),
    optimistic concurrency via `expectedRevision`, objective-link validation against the
    bound approved objective set, source-block resolution against the approved snapshot
    (reusing `resolveSnapshotSourceRefs`), two-phase reorder/renumber, duration
    recomputation, structural + coverage approval guards (`assertApprovable`), approval
    supersedes all prior sets and advances the project stage `outline_review →
    narration_storyboard_review`, `outline.edited`/`outline.approved` audit events, and
    `current()` now computes `validation` and a coverage-aware `canApprove`.
  - `apps/api/src/app.ts` — routes `POST /projects/:id/outline/items`,
    `PATCH /projects/:id/outline/items/:itemId`, `DELETE /projects/:id/outline/items/:itemId`,
    `POST /projects/:id/outline/reorder`, `POST /projects/:id/outline/approve`; unavailable
    service stub extended.
  - `apps/api/src/outline-editor.test.ts` — new service test file: CRUD, link replacement,
    citation resolution, reorder id/citation preservation, approval guards (uncovered
    objective, uncited non-hook, uncited hook, empty outline), supersede + stage advance,
    clone-on-edit serialization, audit events, and `current` validation (26 tests).
  - `apps/api/src/outline.test.ts` — route authz/origin/validation tests for the five new
    endpoints; mock service now implements the full interface and returns `validation`.
  - `apps/api/src/outline.integration.test.ts` — Postgres-gated editor describe block:
    add/update/reorder/remove lifecycle, approved-set link rejection, uncovered-objective
    approval block, approve + supersede + stage advance, tenant rejection.
  - `apps/web/app/workspace/[projectId]/outline/outline-panel.tsx` — full outline editor:
    item add/edit/delete, move up/down plus HTML5 drag-and-drop reorder, objective-link
    checkboxes (labels from the approved objectives endpoint), source citations with
    drill-down links to the review page, validation warnings, duration summary,
    approve button, approved snapshot display.
  - `apps/web/app/workspace/[projectId]/outline/outline-input.ts` + test — duration status
    label and validation-warning helpers.
  - `e2e/outline.spec.ts` — Playwright editor tests (display, add, drag-and-drop reorder,
    stale-save 409, approve); `e2e/workspace-mock-api.mjs` — outline endpoints in the mock
    API and pre-seeded approved objectives so the panel can render link checkboxes.
  - `STORY_INDEX.md` and this story — status transitions.
- **Migrations:** `0033_needy_black_panther` (adds `outline.edited` and `outline.approved`
  to the `audit_event_type` enum). No new tables; ST-046's `lesson_outline_sets`/items/links
  already carried `status` (draft/approved/superseded), `revision`, and `idempotencyKey`.
- **Contracts changed:** New editor input schemas listed above; `outlineResponseSchema`
  gained a required `validation` field; new API endpoints
  `POST /projects/:id/outline/items`, `PATCH/DELETE /projects/:id/outline/items/:itemId`,
  `POST /projects/:id/outline/reorder`, `POST /projects/:id/outline/approve`; two new
  audit event types.
- **Commands/tests run:**
  - Per-workspace `lint`, `typecheck`, `test`, `build` for `@avlp/schemas` (125 tests),
    `@avlp/database` (8 pass, 3 skip), `@avlp/api` (189 pass, 61 skip — Postgres
    integration requires `TEST_DATABASE_URL`), `@avlp/web` (37), `@avlp/pipeline-worker`
    (67 pass, 20 skip).
  - Repository-wide `pnpm lint` (16/16), `pnpm typecheck` (16/16), `pnpm build` (16/16).
  - `npx playwright test e2e/outline.spec.ts` — 5/5 passed (including drag-and-drop).
  - `pnpm --filter @avlp/evals eval` — `"passed": true`.
  - `git diff --check` — clean.
- **Screenshots or representative output:** Playwright verifies the draft editor, teacher
  item add (order append + `generated: false`), HTML5 drag-and-drop reorder, 409 on stale
  saves, and approval flow; API service tests verify clone-on-edit preserves item ids and
  links, reorder preserves citations, approval blocks uncovered objectives and uncited
  non-hook items, supersedes prior sets, and advances the project stage.
- **Decisions and assumptions:**
  - Working set = latest `draft` outline set; if none, the latest `approved` set. Editing
    an approved set clones it into a new draft revision so the approved snapshot used by
    narration stays immutable (guide 5.3); clone-on-edit is serialized on the approved row
    (`FOR UPDATE` + re-check) so concurrent first-edits cannot create duplicate drafts.
  - Draft edits mutate the draft's item rows in place, bump the item `revision`, and bump
    the set `revision`; every mutation carries `expectedRevision` and conflicts return 409.
  - Approval blocks when the outline is empty, exceeds 20 items, any item has no objective
    links, a non-hook item has no source refs, an uncited hook has no framing note, or an
    approved objective is uncovered. Duration under/over target and a missing hook or
    summary are surfaced as non-blocking warnings (`durationWarning`, `structureWarning`).
    This matches the guide's "block approval if any objective is uncovered" and "warn if
    sequence lacks hook or summary"; the generated-path citation rule ("non-hook items must
    cite source blocks") is enforced on teacher edits at approval time via the structural
    check, and the editor exposes a source-block ID field so teacher items can cite blocks.
  - Approval marks the draft `approved`, supersedes all other sets for the tenant/project,
    writes `outline.approved`, and advances the project stage `outline_review →
    narration_storyboard_review` (the narration/storyboard stage consumes the approved set
    in ST-048).
  - Duration totals are recomputed from `estimatedSeconds` after every item mutation and
    persisted on the set; the ±10% tolerance reuses `outlineDurationToleranceRatio`.
  - Objective links are validated against the outline set's bound approved objective set
    (`objectiveSetId`); duplicates are deduplicated on insert, and unknown objective ids
    are rejected with `validation_failed`.
  - Source drill-down links point at the ingestion review page
    (`/workspace/:projectId/review`); the review viewer does not yet support deep-linking to
    a specific section, so the link is the landing affordance for this MVP.
  - No paid provider calls, quota, or idempotency-key requirements apply to editor
    mutations (they are bounded local writes with optimistic concurrency), mirroring the
    ST-045 objectives editor.
- **Deviations from story/technical guide:** None material. The guide's
  `POST /projects/{id}/outline/items` surface is implemented as the story's
  `POST /projects/:id/outline/items`; `PATCH/DELETE /outline/items/{itemId}` and
  `POST /outline/reorder` follow the ST-045 objectives-editor conventions. Approval blocks
  on teacher-item citation absence (guide: "require every non-decorative item to map to
  one or more objectives and source blocks") rather than treating it as a warning, which
  is stricter than the minimum the story requires.
- **Review corrections (applied 2026-08-18):**
  - **HIGH fixed — item kind editing:** `outlineItemUpdateInputSchema` now accepts `kind`
    and `PostgresOutlineService.update` persists it; every UI edit previously failed with
    400 `validation_failed` because the strict schema rejected the `kind` field the panel
    always sends. Added schema test, service test, and a Playwright edit step.
  - **MEDIUM fixed — approve during in-flight generation:** `approve` now rejects with 409
    while the latest `outline.generate` job is `queued`/`running`/`retry_wait` (checked
    inside the transaction via the refactored `latestGenerationJob(..., executor)`),
    mirroring the `canApprove` gate. Added a service test.
  - **MEDIUM fixed — e2e mock regression:** the startup pre-seed of approved objectives was
    removed; `outlineResponse` now lazily seeds approved objectives only for outline flows,
    the outline panel fetches approved objectives only after the outline response resolves,
    and the mock CORS preflight now allows `PATCH`/`DELETE` and `idempotency-key` (a latent
    mock bug exposed by the new browser PATCH test). `e2e/objectives.spec.ts` assertion was
    scoped to the draft region so it stays deterministic even when specs run in parallel
    against the shared mock server. Both spec files pass with `--workers=2`.
  - **LOW fixed — concurrent add ordering:** `mutableDraftSet` now locks the draft row
    (`latestDraftRowForUpdate`), serializing concurrent item mutations so a raw
    `(set_id, order)` unique-index violation surfaces as a clean 409 conflict instead of a
    500. Added a concurrent-add test.
  - Re-verified after corrections: schemas 126, api 192 (+61 Postgres-gated), web 37 tests
    pass; `pnpm --filter` lint for schemas/api/web/database clean; `pnpm --filter
    @avlp/database build` and `@avlp/web build` pass; `npx playwright test
    e2e/objectives.spec.ts e2e/outline.spec.ts --workers=2` → 10/10 pass.
- **Known risks or follow-up:**
  - The `scene-library` Remotion render tests time out under turbo parallel load on this
    machine (documented ST-046 flake); they pass 53/53 in isolation. Unrelated to ST-047.
  - Postgres-backed integration coverage for the editor runs only under `TEST_DATABASE_URL`
    and is skipped locally.
  - The review viewer has no section deep-link yet; citation drill-down lands on the review
    page root. ST-052 (scene source citations) may add targeted deep links.
  - ST-048 (narration generation) will consume only `status = 'approved'` outline sets;
    the superseded/approved transitions implemented here are the contract it relies on.
