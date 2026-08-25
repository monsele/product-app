---
story_id: ST-054
title: "Build Storyboard Scene List, Selection, and Navigation"
phase: "05 \u2014 Storyboard Editing, Assets, and Versions"
status: Done
priority: must-have
epics: ["E12"]
prd_user_stories: ["E12-US1"]
depends_on: ["ST-050", "ST-022", "ST-052"]
---

# ST-054 — Build Storyboard Scene List, Selection, and Navigation

## Story

As a teacher, I want to see all scenes in order, understand their status, and move quickly between editing and preview.

## Outcome

The storyboard workspace displays a scalable ordered scene list with template, narration summary, duration, citations, validation/stale status, and persistent selection.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E12-US1
- `docs/reference/epic-technical-implementation-guide.md` — E12 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-050
- ST-022
- ST-052

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create storyboard read model optimized for list and selected-scene detail.
- [ ] Build virtualized or otherwise bounded scene list if needed.
- [ ] Display scene number, template, narration summary, duration, asset/audio/validation/stale status.
- [ ] Persist selected scene in route or local state through saves and refreshes.
- [ ] Connect selected scene to preview and citation panels.
- [ ] Provide keyboard navigation and empty/error states.
- [ ] Avoid mounting all Remotion players at once.

## Technical Implementation Requirements

- The UI reads authoritative persisted state from the API.
- Query keys include project and storyboard revision.
- Status must not rely on color alone.
- Large storyboards remain usable within configured maximum scene count.
- No scene mutations are added in this story.

## Contracts and Persistence

- Storyboard list/detail DTOs.
- Scene status projection.

## Interfaces

- `GET /projects/:id/storyboard/scenes` or equivalent.
- Storyboard editor route shell.
- Selected-scene panel integration.

## Acceptance Criteria

- [ ] Scenes appear in persisted order with correct metadata.
- [ ] Selection survives saving/refetching and can be deep linked.
- [ ] Only the selected scene preview is mounted.
- [ ] Keyboard navigation works.
- [ ] Stale/invalid states are visible and accessible.

## Required Tests

- [ ] Read-model tests.
- [ ] Query cache/revision tests.
- [ ] Selection persistence Playwright test.
- [ ] Keyboard accessibility test.
- [ ] Performance test with maximum scene count.

## Out of Scope

- Reorder or CRUD.
- Scene field editing.
- Asset selection.

## Story-Specific Notes

- Technical guide references: E12 and frontend sections 11.1–11.2.

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
- [x] This story is handed off as **In Review**; marking **Done** is reserved for human review.

## Dev Agent Record

- **Agent:** Kilo (deepseek/deepseek-v4-flash-0731)
- **Started:** 2026-08-21
- **Completed:** 2026-08-21
- **Marked Done by repository owner:** 2026-08-21
- **Branch/PR:** `story/st-054` (local only; not pushed)
- **Files changed:**
  - `packages/schemas/src/index.ts` — added ST-054 scene list/detail read-model contracts.
  - `packages/schemas/src/storyboard.test.ts` — schema tests for the new DTOs.
  - `apps/api/src/storyboard.ts` — added `scenes` and `sceneDetail` read-model methods plus per-scene status projection.
  - `apps/api/src/app.ts` — added `GET /projects/:id/storyboard/scenes` and `GET /projects/:id/storyboard/scenes/:sceneId` routes.
  - `apps/api/src/storyboard-service.test.ts` — read-model service tests.
  - `apps/api/src/storyboard.test.ts` — route authorization tests and mock coverage.
  - `apps/web/app/workspace/[projectId]/storyboard/storyboard-scene-query.ts` (+ `.test.ts`) — revision-keyed query cache and schema-validated fetchers.
  - `apps/web/app/workspace/[projectId]/storyboard/storyboard-input.ts` (+ test) — scene status label helpers.
  - `apps/web/app/workspace/[projectId]/storyboard/scene-list.tsx` — windowed `listbox` with `aria-activedescendant`, arrow/Home/End keyboard navigation, and non-color status text.
  - `apps/web/app/workspace/[projectId]/storyboard/scene-detail-panel.tsx` — selected-scene detail with the only mounted Remotion preview, regeneration controls/candidates (moved from the old panel), citations, and grounding.
  - `apps/web/app/workspace/[projectId]/storyboard/storyboard-panel.tsx` — refactored into the editor shell (selection state, hash deep-linking, revision-keyed list loading, polling).
  - `apps/web/app/workspace/[projectId]/storyboard/page.tsx` — renders the storyboard editor route; query-param deep linking removed in favor of the hash-based selection.
  - `packages/scene-library/src/scene-preview.tsx` — `spaceKeyToPlayOrPause={false}` so the preview player does not steal focus from the scene list (required for keyboard navigation).
  - `e2e/workspace-mock-api.mjs` — second storyboard scene plus `/storyboard/scenes` and `/storyboard/scenes/:sceneId` handlers; candidate dedupe.
  - `e2e/storyboard.spec.ts` — selection-persistence and keyboard-navigation tests; tightened two strict-mode locators.
  - `e2e/storyboard-editor.spec.ts` — performance test asserting exactly one mounted preview at the maximum scene count.
  - `STORY_INDEX.md`, story front matter — status transitions.
- **Migrations:** None. The read model is derived from the persisted `lesson_specs` payload and existing rows.
- **Contracts changed:**
  - New public schemas: `storyboardSceneStatusSchema`, `storyboardSceneListEntrySchema`, `storyboardSceneListResponseSchema`, `storyboardSceneDetailResponseSchema` (+ status enums `storyboardSceneAssetStatus*`, `storyboardSceneAudioStatus*`, `storyboardSceneValidationStatus*`).
  - New endpoints: `GET /projects/:id/storyboard/scenes`, `GET /projects/:id/storyboard/scenes/:sceneId` (both behind the existing project authorizer).
- **Commands/tests run:**
  - `pnpm --filter @avlp/schemas build`, `typecheck`, `test` (239 passed).
  - `pnpm --filter @avlp/api typecheck`, `test` (320 passed, 61 skipped integration).
  - `pnpm --filter @avlp/web lint`, `typecheck`, `test` (84 passed).
  - `pnpm --filter @avlp/scene-library build`, `test` (53 passed, incl. Remotion render smoke).
  - `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` (16/16 tasks each).
  - `pnpm exec playwright test e2e/storyboard.spec.ts e2e/storyboard-editor.spec.ts e2e/video-design-preview.spec.ts` — 14 passed.
  - Full e2e suite: 36 passed; 6 failures in `ingestion-review.spec.ts`/`workspace.spec.ts` confirmed pre-existing on the unmodified base (verified via stash) and unrelated to this story.
- **Screenshots or representative output:** Storyboard editor renders a two-column layout: a windowed scene list (number, template, narration summary, duration, narration-block count, asset/audio/validation/stale status as text) and a selected-scene detail panel with exactly one Remotion preview player plus regeneration, citations, and grounding panels. Keyboard ArrowDown/ArrowUp/Home/End moves selection while focus stays in the listbox. Selection persists across reloads via `#scene=<id>` hash deep link.
- **Decisions and assumptions:**
  - Audio status is projected as `not_generated` for every scene until ST-063 wires `scene_audio`.
  - Asset status is derived from `assetRequirements` (`planned`) and `scene.assetBindings` (`resolved`); validation status derives from the existing storyboard validation (error when structurally invalid, warning on duration drift); stale is the storyboard-level staleness propagated per scene.
  - Scene-list selection is persisted in the URL hash (`#scene=<id>`) rather than a query param or Next `router.replace`: Next dev intercepts history/query navigations and resets focus during keyboard navigation; the hash avoids the router and keeps the listbox focused.
  - The detail panel re-fetches full scene JSON per selection and on storyboard revision change (query keys include project + revision).
  - A lightweight windowed list (row-height math with overscan) bounds rendering at up to 100 scenes; heavy content (preview, citations, grounding) is mounted only for the selected scene.
  - `ScenePreviewPlayer` (ST-022) is reused for the selected-scene preview; a preview manifest endpoint is ST-065 scope, so the preview input is built with an empty asset/audio manifest for now.
- **Deviations from story/technical guide:**
  - Technical guide §11.2 recommends React Query; the web app does not use it, so the story's "query cache/revision" requirement is met with a small revision-keyed cache module instead of adding a new dependency (avoids an unrelated architecture change).
  - The scene list is windowed instead of using a virtualization library (no new dependency); max scene count remains the schema limit of 100.
- **Follow-up closures (post-review):**
  - M1 — `visibleSceneRange` now has unit coverage (`scene-list.test.ts`) and the 100-scene e2e test asserts a bounded rendered row count and total content height (`e2e/storyboard-editor.spec.ts`).
  - M2 — the selected-scene preview is built from authoritative scene data via `buildScenePreviewInput` (`scene-preview-input.ts`) with no fabricated captions or transition label; scenes with unresolved asset bindings render an explicit `scene-preview-unavailable` state instead of a broken player.
  - M3 — decision recorded: the custom revision-keyed query cache (`storyboard-scene-query.ts`) is the canonical editor query layer for the editor phase; React Query adoption will be reconsidered only if the technical guide is updated or a cross-app query layer is introduced.
  - L1 — ST-054 source files were formatted with Prettier (some pre-existing formatting debt in the same files was normalized).
  - L2 — this story's Definition of Done wording now matches the workflow (`In Review` handoff; `Done` reserved for human review).
  - L3 — deep linking is unified on the URL hash (`#scene=<id>`); the query-param reader was removed from the storyboard route.
- **Known risks or follow-up:**
  - The `not_generated` audio projection becomes meaningful only after ST-063; the enum must be extended then.
  - Scenes with asset bindings render an explicit "preview unavailable" state until ST-065 delivers a preview manifest with resolved media URLs.
  - E2E mock state accumulates across tests within a run (scene 1 becomes the applied regeneration candidate); candidate dedupe prevents duplicates, but a full mock reset would be cleaner for long-term maintenance.
  - Pre-existing e2e failures in `ingestion-review.spec.ts` and `workspace.spec.ts` (upload/review flows) are unrelated and were reproduced on the base branch.
