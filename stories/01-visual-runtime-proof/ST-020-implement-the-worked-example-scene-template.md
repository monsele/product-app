---
story_id: ST-020
title: "Implement the Worked Example Scene Template"
phase: "01 \u2014 Visual Runtime Proof"
status: Done
priority: must-have
epics: ["E11"]
prd_user_stories: ["E11-US1", "E11-US2"]
depends_on: ["ST-010", "ST-011"]
---

# ST-020 — Implement the Worked Example Scene Template

## Story

As a learner, I want a problem or example solved in small visible steps.

## Outcome

The template renders a prompt, bounded steps, and final result with progressive emphasis.

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

- [x] Define worked-example visual schema.
- [x] Support problem statement, ordered reasoning/calculation steps, and result.
- [x] Support plain text and limited equation/number formatting.
- [x] Implement progressive reveal and active-step highlighting.
- [x] Add numerical and non-numerical fixtures.

## Technical Implementation Requirements

- The renderer displays provided steps and does not calculate answers.
- Step count and expression length are bounded.
- Use monospace/equation styling only where appropriate.
- Result is not revealed before its configured sequence point.

## Contracts and Persistence

- `WorkedExampleVisual`.
- Worked step schema.

## Interfaces

- Scene registry worked-example implementation.
- Preview composition.

## Acceptance Criteria

- [x] Steps render in exact order and the result appears last.
- [x] Valid equations/text remain within safe areas.
- [x] Too many or excessively long steps fail validation.
- [x] Key instructional frames pass regression.

## Required Tests

- [x] Schema tests.
- [x] Reveal-order tests.
- [x] Visual regressions.
- [x] Render smoke test.

## Out of Scope

- Mathematical correctness engine.
- Interactive learner input.

## Story-Specific Notes

- Technical guide references: E11.

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

- **Agent:** Codex
- **Started:** 2026-08-12
- **Completed:** 2026-08-12
- **Branch/PR:** `story/st-020` / not published
- **Files changed:** Worked-example schema, generated JSON Schema, scene renderer, fixtures, unit/layout tests, render smoke coverage, registry exports, this story, and `STORY_INDEX.md`.
- **Migrations:** None. The existing `WorkedExampleVisual` wire shape is preserved; named schema exports make its contract explicit.
- **Contracts changed:** Exported `WorkedExampleVisual` and `workedExampleStepSchema`; the generated `LessonSpec` JSON Schema now exposes the named worked-example fields directly.
- **Commands/tests run:** `pnpm lint`; `pnpm typecheck`; `pnpm --filter @avlp/schemas test`; `pnpm --filter @avlp/scene-library exec vitest run src/worked-example-scene.test.tsx`; and `pnpm --filter @avlp/scene-library exec vitest run src/scene-preview-render-smoke.test.ts -u` (all passed). Combined whole-workspace `test`/`build` invocations exceeded the environment command timeout while browser rendering was active.
- **Screenshots or representative output:** Playwright action-safe-area check passes for the 12-step bounded fixture; Remotion still-render smoke test covers the numerical worked example.
- **Decisions and assumptions:** The renderer does not calculate solutions. It reveals supplied steps deterministically and delays the final result. Dense (more than four-step) examples display the active step alone to retain the 1080p action-safe area and readable type.
- **Deviations from story/technical guide:** None.
- **Known risks or follow-up:** Whole-workspace `pnpm test`/`pnpm build` reruns after the final fixture correction were constrained by this environment's command timeout during browser rendering; re-run them in CI or a normal shell before merge.
