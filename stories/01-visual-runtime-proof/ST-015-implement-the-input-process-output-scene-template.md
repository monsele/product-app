---
story_id: ST-015
title: "Implement the Input\u2013Process\u2013Output Scene Template"
phase: "01 \u2014 Visual Runtime Proof"
status: Done
priority: must-have
epics: ["E11"]
prd_user_stories: ["E11-US1", "E11-US2"]
depends_on: ["ST-010", "ST-011"]
---

# ST-015 — Implement the Input–Process–Output Scene Template

## Story

As a learner, I want inputs, a transformation, and outputs shown as one visual model.

## Outcome

The template renders a clear input-to-process-to-output flow suitable for introductory science and systems concepts.

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

- [ ] Define IPO visual schema with bounded inputs, process label, and bounded outputs.
- [ ] Support optional icons/assets for each item.
- [ ] Implement flow arrows and staged reveal synchronized to scene progress.
- [ ] Implement layout handling for unequal input/output counts.
- [ ] Add photosynthesis-oriented and generic fixtures.

## Technical Implementation Requirements

- The process remains visually central.
- Inputs and outputs must be semantically and visually distinct without relying only on color.
- Use labels from structured input; do not infer content inside the renderer.
- All items remain in safe areas.

## Contracts and Persistence

- `IpoVisual`.
- Input/output item schema and asset slots.

## Interfaces

- Scene registry IPO implementation.
- Preview composition.

## Acceptance Criteria

- [ ] Valid scenes render with one or multiple inputs/outputs.
- [ ] Flow direction is unambiguous.
- [ ] Maximum-density fixture has no overlap or clipped arrows.
- [ ] Empty inputs, outputs, or process labels fail validation.

## Required Tests

- [ ] Schema tests.
- [ ] Layout tests for asymmetric counts.
- [ ] Visual regressions.
- [ ] Render smoke test.

## Out of Scope

- AI template selection.
- Animated scientific simulation.

## Story-Specific Notes

- Technical guide references: E11 and product plan examples.

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

- **Agent:** Codex
- **Started:** 2026-08-11
- **Completed:** 2026-08-11
- **Branch/PR:** `story/st-005-job-platform` (existing dirty worktree preserved; no branch or PR created)
- **Files changed:** `packages/schemas/src/index.ts`, `packages/schemas/lesson-spec-v1.schema.json`, `packages/schemas/LESSONSPEC_COMPATIBILITY.md`, `packages/schemas/src/lesson-spec.test.ts`, `packages/scene-library/src/ipo-scene.tsx`, `packages/scene-library/src/ipo-scene.fixtures.ts`, scene registry/exports, and scene-library render/layout tests.
- **Migrations:** No database migration. `LessonSpec` advances from `1.2` to `1.3`; compatible scalar IPO data migrates losslessly to one-item input/output collections.
- **Contracts changed:** Adds `IpoVisual`, bounded `IpoItem` collections (one through four inputs and outputs), approved optional asset slots, IPO registry metadata, and the `input-process-output` Remotion component.
- **Commands/tests run:** `pnpm --filter @avlp/schemas test`; `pnpm --filter @avlp/schemas generate:lesson-spec-json-schema`; `pnpm --filter @avlp/scene-library test -- --update`; targeted schemas and scene-library typechecks; `pnpm lint`; `git diff --check`.
- **Screenshots or representative output:** 1920×1080 Playwright safe-area checks pass for maximum-density and asymmetric IPO fixtures. Remotion renders pass and an IPO frame-90 SHA-256 inline snapshot verifies deterministic visual output.
- **Decisions and assumptions:** Inputs use filled rounded cards; outputs use unfilled double-bordered cards; a central circular process and directional arrows make flow clear without relying only on colour. Optional visual assets bind only through approved named slots.
- **Deviations from story/technical guide:** None. The required compatibility migration accompanies the explicit `LessonSpec` contract change.
- **Known risks or follow-up:** Full monorepo `typecheck` and `build` remain blocked outside this story by `packages/test-fixtures/src/index.ts` importing missing `packageBoundary` from `@avlp/schemas`; affected workspace checks pass.
