---
story_id: ST-050
title: "Generate a Valid LessonSpec Storyboard from Approved Narration"
phase: "04 \u2014 AI Planning and Grounding"
status: Done
priority: must-have
epics: ["E10"]
prd_user_stories: ["E10-US1"]
depends_on: ["ST-007", "ST-021", "ST-047", "ST-048", "ST-043", "ST-042"]
---

# ST-050 — Generate a Valid LessonSpec Storyboard from Approved Narration

## Story

As a teacher, I want AI to convert the approved lesson plan and narration into supported scene-by-scene visual decisions.

## Outcome

An asynchronous storyboard operation returns a validated LessonSpec draft with ordered scenes, template inputs, durations, assets, transitions, objective links, and citations.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E10-US1
- `docs/reference/epic-technical-implementation-guide.md` — E10 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-007
- ST-021
- ST-047
- ST-048
- ST-043
- ST-042

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Define storyboard generation input/output and prompt version.
- [ ] Provide the ten-template catalog with field limits and examples to the model.
- [ ] Generate ordered scenes with narration assignments, on-screen text, visual data, estimated duration, asset requirements, transitions, source refs, and generated additions.
- [ ] Allocate scene durations to match target lesson duration.
- [ ] Validate output against LessonSpec v1 and scene registry validators.
- [ ] Resolve source block IDs and reject unsupported templates/coordinates.
- [ ] Persist a storyboard draft and generation metadata.
- [ ] Expose start/status/result APIs and review route state.

## Technical Implementation Requirements

- The model selects structured templates; it never writes Remotion code.
- Pixel layout is owned by deterministic template code.
- Only approved outline/objectives and the selected narration revision are inputs.
- Invalid scenes are rejected before persistence.
- Missing asset requirements become planned slots, not invented public URLs.

## Contracts and Persistence

- Storyboard/LessonSpec draft record.
- Scene planning output.
- Storyboard generation job.

## Interfaces

- `POST /projects/:id/storyboard/generate`.
- `GET /projects/:id/storyboard`.
- Storyboard generation/review route.

## Acceptance Criteria

- [ ] The output is a valid LessonSpec with supported templates only.
- [ ] Scene durations sum within target tolerance.
- [ ] Every scene includes required narration, visual data, transition, and provenance fields.
- [ ] Objective coverage and narration assignment are complete.
- [ ] Invalid template or over-limit scene content cannot be saved.

## Required Tests

- [ ] Structured output and schema tests.
- [ ] Duration allocation tests.
- [ ] Template catalog/limit tests.
- [ ] Citation resolution tests.
- [ ] Objective/narration coverage tests.
- [ ] Job/API/idempotency tests.
- [ ] Evaluation cases for template suitability and visual variety.

## Out of Scope

- Storyboard editor operations.
- Asset generation.
- Audio and rendering.

## Story-Specific Notes

- Technical guide references: E10 and central LessonSpec principle.

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
- **Completed:** 2026-08-20 (marked In Review)
- **Approved:** 2026-08-20 — human reviewer approved after review-follow-up fixes; marked Done.
- **Branch/PR:** `story/st-050` (local only; no PR opened)
- **Files changed:**
  - `packages/schemas/src/index.ts` — ST-050 storyboard contracts (`storyboardSceneOutputSchema` ten-template discriminated union with narration-block assignment, `storyboardOutputV1Schema` (`storyboard-v1`) with grounding + duration-tolerance refinements, `storyboardGenerationParamsSchema`, `lessonStoryboardSceneSchema`, `lessonStoryboardSchema` (draft envelope with scenes/narration-block/asset-requirement binding, content hashes), `storyboardAssetRequirementSchema`, `storyboardTemplateCatalog` + entry schema, `storyboardGenerationCompatibilitySchema`/`currentStoryboardGenerationCompatibility = storyboard@v1`, job-status/queued-response schemas, `storyboardGenerationStateSchema`, `storyboardValidationSchema`, `storyboardResponseSchema`, `lessonSpecStatusSchema`, scene count/duration constants, `storyboardDurationToleranceSeconds`).
  - `packages/schemas/src/storyboard.test.ts` — 23 schema tests (catalog, scene output per template, output grounding/duration, lesson storyboard round-trip, params/responses, asset requirements, tolerance).
  - `packages/config/src/index.ts` — `computeLessonStoryboardSceneContentHash`, `computeLessonStoryboardContentHash` (canonical SHA-256, server-only).
  - `packages/config/src/index.test.ts` — 4 content-hash tests.
  - `packages/database/src/schema.ts` — `lesson_spec_status` enum, `lesson_specs` (tenant idempotency unique, narration/outline binding hashes, payload jsonb, content hash), `scenes` (stable scene id, order, template, duration, narration-block assignment, asset requirements, scene JSON).
  - `packages/database/drizzle/0036_dusty_ulik.sql` + `meta/_journal.json` + `meta/0036_snapshot.json` + `0036_dusty_ulik.compatibility.md` — migration.
  - `packages/provider-adapters/src/prompts/storyboard/v1.ts` — real grounded storyboard planner prompt (template catalog, narration blocks, outline, source package, configuration; shapes-only diagram guidance; no pixels/code).
  - `packages/provider-adapters/src/prompts.test.ts` — storyboard prompt fixture/render tests.
  - `apps/pipeline-worker/src/storyboard-job.ts` — new `storyboard.generate` job (new file): tenant-scoped context load (narration set + revision, bound approved outline with content-hash verification, outline objective links), `allocateStoryboardDurations` (exact target allocation within 3–60s bounds), `assertStoryboardDeterministicChecks` (target match, scene count, narration-block coverage exactly-once in order, grounding, citation resolution, outline coverage, reachable duration), idempotent `persistLessonStoryboard` (lesson_specs + scenes in one transaction), terminal error codes (`NARRATION_SET_REVISION_MISMATCH`, `OUTLINE_SET_HASH_MISMATCH`, etc.).
  - `apps/pipeline-worker/src/storyboard-job.test.ts` — 23 tests (allocator, deterministic checks, context loading, idempotent persistence, full job lifecycle, deterministic failure).
  - `apps/pipeline-worker/src/runtime.ts` — registers the handler under the shared `ai.storyboard` quota (20/hr).
  - `apps/api/src/storyboard.ts` — `PostgresStoryboardService` `generate` (idempotency-key validation, approved-source/config/narration gates, source-package narrowing to narration block IDs, outbox + `ai.generated` audit) and `current` (state from working/approved draft + latest job, staleness vs narration/config/outline, validation with uncovered outline items, unassigned blocks, duration status).
  - `apps/api/src/storyboard-service.test.ts` — 13 service tests.
  - `apps/api/src/storyboard.test.ts` — 5 route tests (owner access, cross-tenant 404, queue 202, tenant-forbidden, origin rejection).
  - `apps/api/src/app.ts` + `apps/api/src/runtime.ts` — `GET /projects/:id/storyboard`, `POST /projects/:id/storyboard/generate`, STORYBOARD_SERVICE symbol, unavailable stub, wiring.
  - `apps/web/app/workspace/[projectId]/storyboard/` — storyboard review page + panel (state, generate/regenerate, scene list with narration/duration/on-screen text/visual/asset requirements, stale and failure states), `storyboard-input.ts` helpers + tests.
  - `apps/web/app/workspace/page.tsx` — storyboard review link for `narration_storyboard_review`+ stages.
  - `e2e/workspace-mock-api.mjs` — storyboard state + GET/generate endpoints.
  - `e2e/storyboard.spec.ts` — 2 Playwright tests (draft scene display, regenerate keeps draft).
  - `STORY_INDEX.md` — ST-050 row to In Review.
- **Migrations:** `0036_dusty_ulik` — `lesson_spec_status` enum, `lesson_specs`, `scenes`.
- **Contracts changed:**
  - New jobType `storyboard.generate` (operationType `ai.storyboard`, outbox event `storyboard.generate_requested.v1`, prompt `storyboard@v1`).
  - Public schemas: `StoryboardOutputV1`, `LessonStoryboard`/`LessonStoryboardScene`, `StoryboardAssetRequirement`, `StoryboardTemplateCatalogEntry`, generation params, job status, `StoryboardResponse` (with `state`, `storyboard`, `approved`, `validation`), `StoryboardValidation`.
  - New DB tables `lesson_specs` and `scenes` (tenant-scoped); no public enum changes (reuses `ai.storyboard` usage operation and `ai.generated` audit event).
- **Commands/tests run:**
  - `pnpm --filter @avlp/config lint/typecheck/test/build` — pass (13 tests).
  - `pnpm --filter @avlp/schemas lint/typecheck/test/build` — 185 passed.
  - `pnpm --filter @avlp/database db:generate`, `lint/typecheck/test/build` — 8 passed, 3 skipped (integration).
  - `pnpm --filter @avlp/provider-adapters lint/typecheck/test/build` — 36 passed.
  - `pnpm --filter @avlp/pipeline-worker lint/typecheck/test/build` — 133 passed, 20 skipped (integration).
  - `pnpm --filter @avlp/api lint/typecheck/test/build` — 257 passed, 61 skipped (integration).
  - `pnpm --filter @avlp/web lint/typecheck/test/build` — 52 passed; `next build` compiles `/workspace/[projectId]/storyboard`.
  - `pnpm exec playwright test e2e/storyboard.spec.ts` — 2 passed. Related specs (narration, objectives, outline, lesson-configuration, health, video-design-preview) — 23 passed.
- **Screenshots or representative output:** Playwright storyboard spec shows the draft scene list, per-scene template/duration/narration-block assignment/on-screen text/visual/planned assets, and regenerate queueing against the mock API.
- **Decisions and assumptions:**
  - Scene narration text is derived from the assigned approved narration blocks (never invented by the model); the model only assigns narration block IDs and plans visuals, so spoken content is grounded by construction.
  - Scene `sourceRefs` are resolved from the model's `sourceBlockIds` against the approved snapshot; every scene must cite a source block or include a generated addition (schema + deterministic check).
  - Missing assets become `assetRequirements` (planned slots) stored on the scene, never invented asset bindings or public URLs; `assetBindings` stay empty until the asset catalog resolves them (ST-057/058).
  - Scene durations are allocated deterministically to the exact lesson target within [3, 60]s per scene; unreachable targets are rejected.
  - `POST /projects/:id/storyboard/generate` (the story's Interface) is used instead of the guide's `POST /projects/{id}/storyboard-generations`; `GET /projects/:id/storyboard` serves the review state.
  - The persisted draft is the `LessonStoryboard` envelope (validated scenes + metadata), not a strictly-valid full `LessonSpec`, because the `LessonSpec.voice` field cannot be populated until voice configuration lands (ST-062). Every scene IS validated against `sceneSpecSchema`; full LessonSpec assembly happens at versioning (ST-060).
  - Structural scene validation (discriminated union, field/item limits, template support) runs in the pipeline worker via the schemas contract; font-metric overflow and asset resolution remain preview/render-time checks in `@avlp/scene-library`, which the worker intentionally does not import (no React in the AI worker).
  - Storyboard generation requires an approved source, saved lesson configuration, an approved outline, and a working narration set (draft or approved; narration approval is deferred to a later story). The job re-verifies the bound approved outline content hash.
  - Paid generation reuses the `ai.storyboard` quota (20/hr) with explicit idempotency keys, model-call records, usage metering, and `ai.generated` audit events.
- **Deviations from story/technical guide:**
  - Guide E10 persistence proposes separate `scene_source_references`/`scene_asset_requirements` tables; this story normalizes scenes into `scenes` with `narration_block_ids` and `asset_requirements` jsonb columns (source refs live inside each scene's validated SceneSpec JSON), and stores the canonical draft in `lesson_specs.payload`.
  - The guide's `POST /projects/{id}/storyboard/approve` is not implemented: storyboard approval is out of ST-050 scope (editor operations are also out of scope; approval arrives with the editor stories).
  - Evaluation is met declaratively via the prompt registry's `evaluationCases` plus deterministic checks and schema/job tests, matching the established repository pattern.
- **Known risks or follow-up:**
  - The worker validates structural scene limits but not font-metric overflow; the review/preview layer (`@avlp/scene-library`) catches layout overflow later. The prompt steers the model to shapes-based diagrams and text summaries to avoid unresolvable asset-dependent visuals.
  - A re-approved outline or edited narration marks the draft stale; the teacher must regenerate (no auto-invalidation jobs exist yet, consistent with ST-049).
  - Narration approval does not exist yet, so the storyboard uses the current working narration set; when narration approval lands, `basedOnNarrationSetId` will point at the approved set.

## Review follow-up (2026-08-20)

Fixes applied in response to the product code review:

- **H1 — generated-additions-only scenes can now never be produced.** `storyboardSceneOutputSchema.sourceBlockIds` now requires `min(1)` (`packages/schemas/src/index.ts`), the output-schema grounding refine was removed in favor of the field constraint, the deterministic check rejects any scene without a citation (`apps/pipeline-worker/src/storyboard-job.ts` SCENE_UNGROUNDED), and the storyboard prompt requires citations with generated additions optional. Schema, worker, and persist-path tests updated (a scene grounded only by generated additions is rejected at schema, deterministic-check, and persist levels).
- **M1 — source-snapshot binding verified before generation.** `PostgresStoryboardService.generate` now rejects with 409 when the working narration set's `sourceSnapshotId` differs from the currently approved source snapshot (`apps/api/src/storyboard.ts`), mirroring the narration stage's `snapshot_mismatch` guard and preventing mixed-revision generation after a source re-approval. Service test added.
- **L1 — dead parameter removed.** `persistLessonStoryboard` no longer accepts an unused `snapshot` input.
- **L3 — deterministic persist failures are terminal.** `persistLessonStoryboard` converts schema-level build failures to a terminal `STORYBOARD_INVALID_FOR_PERSIST` error, and `apps/pipeline-worker/src/model-call.ts` preserves `JobExecutionError` thrown by persist hooks (previously every persist error was converted to retryable `CANDIDATE_PERSIST_FAILED`, causing futile retries). Web failure message added.
- **L2 — tracked, not a code fix.** The persisted draft is a `LessonStoryboard` envelope rather than a strictly-valid full `LessonSpec` because `voice` requires ST-062; full LessonSpec assembly lands at ST-060.

Verification after fixes: schemas 186 passed, pipeline-worker 134 passed, provider-adapters 36 passed, api 258 passed, web 52 passed; `lint`/`typecheck`/`build` pass for all affected workspaces; `playwright test e2e/storyboard.spec.ts` — 2 passed.

## Follow-up (2026-08-29) — narration approval landed

This story deferred narration approval ("Narration approval does not exist yet, so the storyboard uses the current working narration set"). That deferral was never picked up by a later story, so no code path ever wrote `narration_sets.status = 'approved'`. Because `PostgresLessonVersionsService` requires an approved narration set, no lesson version could be saved and the whole delivery chain (render, exports, sharing) was unreachable in the running product. Closed out here:

- `POST /projects/:id/narration/approve` (`narrationApproveInputSchema` → `{ expectedRevision }`) with `PostgresNarrationService.approve` (`apps/api/src/narration.ts`, `apps/api/src/app.ts`). Under the draft row lock it re-checks the same gates the read model reports: no narration generation or transform job in flight, expected revision match, not stale against the approved source/configuration/outline, every block grounded by a source ref or generated addition, and every approved outline section covered. It then promotes the draft, supersedes every other set (exactly one approved set per project), and writes a `narration.approved` audit event.
- `NarrationResponse.canApprove` was hardcoded `false` since ST-048; it is now computed from the same conditions.
- Approve footer on the narration workspace (`apps/web/app/workspace/[projectId]/narration/narration-panel.tsx`), mirroring the outline panel's approval footer.
- Migration `0058_narration_approved_audit_event` registers the `narration.approved` audit enum value.
- Tests: 8 service tests in `apps/api/src/narration-editor.test.ts` (approve + supersede + audit, `canApprove` true, revision conflict, no draft, uncovered outline section, ungrounded block, stale draft, job in flight) and 3 route tests in `apps/api/src/narration.test.ts` (owner 200, cross-tenant 404, untrusted origin 403).

The forward-looking note in this story's Known risks is resolved with one clarification: approval promotes the draft row **in place**, so its ID does not change. Storyboards generated from a working draft therefore stay aligned — `lesson_specs.based_on_narration_set_id` continues to match the set that is now approved, and `ensureReady`'s alignment check in `lesson-versions.ts` passes without regeneration. The guide's `POST /projects/{id}/storyboard/approve` remains unimplemented; `workingStoryboard` accepts a draft lesson spec, so storyboard approval is still not required to version a lesson.
