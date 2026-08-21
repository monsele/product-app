---
story_id: ST-051
title: "Regenerate One Storyboard Scene Without Altering Neighboring Teacher Edits"
phase: "04 \u2014 AI Planning and Grounding"
status: Done
priority: must-have
epics: ["E10"]
prd_user_stories: ["E10-US2"]
depends_on: ["ST-050", "ST-049"]
---

# ST-051 — Regenerate One Storyboard Scene Without Altering Neighboring Teacher Edits

## Story

As a teacher, I want to regenerate one weak scene while preserving every other scene.

## Outcome

A scene-level generation action uses local context, supported templates, source evidence, and optimistic concurrency to create a replacement candidate.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E10-US2
- `docs/reference/epic-technical-implementation-guide.md` — E10 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-050
- ST-049

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Define scene regeneration request options such as improve visual choice, simplify, shorten, or regenerate.
- [ ] Build context from the selected scene, neighboring scenes, objective/outline links, narration, and relevant source package.
- [ ] Generate and validate one SceneSpec only.
- [ ] Resolve citations and generated additions.
- [ ] Create a candidate replacement with before/after comparison.
- [ ] Apply the replacement atomically if the storyboard revision has not changed.
- [ ] Invalidate only that scene's dependent preview/assets/audio when narration or bindings change.

## Technical Implementation Requirements

- Other scenes must remain byte-equivalent except for lesson-level revision/hash metadata.
- The model cannot return a full LessonSpec for this operation.
- Existing teacher edits are never overwritten silently.
- Use scene and storyboard revision in the idempotency/input version.
- Neighbor context is read-only.

## Contracts and Persistence

- Scene regeneration job.
- Scene candidate/replacement command.
- Scene diff metadata.

## Interfaces

- `POST /projects/:id/scenes/:sceneId/regenerate`.
- `POST /projects/:id/scenes/:sceneId/apply-candidate`.
- Scene comparison UI.

## Acceptance Criteria

- [ ] Only the selected scene changes after applying a candidate.
- [ ] The candidate validates against a supported template schema.
- [ ] Neighbor context improves continuity without being modified.
- [ ] A stale storyboard revision blocks candidate application.
- [ ] Citations and dependent stale markers update correctly.

## Required Tests

- [ ] Scene isolation test.
- [ ] Stale apply test.
- [ ] Schema/citation tests.
- [ ] Dependency invalidation test.
- [ ] Job/idempotency test.
- [ ] UI comparison test.

## Out of Scope

- Multi-scene regeneration.
- Automatic application without teacher review.

## Story-Specific Notes

- Technical guide references: E10 and E12.

## Implementation Checklist

- [ ] Inspect the current repository and related completed stories.
- [ ] Write a short implementation plan listing files, contracts, migrations, tests, and risks.
- [ ] Implement only this story's scope.
- [ ] Add or update schemas before changing consumers.
- [ ] Add authorization, validation, error, retry, concurrency, and idempotency behavior where applicable.
- [ ] Add structured logs, correlation, audit, and usage records where applicable.
- [ ] Run the required automated tests and affected workspace quality commands.
- [ ] Self-review the diff for scope creep, insecure access, stale data races, and unbounded provider calls.
- [ ] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [ ] Every acceptance criterion is implemented and verified.
- [ ] Every required test is implemented and passing.
- [ ] `lint`, `typecheck`, `test`, and `build` pass for all affected workspaces.
- [ ] Database migrations and compatibility notes are complete where applicable.
- [ ] Public schemas, events, and endpoints are documented.
- [ ] No unresolved tenant-isolation, security, idempotency, concurrency, data-loss, or cost-control defect remains in this scope.
- [ ] No out-of-scope feature or unrelated refactor was added.
- [ ] The Dev Agent Record is complete.
- [ ] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:** Kilo (deepseek-v4-flash) — `next-story` skill
- **Started:** 2026-08-20
- **Completed:** 2026-08-20 (approved, marked Done)
- **Branch/PR:** `story/st-051` (local only; no PR opened)
- **Files changed:**
  - `packages/schemas/src/index.ts` — ST-051 scene regeneration contracts (`sceneRegenerationModeSchema` improve-visual/simplify/shorten/regenerate, `sceneRegenerationInputSchema`, `sceneRegenerationParamsSchema`, `sceneRegenerationOutputSchema` (`scene-regeneration-v1` wrapping a single `storyboardSceneOutputSchema`), `sceneRegenerationResponseSchema`, `sceneCandidateDecisionInputSchema`, `sceneCandidateSchema` with before/after scenes, `sceneCandidateStatusSchema`, `sceneRegenerationCompatibilitySchema`/`currentSceneRegenerationCompatibility = scene-regeneration@v1`, `sceneRegenerationMaximumActiveCandidates = 5`); `storyboardResponseSchema` extended with `latestSceneRegenerationJob` + `sceneCandidates`.
  - `packages/schemas/src/storyboard.test.ts` — 13 scene-regeneration schema tests (modes, params, output, candidate, response, response with candidates).
  - `packages/database/src/schema.ts` — `scene_candidates` table (tenant-unique idempotency key per scene, before/after scene JSON, scene revision, model-call link, audit columns), audit event types `storyboard.scene_candidate_accepted`/`_rejected`.
  - `packages/database/drizzle/0037_exotic_salo.sql` + `meta/_journal.json` + `meta/0037_snapshot.json` + `0037_exotic_salo.compatibility.md` — migration.
  - `packages/provider-adapters/src/prompts/scene-regeneration/v1.ts` — real grounded one-scene regeneration prompt (current scene, read-only neighbors, narration blocks, outline, source package, mode/instruction; preserves narration-block assignment; registered in `prompts/index.ts`).
  - `packages/provider-adapters/src/prompts.test.ts` — scene-regeneration prompt fixture/render tests (4 modes).
  - `apps/pipeline-worker/src/scene-regeneration-job.ts` — new `storyboard.scene-regenerate` job (new file): tenant-scoped context load (draft lesson spec + revision, scene by stable scene id + lesson spec, scene revision, narration-set content-hash binding, neighbors, narration blocks, outline), deterministic checks (mode match, narration-block assignment unchanged, grounding, citation resolution, duration bounds), idempotent candidate persistence (before/after scenes), terminal error codes (`LESSON_SPEC_REVISION_MISMATCH`, `SCENE_REVISION_MISMATCH`, `NARRATION_SET_MISMATCH`, etc.).
  - `apps/pipeline-worker/src/scene-regeneration-job.test.ts` — 18 tests (checks, context loading, idempotent persistence, full job lifecycle, deterministic failure).
  - `apps/pipeline-worker/src/runtime.ts` — registers the handler under the shared `ai.scene_regeneration` quota (20/hr).
  - `apps/api/src/storyboard.ts` — `PostgresStoryboardService` gains `regenerateScene` (idempotency-key validation, draft storyboard + scene gates, pending-candidate cap, narration binding check, outbox + `ai.generated` audit), `applySceneCandidate` (optimistic concurrency on lesson-spec + scene revision, atomic payload + `scenes` row replacement, revision bump, content-hash recompute, candidate accepted, invalidation-scope audit), `rejectSceneCandidate`; `current()` loads `sceneCandidates` + `latestSceneRegenerationJob`.
  - `apps/api/src/storyboard-scene-regeneration-service.test.ts` — 14 service tests (queueing/idempotency/cap, apply isolation, stale apply/reject, non-pending rejection).
  - `apps/api/src/storyboard.test.ts` — route tests for regenerate/apply/reject + tenant/origin isolation (5 new).
  - `apps/api/src/app.ts` — routes `POST /projects/:id/scenes/:sceneId/regenerate` (202), `POST .../apply-candidate`, `POST .../reject-candidate` + `readCandidateId` guard + unavailable-service stubs.
  - `apps/web/app/workspace/[projectId]/storyboard/` — per-scene regenerate controls (mode select), before/after candidate comparison, apply/reject buttons, in-flight states; `storyboard-input.ts` helpers (`sceneRegenerationModeLabel`, `sceneCandidateStatusLabel`, `sceneRegenerationFailureMessage`) + tests.
  - `e2e/workspace-mock-api.mjs` — scene regeneration + candidate endpoints.
  - `e2e/storyboard.spec.ts` — 2 new Playwright tests (regenerate scene, candidate apply comparison).
  - `STORY_INDEX.md` — ST-051 row to Done.
- **Migrations:** `0037_exotic_salo` — `scene_candidates` table, audit event types `storyboard.scene_candidate_accepted`/`_rejected`.
- **Contracts changed:**
  - New jobType `storyboard.scene-regenerate` (operationType `ai.scene_regeneration`, outbox event `storyboard.scene_regenerate_requested.v1`, prompt `scene-regeneration@v1`).
  - Public schemas: `SceneRegenerationMode`, `SceneRegenerationInput/Params/Output`, `SceneCandidate`, candidate decision input, `SceneRegenerationResponse`; `StoryboardResponse` extended with `sceneCandidates` + `latestSceneRegenerationJob`.
  - New DB table `scene_candidates` (tenant-scoped); new audit event types.
- **Commands/tests run:**
  - `pnpm --filter @avlp/schemas lint/typecheck/test/build` — 199 passed.
  - `pnpm --filter @avlp/database db:generate`, `lint/typecheck/test/build` — 8 passed, 3 skipped (integration).
  - `pnpm --filter @avlp/provider-adapters lint/typecheck/test/build` — 37 passed.
  - `pnpm --filter @avlp/pipeline-worker lint/typecheck/test/build` — 152 passed, 20 skipped (integration).
  - `pnpm --filter @avlp/api lint/typecheck/test/build` — 277 passed, 61 skipped (integration).
  - `pnpm --filter @avlp/web lint/typecheck/test/build` — 56 passed; `next build` compiles `/workspace/[projectId]/storyboard`.
  - `pnpm exec playwright test e2e/storyboard.spec.ts` — 4 passed. Full e2e: 29 passed, 6 pre-existing failures in `ingestion-review.spec.ts`/`workspace.spec.ts` confirmed failing on the pre-ST-051 baseline (unrelated/environmental).
- **Screenshots or representative output:** Playwright storyboard spec passes scene regenerate, before/after comparison rendering, and candidate apply against the mock API; `next build` lists the storyboard route.
- **Decisions and assumptions:**
  - Scene regeneration is candidate-based: the teacher compares before/after and explicitly applies or discards; nothing is auto-applied (out of scope).
  - The model returns exactly one scene (`scene-regeneration-v1`), never a full LessonSpec. Its `narrationBlockIds` must equal the current scene's assignment (deterministic check), so narration coverage invariants are preserved by construction.
  - Applying a candidate replaces only the selected scene's payload entry and `scenes` row, bumps the lesson-spec and scene revisions, and recomputes the storyboard content hash. All other scenes remain byte-equivalent.
  - Optimistic concurrency via `expectedRevision` (lesson spec) + `expectedSceneRevision` (scene); a stale storyboard or scene revision returns 409 and blocks application. The job re-verifies revisions and the narration-set content-hash binding at run time.
  - Paid regeneration reuses the `ai.scene_regeneration` quota (20/hr) with explicit idempotency keys, model-call records, usage metering, and `ai.generated` audit events.
  - Dependency invalidation follows the derived-hash + audit-invalidation-scope policy from ST-049: the apply audit event records `invalidatedScope: ["preview", "assets", "audio", "validation", "render"]`; no downstream artifact tables exist yet, so no automatic invalidation jobs run.
  - `POST /projects/:id/scenes/:sceneId/apply-candidate` (the story's interface) is implemented; a matching `reject-candidate` endpoint mirrors ST-049's accept/reject lifecycle. The storyboard service's `current()` now returns `sceneCandidates` and `latestSceneRegenerationJob`.
- **Deviations from story/technical guide:**
  - Guide E12 proposes candidate routes under `/scenes/{sceneId}`; the story's Interfaces specify `POST /projects/:id/scenes/:sceneId/regenerate` and `.../apply-candidate`, which were implemented (plus `reject-candidate`).
  - Scene candidates are persisted in a dedicated `scene_candidates` table rather than a generic `draft_operations`/diff table, matching the ST-049 candidate pattern and providing before/after JSON for the comparison UI.
  - Scene regeneration preserves the scene's allocated `durationSeconds` (narration unchanged) while the model's `estimatedSeconds` must stay within the scene bounds; this keeps the lesson timeline stable across single-scene edits.
- **Known risks or follow-up:**
  - The worker validates structural scene limits and citations but not font-metric overflow; the review/preview layer (`@avlp/scene-library`) catches layout overflow later, consistent with ST-050.
  - A small race remains between the pending-candidate cap check in the API and the job's idempotent insert; a concurrent burst can transiently exceed the cap by one (mitigated by the unique key), mirroring the ST-049 known risk.
  - Real provider outputs may need the bounded repair/retry path tuned; deterministic checks assume the model preserves the narration-block assignment and cites source blocks.
