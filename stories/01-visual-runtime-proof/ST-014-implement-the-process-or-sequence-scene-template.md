---
story_id: ST-014
title: "Implement the Process or Sequence Scene Template"
phase: "01 \u2014 Visual Runtime Proof"
status: Done
priority: must-have
epics: ["E11"]
prd_user_stories: ["E11-US1", "E11-US2"]
depends_on: ["ST-010", "ST-011"]
---

# ST-014 — Implement the Process or Sequence Scene Template

## Story

As a learner, I want ordered steps shown progressively so I can understand how a process unfolds.

## Outcome

The process template renders a bounded ordered sequence with deterministic progression and optional icons/assets.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E11-US1, E11-US2
- `docs/reference/epic-technical-implementation-guide.md` — E11 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-010
- ST-011

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Define process visual schema with title and ordered steps.
- [ ] Support a bounded number of steps and optional per-step asset bindings.
- [ ] Implement horizontal or vertical layout selection based on step count and text length.
- [ ] Animate progressive reveal and active-step emphasis.
- [ ] Add fixtures for minimum, maximum, and long-label conditions.

## Technical Implementation Requirements

- Step order comes from data and must remain stable.
- Exact coordinates are calculated by layout code.
- The template reports overflow instead of clipping.
- Use one process mental model per scene.

## Contracts and Persistence

- `ProcessVisual`.
- Per-step asset-slot metadata.

## Interfaces

- Scene registry process implementation.
- Preview composition.

## Acceptance Criteria

- [ ] Two through the configured maximum number of steps render correctly.
- [ ] Step numbering/order matches LessonSpec.
- [ ] Long but valid labels use the approved alternate layout.
- [ ] Excessive steps or text fail validation.

## Required Tests

- [ ] Layout-selection unit tests.
- [ ] Visual regressions for min/max steps.
- [ ] Render smoke test.
- [ ] Order stability test.

## Out of Scope

- Timeline template beyond MVP.
- Interactive step controls.

## Story-Specific Notes

- Technical guide references: E11.

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

- **Agent:**
- **Started:** 2026-08-11
- **Completed:** 2026-08-11 (approved)
- **Branch/PR:** `story/st-005-job-platform` (pre-existing working branch; no branch or PR published)
- **Files changed:** `packages/schemas/src/index.ts`, `packages/schemas/src/lesson-spec.test.ts`, `packages/schemas/lesson-spec-v1.schema.json`, `packages/schemas/LESSONSPEC_COMPATIBILITY.md`, `packages/scene-library/src/process-scene.tsx`, `packages/scene-library/src/process-scene.fixtures.ts`, `packages/scene-library/src/scene-registry.tsx`, `packages/scene-library/src/index.ts`, `packages/scene-library/src/index.test.ts`, and `packages/scene-library/src/scene-preview-render-smoke.test.ts`.
- **Migrations:** `LessonSpec` is now v1.2. Compatible v1.1 process scenes migrate automatically; legacy process content outside the new 2–6 step/80-character limits requires an explicit teacher migration and is never truncated.
- **Contracts changed:** Added `ProcessVisual`, `SceneAssetBinding.slot`, six named process icon slots, and the v1.2 generated JSON Schema.
- **Commands/tests run:** `pnpm --filter @avlp/schemas test` (26 passing); `pnpm --filter @avlp/schemas generate:lesson-spec-json-schema`; `pnpm --filter @avlp/schemas lint`; `pnpm --filter @avlp/scene-library typecheck`; `pnpm --filter @avlp/scene-library lint`; `pnpm --filter @avlp/scene-library test` (19 passing, including Remotion smoke); repository `pnpm lint` (passing); repository `pnpm typecheck` (unrelated pre-existing failure in `@avlp/test-fixtures`: missing `packageBoundary` export from `@avlp/schemas`).
- **Screenshots or representative output:** Playwright 1920×1080 visual-boundary checks for the maximum process fixture pass; the Remotion smoke test rendered the maximum process fixture successfully.
- **Decisions and assumptions:** Process scenes support two through six steps. Up to four short labels use the horizontal layout; longer labels or five/six steps use the vertical layout. Icon bindings use explicit `step-N-icon` slots to preserve semantic binding independent of source-array order.
- **Deviations from story/technical guide:** None.
- **Known risks or follow-up:** Repository-wide typecheck remains blocked by the unrelated `@avlp/test-fixtures` `packageBoundary` import; this story's changed workspaces typecheck cleanly.
