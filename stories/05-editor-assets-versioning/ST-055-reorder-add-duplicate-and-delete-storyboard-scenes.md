---
story_id: ST-055
title: "Reorder, Add, Duplicate, and Delete Storyboard Scenes"
phase: "05 \u2014 Storyboard Editing, Assets, and Versions"
status: Done
priority: must-have
epics: ["E12"]
prd_user_stories: ["E12-US2", "E12-US3"]
depends_on: ["ST-054", "ST-011"]
---

# ST-055 — Reorder, Add, Duplicate, and Delete Storyboard Scenes

## Story

As a teacher, I want to change the scene sequence and scene count to improve lesson flow.

## Outcome

Scene list commands preserve stable IDs/citations where appropriate, recalculate timeline duration, and invalidate only lesson-level derived outputs.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E12-US2, E12-US3
- `docs/reference/epic-technical-implementation-guide.md` — E12 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-054
- ST-011

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Implement atomic scene reorder command.
- [ ] Implement add scene from registered template default factory.
- [ ] Implement duplicate scene with a new scene ID and copied content/provenance.
- [ ] Implement delete scene with confirmation and at-least-one-scene rule.
- [ ] Recalculate order, numbering, total duration, and lesson hash.
- [ ] Mark full timeline, validation, and final render stale while preserving unaffected per-scene audio when content is unchanged.
- [ ] Build drag-and-drop and CRUD UI.

## Technical Implementation Requirements

- Commands use optimistic concurrency and one database transaction.
- Reordering does not detach citations from scenes.
- Duplicating creates independent editable data and does not incorrectly reuse scene-specific audio without content-hash rules.
- At least one scene must remain.
- Do not silently compress duration to target; show warnings.

## Contracts and Persistence

- Scene ordering command.
- Default scene creation.
- Scene duplication/deletion events.

## Interfaces

- Reorder endpoint.
- Create/duplicate/delete scene endpoints.
- Drag-and-drop and action UI.

## Acceptance Criteria

- [ ] Reorder persists and numbering updates after refresh.
- [ ] Adding uses a valid default for a supported template.
- [ ] Duplicating assigns a new scene ID.
- [ ] Deleting the final scene is blocked.
- [ ] Citations remain with their scenes and invalidation is correctly scoped.

## Required Tests

- [ ] Atomic reorder tests.
- [ ] CRUD tests.
- [ ] At-least-one test.
- [ ] Citation attachment test.
- [ ] Dependency invalidation tests.
- [ ] Drag-and-drop Playwright test.
- [ ] Cross-user/concurrency tests.

## Out of Scope

- Editing scene fields.
- AI regeneration.
- Automatic duration balancing.

## Story-Specific Notes

- Technical guide references: E12 and transaction guidance 10.1.

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

- **Agent:** Kilo (AI Visual Learning Platform)
- **Started:** 2026-08-22
- **Completed:** 2026-08-22
- **Branch/PR:** story/st-055
- **Files changed:**
  - `packages/schemas/src/index.ts` — relaxed draft-scene constraints; added CRUD input schemas + default scene factory
  - `packages/database/src/schema.ts` — added `storyboard.edited` audit event type
  - `packages/database/drizzle/0039_cloudy_warbound.sql` — migration for audit enum
  - `apps/api/src/storyboard.ts` — added `addScene`, `duplicateScene`, `deleteScene`, `reorderScenes` service methods
  - `apps/api/src/app.ts` — 4 new routes + service pick
  - `apps/web/app/workspace/[projectId]/storyboard/storyboard-scene-query.ts` — mutation fetch functions
  - `apps/web/app/workspace/[projectId]/storyboard/scene-list.tsx` — drag-and-drop + `reorderSceneIds` helper
  - `apps/web/app/workspace/[projectId]/storyboard/storyboard-panel.tsx` — CRUD UI + toolbar
  - `packages/schemas/src/storyboard.test.ts` — new schema tests
  - `apps/api/src/storyboard-scene-editor.test.ts` — unit tests for CRUD/reorder
  - `apps/web/app/workspace/[projectId]/storyboard/scene-list.test.ts` — reorder helper test
  - `e2e/storyboard-editor.spec.ts` — drag-and-drop + CRUD Playwright tests
  - `e2e/workspace-mock-api.mjs` — mock API handlers for new endpoints
- **Migrations:**
  - `packages/database/drizzle/0039_cloudy_warbound.sql` — `ALTER TYPE audit_event_type ADD VALUE 'storyboard.edited'`
- **Contracts changed:**
  - `packages/schemas/src/index.ts`:
    - `sceneBaseShape.sourceRefs`: `.min(1)` → removed (allow empty for draft scenes)
    - `lessonSpecSchema`: added superRefine enforcing ≥1 sourceRef per scene (preserves grounding rule at LessonSpec level)
    - `lessonStoryboardSceneSchema.narrationBlockIds`: `.min(1)` → removed (allow empty for draft scenes)
    - New: `storyboardSceneCreateInputSchema`, `storyboardSceneReorderInputSchema`, `storyboardSceneDuplicateInputSchema`, `storyboardSceneDeleteInputSchema`, `createDefaultStoryboardSceneSpec`, `storyboardSceneDefaultDurationSeconds`, `mockSceneVisual` (in e2e mock)
  - `packages/database/src/schema.ts`: `auditEventTypeValues` + `storyboard.edited`
- **Commands/tests run:**
  - `pnpm lint` — all packages pass
  - `pnpm typecheck` — all packages pass
  - `pnpm test` — schemas (246), api (329), web (89), database (8) pass
  - `pnpm build` — api, web, schemas, database pass
  - `npx playwright test e2e/storyboard-editor.spec.ts` — 3/3 pass
  - `npx playwright test e2e/storyboard.spec.ts` — 10/10 pass
- **Screenshots or representative output:**
  - Drag-and-drop reorder test: `page.dragAndDrop()` with string selectors sends POST `/scenes/reorder` with correct `sceneIds` order
  - Add/delete test: "Add scene" button + template select creates new scene; "Delete" with confirmation removes it
  - Reorder helper: `reorderSceneIds(["a","b","c","d"], 0, 2) === ["b","c","a","d"]`
- **Decisions and assumptions:**
  - Relaxed `sceneBaseShape.sourceRefs` and `narrationBlockIds` for draft storyboard scenes while preserving the grounding rule at the versioned `lessonSpecSchema` level via superRefine — avoids LessonSpec version bump.
  - Used single `storyboard.edited` audit event type with `metadata.operation` discriminator ("add"|"duplicate"|"delete"|"reorder") rather than four separate enum values — consistent with `outline.edited`/`objectives.edited` pattern; requires one migration.
  - New scenes start with `narrationBlockIds: []` and `sourceRefs: []` (draft-uncited) so teachers can ground them during editing (ST-056).
  - Default scene factory uses template-specific visuals matching the scene-registry defaults.
  - E2E mock `newMockSceneId` generates valid UUIDv7 identifiers to satisfy `identifierSchema`.
- **Deviations from story/technical guide:**
  - Technical guide E12 listed `POST /projects/{id}/scenes` for add, but the API base is `/projects/{id}` so the route is `POST /projects/:id/scenes` — matches.
  - Guide mentions `PATCH /projects/{id}/scenes/{sceneId}` for edit (ST-056); this story only covers CRUD/reorder.
- **Known risks or follow-up:**
  - The `lessonSpecSchema` superRefine adds a validation that the final LessonSpec must have ≥1 sourceRef per scene — ST-060 (immutable lesson versions) must enforce this before rendering.
  - Cross-tenant/concurrency tests covered in unit tests; integration tests require TEST_DATABASE_URL and are skipped in CI.
  - Scene-library browser tests timeout in this environment (pre-existing) — not related to this story.
