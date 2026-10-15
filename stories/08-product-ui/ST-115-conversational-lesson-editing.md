---
story_id: ST-115
title: "Add Conversational Editing to the Storyboard Workspace"
phase: "08 — Product UI"
status: Done
priority: should-have
epics: ["E9", "E12", "E15", "E21"]
prd_user_stories: ["E9-US1", "E12-US2", "E12-US4", "E15-US1", "E21-US2"]
depends_on: ["ST-049", "ST-051", "ST-056", "ST-080", "ST-111"]
---

# ST-115 — Conversational Lesson Editing

## Story

As a teacher reviewing a storyboard, I want to type requests such as "make
scene 3 simpler", "slow down the transition into the summary" or "use a
gentler tone across the whole lesson", and keep refining in a conversation, so
that I can direct changes in plain language without finding the right form
field or regeneration mode for each one.

## Background

The building blocks exist, but only as one-shot, one-target actions:

- Scene regeneration (ST-051): `POST :projectId/scenes/:sceneId/regenerate`
  with a mode (`improve-visual`, `simplify`, `shorten`, `regenerate`) and an
  optional 500-character `instruction`, then `apply-candidate` /
  `reject-candidate` after a before/after comparison.
- Narration block regeneration (ST-049): `POST
  :projectId/narration-blocks/:blockId/regenerate`, then candidate accept or
  reject.
- Schema-driven field editing (ST-056): title, narration, on-screen text,
  `durationSeconds`, transition and visual fields, plus scene reorder (E12-US2).

There is no thread, no memory of earlier requests, and no way to address
several scenes or the whole lesson at once. This story adds a conversation
layer that **plans** changes using those existing operations. It adds no new
way to mutate a lesson.

## Outcome

- An "Ask for changes" panel in the storyboard workspace. It is scoped to the
  selected scene by default, and the teacher can switch it to selected scenes
  or the whole lesson.
- Each teacher message makes one metered `ai.edit-plan` call. The call
  returns a **change plan**: an ordered list of operations from a closed set,
  each with a one-line, teacher-facing rationale:
  - `regenerate-scene` (sceneId, mode, instruction ≤ 500) → ST-051 job
  - `regenerate-narration-block` (blockId, instruction) → ST-049 job
  - `edit-scene-field` (sceneId, path from editor metadata, value) → ST-056
    patch, validated against the template's field limits
  - `reorder-scenes` (new order of existing IDs)
  - `answer-only`: no change, for questions or for requests that cannot be met.
    The reason is stated, e.g. "Scene 4 can't be 8 s: its narration measures
    14 s (ADR-004). Shorten the narration instead?"
- The plan is shown as a proposal. **Nothing changes until the teacher
  applies it**, either all at once or item by item. Generated operations open
  the existing before/after candidate review. Field edits show a diff.
- Every operation carries the storyboard `expectedRevision` it was planned
  against. A stale plan is refused with a "re-plan" action, never applied over
  newer edits.
- **Undo last applied turn**: restores the revision recorded before that turn,
  but only while the storyboard revision is unchanged since.
- Threads persist per project and reload. Earlier turns (the last 10) are
  passed as context, so "make it shorter again" resolves against the previous
  change.

## Scope

- [x] Schemas: `editPlanSchema` (closed operation union, ≤ 12 operations per
      plan, ≤ 8 distinct scenes per plan), `editThreadMessageSchema`. The
      `edit-scene-field` paths must come from `sceneEditorMetadata`.
- [x] Prompt `edit-plan/v1` in `provider-adapters`. Its inputs are the
      request, scope, scene summaries (template, title, on-screen text,
      duration, transition), editor field catalogue, measured narration
      durations and the last 10 turns. Source text goes only to the existing
      regeneration jobs, never to the planner. Never emits pixel coordinates,
      fonts or animation code.
- [x] Migration: `lesson_edit_threads`, `lesson_edit_messages` (role, text,
      plan JSON, applied operation IDs, before/after revision, status).
      Project-owned, tenant-scoped.
- [x] API: `GET/POST :projectId/edit-thread/messages` (Idempotency-Key
      required), `POST :projectId/edit-thread/plans/:planId/apply` (all or a
      subset), `POST :projectId/edit-thread/plans/:planId/undo`.
- [x] Apply step dispatches only to the existing services/jobs above.
      Generated operations are tracked until their candidates are ready.
- [x] UI panel per `docs/design.md`: thread, plan cards with rationale, apply
      / apply selected / dismiss, progress per operation, candidate review
      hand-off, undo, scope switcher, keyboard and screen-reader support.
- [x] Cost controls: every turn counts against generation quota (E21-US2),
      with a per-thread turn limit (`MAX_EDIT_TURNS_PER_HOUR`, default 20).

## Acceptance Criteria

- [x] AC1 "Make scene 3 simpler" with scene 3 selected yields a plan with one
      `regenerate-scene` (mode `simplify`). Applying it opens the existing
      before/after review, and rejecting it leaves the storyboard unchanged.
- [x] AC2 A whole-lesson request ("make every on-screen line shorter")
      yields field edits for at most 8 scenes and tells the teacher when more
      scenes were left for a follow-up turn.
- [x] AC3 A plan proposing a field path not in the template's editor
      metadata, or a value over its limit, is rejected server-side. The
      teacher sees "couldn't plan that change", never a partial apply.
- [x] AC4 A request that conflicts with measured narration timing returns
      `answer-only` with the reason and an alternative.
- [x] AC5 Applying a plan after the storyboard changed elsewhere returns 409
      with a re-plan action, and no operation runs.
- [x] AC6 Undo restores the exact pre-turn revision. It is refused after any
      later edit.
- [x] AC7 Reloading the page shows the full thread, including which plans
      were applied, partly applied, dismissed or undone.
- [x] AC8 Messages are never logged. Audit metadata records only message
      length and operation counts (same treatment as `focusPrompt`, ADR-013 §3).
- [x] AC9 A user without access to the project gets 404 on every thread
      endpoint.

## Required Tests

- [x] Unit: plan schema limits, field-path validation against editor
      metadata, operation-to-service mapping.
- [x] Prompt evaluation cases: single scene, multi-scene, whole lesson,
      timing conflict, ambiguous request (answer-only asking which scene),
      out-of-bounds request (layout coordinates).
- [x] Integration (Postgres): message → plan → apply → candidate accept;
      stale-revision 409; undo; idempotent replay of a message.
- [x] Authorization: cross-tenant thread access.
- [x] UI: plan card states, partial apply, keyboard flow, reduced motion.
- [x] E2E (Playwright, mocked provider): one full conversational edit through
      to preview.

## Out of Scope

- Editing after render. A finished MP4 is changed by editing the storyboard
  and re-rendering, as today.
- Changing the source document, objectives or outline through chat.
- Style pack, voice or sound-bed changes through chat.
- Voice input.
- Driving the one-shot runner from chat (a later story).
- Free-form layout instructions. The renderer owns layout, and the planner
  explains this with `answer-only`.

## Decisions for the product owner

- **Default scope.** Proposed: the selected scene, so whole-lesson changes
  are a deliberate switch.
- **Apply model.** Proposed: always propose, never auto-apply, even for
  simple field edits. This matches "review and edit every important
  AI-generated decision" (PRD objective 3).

## Dev Agent Record

- **Agent:** Claude Code (Opus 5.5).
- **Started:** 2026-10-15.
- **Completed:** 2026-10-15. Approved by the product owner on 2026-10-15
  after the code review and its fixes; status set to Done.
- **Branch/PR:** `feat/st115-conversational-editing`, branched from
  `feat/st114-animated-data-chart` at `85af11c` (ST-113 and ST-114 are not
  yet on `main`). Not pushed; no PR.
- **Files changed:**
  - Schemas (`packages/schemas/src/index.ts`, additive ST-115 section):
    `editThreadScopeSchema`, the closed `editPlanOperationSchema` union,
    `editPlanSchema` (≤ 12 operations, ≤ 8 distinct scenes, answer-only
    alone, no repeated or conflicting targets), `editPlanParamsSchema`,
    stored `editThreadPlanSchema`, `editThreadMessageSchema`,
    `editThreadResponseSchema`, message/apply/undo/dismiss inputs,
    `editTurnUndoSnapshotSchema`, `editPlanConflictDetailsSchema`,
    `plannableSceneFields`, `validateEditPlan`, `editPlanSceneEdits`,
    `currentEditPlanCompatibility` (`edit-plan/v1`), and `ai.edit-plan` in
    `modelCallOperationValues`.
  - Database: `schema.ts` (`lesson_edit_threads`, `lesson_edit_messages`,
    enum values), `edit-plan-context.ts` (tenant-scoped storyboard context
    shared by the worker and the API), migration `0072_lesson_edit_threads`
    with its compatibility note and journal entry.
  - Prompts and providers: `prompts/edit-plan/v1.ts`, the `edit-plan` prompt
    kind, the registry entry, the `storyboard.edit-plan` job envelope
    (language model only), and an edit-plan branch in the dynamic mock.
  - Config: `MAX_EDIT_TURNS_PER_HOUR` (API and worker, default 20).
  - Worker: `edit-plan-job.ts` (one metered `ai.edit-plan` call through
    `createModelCallGenerationHandler`, no deterministic repair round, plan
    stored on the assistant message, message marked failed when the job
    gives up), registered in `runtime.ts`.
  - API: `edit-thread.ts` (`PostgresEditThreadService`: list, post, apply,
    dismiss, undo; `editOperationTarget` mapping), `EditThreadController` and
    DI wiring in `app.ts`, `runtime.ts`, `storyboard.ts`
    (`restoreEditTurn` plus the shared `markSceneMediaStale` helper, which
    is behaviour-preserving for `updateScene`).
  - Web: `edit-thread-panel.tsx` (the "Ask for changes" panel and
    `EditPlanCard`), `edit-thread-input.ts` (helpers and API client),
    `storyboard-panel.tsx` (panel mounted at the top of the inspector),
    `storyboard.module.css`.
  - E2E: `e2e/edit-thread-mock.mjs`, `e2e/edit-thread.spec.ts`; the shared
    `workspace-mock-api.mjs` registers the new mock and now returns the
    `captions` scene status and `sceneRevision` the current contracts
    require (both were missing, so no storyboard scene list or detail parsed
    against the mock).
  - Tests: `packages/schemas/src/edit-thread.test.ts`,
    `apps/pipeline-worker/src/edit-plan-job.test.ts`,
    `edit-plan-job.integration.test.ts`, `apps/api/src/edit-thread.test.ts`,
    `edit-thread.integration.test.ts`, `edit-thread-panel.test.tsx`; pins
    updated in `prompts.test.ts` (prompt kinds) and `storyboard.test.ts`
    (fake service); the migration-lifecycle test in
    `database.integration.test.ts` gets a 30 s timeout (it applies the whole
    journal twice and passed 4.0 s alone, over the 5 s default under load).
- **Migrations:** `0072_lesson_edit_threads` (additive). New tables
  `lesson_edit_threads` (one per project) and `lesson_edit_messages`, both
  tenant-scoped; `usage_operation_type` gains `ai.edit-plan`;
  `audit_event_type` gains `edit_thread.message_posted`,
  `edit_thread.plan_applied`, `edit_thread.plan_dismissed` and
  `edit_thread.plan_undone`. Rollback notes are in the compatibility file.
- **Public contract changes:** new routes `GET/POST
  /projects/:projectId/edit-thread/messages` (POST requires Idempotency-Key,
  answers 202; GET returns one turn-aligned page, older pages via
  `?before=<earlierCursor>`) and `POST .../edit-thread/plans/:planId/{apply,dismiss,undo}`;
  new job `storyboard.edit-plan` (payload v2); new model-call operation
  `ai.edit-plan`; `StoryboardService.restoreEditTurn`. LessonSpec and
  NormalizedDocument are unchanged.
- **Commands/tests:**
  - `pnpm turbo typecheck`: 16/16 pass.
  - `pnpm turbo lint --continue`: 15/16 pass; the one failure is the known
    pre-existing `scene-library` `text-overflow.test.ts:55` unused `_title`.
  - `vitest run` with `TEST_DATABASE_URL` (Postgres on 5433), run per
    package with `--no-file-parallelism`: config 15, schemas 551, observability
    10, API 824/824 (83 files), web 378/378, provider-adapters 84 and
    database 15 after the two pin/timeout updates above.
  - Worker: 371 pass, 2 fail, all pre-existing or environmental:
    `duration-reconciliation.integration` expects 33 s and gets 34 s (ST-115
    does not touch reconciliation, and its shared-package changes are purely
    additive, 0 deleted lines), and the document ingestion/validation
    integration files stop on "Storage is temporarily unavailable" (no object
    storage configured for those tests).
  - ST-115 suites: schemas 14, worker unit 9 (including the six prompt
    evaluation cases), worker Postgres 4, API route/mapping 5, API Postgres
    11, web 9, all passing.
  - `npx playwright test e2e/edit-thread.spec.ts`: 2/2 pass (one conversational
    edit by keyboard with reduced motion through the candidate review to the
    updated scene; partial apply, undo and reload).
  - `npx playwright test e2e/storyboard-editor.spec.ts e2e/storyboard.spec.ts`:
    14 of 16 fail. These specs look for controls the 2026-10-06 premium UI
    pass renamed or moved ("Add scene" is now "Add"; "Regenerate storyboard"
    is in the More actions menu), so the failures are stale and not ST-115's.
  - `graphify update .` after the code changes.
- **Screenshots/output:** No screenshots. Example of a stored plan from the
  API Postgres test: `{ id: "op-1", operation: { type: "edit-scene-field",
  path: "title", value: "Vapour" }, display: { sceneOrder: 1, fieldLabel:
  "Title", before: "Evaporation" } }`; a stale apply returns 409
  `edit_conflict` with `details: { action: "re-plan", currentRevision: 1 }`.
- **Acceptance criteria evidence:**
  - AC1: worker evaluation case `edit-plan-v1-single-scene`; the API Postgres
    test applies the regeneration, which queues the ST-051 job and changes
    nothing; rejecting the candidate leaves the storyboard identical and
    accepting one applies it; E2E 1.
  - AC2: evaluation case `edit-plan-v1-whole-lesson` (8 edits,
    `remainingSceneIds` of 2, summary says so); UI note "2 more scenes were
    left for a follow-up request".
  - AC3: `validateEditPlan` unit cases; worker Postgres test (invalid path
    fails with no repair call and the message shows "couldn't plan"); API
    Postgres test (an invalid plan applied directly is refused before any
    write).
  - AC4: `duration_below_narration` unit case and evaluation case
    `edit-plan-v1-timing-conflict` (answer-only with the measured seconds and
    the shorten-the-narration alternative).
  - AC5: API Postgres test (409 with re-plan, no job queued, revision
    unchanged, plan still proposed); UI Re-plan action.
  - AC6: API Postgres tests (scenes, scene rows and order restored exactly;
    refused after a later edit; only the latest applied turn).
  - AC7: API Postgres reload test (partly applied, dismissed, undone, with
    request text and per-operation states); E2E 2 reloads the page.
  - AC8: audit metadata holds `messageLength`, scope and counts only (tested);
    the job payload carries ids only (tested); nothing logs message text.
  - AC9: route test (404 on all five endpoints for another user, service never
    called) and service-level cross-tenant test.
- **Decisions/assumptions:**
  - Planning is a queued, metered background job (like ST-110's visual
    plan), not a synchronous API call. The UI polls the thread while a
    message is planning or a generated operation is queued.
  - The job reads the teacher's text from the thread by message id, so it is
    never in the job payload. The planner never sees narration or source
    text.
  - "One metered call" per message: the job makes no repair completion of
    any kind (`maxRepairs: 0`, `maxDeterministicRepairs: 0`). A response over
    the plan limits is trimmed in code (`limitEditPlan`); a malformed one, or
    a plan that fails the deterministic check, fails as AC3's "couldn't plan
    that change".
  - Chat field edits cover text, textarea and select fields, the duration,
    and line lists that hold plain strings. `narration` is excluded (narration
    goes through ST-049, which keeps citations), as are `visual.kind`,
    graphs, chart pickers and structured lists. Every edited scene is
    re-parsed with the scene contract, so the template's own limits apply.
  - Apply order: one ST-056 edit per scene, then the reorder, then generated
    operations, each against the revision the previous step produced. A
    failure stops the run: if nothing applied, the plan returns to proposed
    and a conflict becomes the re-plan 409; otherwise the turn is partly
    applied. An atomic `proposed → applying` claim prevents double applies,
    and a replayed apply is a no-op.
  - `regenerate-narration-block` carries a `mode` (the ST-049 service
    requires one) and is offered only while the narration set is a draft.
  - Undo is the only new storyboard write path (`restoreEditTurn`). It reuses
    the storyboard service's own persist, scene-row sync, design carry-forward
    and media invalidation in one transaction, under `expectedRevision`. A
    turn with only generated operations has nothing to undo: its decision
    point is the candidate review.
  - A `dismiss` route was added; AC7 needs the dismissed state.
  - Idempotency: the request key is checked before the revision check, so a
    replay always returns the original turn, and again under the thread lock
    so two concurrent first deliveries plan once (tested).
  - No ADR. The feature reuses existing patterns (queued model-call job,
    dispatch to existing services, tenant-scoped tables) and changes no
    approved decision. Message text follows ADR-013 §3.
- **Deviations:**
  - The story names the operation `regenerate-narration-block (blockId,
    instruction)`; it also carries `mode`.
  - The planning call is asynchronous (202 plus polling) rather than inline.
  - The message → plan step is covered in two Postgres tests (worker: request
    to stored plan; API: post, apply, review, undo, conflict and tenancy),
    because the apps do not depend on each other.
  - Test infrastructure fixes outside the story's code: two missing contract
    fields in the shared E2E mock, and the migration-lifecycle timeout.
- **Known risks/follow-up:**
  - If the API process stops between claiming and finishing an apply, the
    message stays `applying`. There is no sweeper yet.
  - A partly applied turn cannot be resumed; the teacher asks again.
  - Audio reconciliation (ADR-004) bumps the revision, so it also makes undo
    unavailable, by design ("refused after any later edit").
  - The planner prompt was evaluated against the deterministic mock only. A
    paid evaluation against Together should be run deliberately before
    rollout.
  - The stale `storyboard.spec.ts` / `storyboard-editor.spec.ts` E2E specs and
    the `duration-reconciliation` 33/34 s expectation need their own fixes.
- **Code review fixes (2026-10-15):** the story code review found three
  medium and three low issues; five are fixed, one stays a follow-up.
  - Thread paging (medium): `list()` read every message while the response
    allowed 1,000, so a long thread would have failed every endpoint. The
    thread is now read in turn-aligned pages of 100 (`editThreadPageSize`)
    with `earlierCursor` and `GET ...?before=<seq>`; messages carry `seq`;
    undo eligibility is read across the whole thread; the panel adds "Show
    earlier requests" and merges pages (`mergeThreadMessages`).
  - Over-limit plans (medium, AC2): the model's response is parsed with the
    wider `editPlanOutputSchema` (≤ 60 operations) and trimmed by
    `limitEditPlan` to the first 8 scenes in storyboard order and 12
    operations, with every left-out scene in `remainingSceneIds`. The job now
    sets `maxRepairs: 0`, so one message is one provider completion.
  - Model text in job errors (medium): the `field_not_editable` message no
    longer echoes the model's path; check messages are authored from
    operation numbers and scene orders only.
  - Focus (low): the request field is read-only, not disabled, while sending,
    and focus returns to it after a send.
  - E2E evidence (low): the spec asserts the field keeps focus, that new
    thread items render without an entrance transform under reduced motion,
    and that the accepted change appears in the "Selected scene preview"
    player (the mock candidate now changes the definition term).
  - Not fixed: a paid evaluation of `edit-plan/v1` against Together needs the
    product owner's explicit approval to spend; the cases are still run
    against the deterministic mock only.
  - Tests added: `limitEditPlan` and safe-message cases (schemas), a ten-scene
    trimming case and a malformed-response single-call case (worker
    Postgres), a 130-message paging case (API Postgres), a cursor route case,
    a page-merge case (web).
  - Verification after the fixes: typecheck 16/16; lint clean except the
    known `scene-library` error; schemas 553, provider-adapters 84, web 379,
    API 825/826, worker 384/391; ST-115 suites all pass (schemas 16, worker
    9 + 6 Postgres, API 6 + 12 Postgres, web 10); E2E `edit-thread.spec.ts`
    2/2. The remaining failures are not ST-115's: the database lifecycle file
    and the worker document ingestion/validation files fail at setup under
    load or without object storage (the database file passes alone);
    `duration-reconciliation` is the pre-existing 33/34 s expectation; API
    `correlation.integration` fails because the Postgres container's clock
    runs about 2 s ahead of the host (outbox `available_at` is set by the
    database and compared with the host clock in
    `packages/jobs/src/repository.ts:440`).
