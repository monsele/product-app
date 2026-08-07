---
story_id: ST-015
title: "Implement the Input\u2013Process\u2013Output Scene Template"
phase: "01 \u2014 Visual Runtime Proof"
status: Ready
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

- **Agent:**
- **Started:**
- **Completed:**
- **Branch/PR:**
- **Files changed:**
- **Migrations:**
- **Contracts changed:**
- **Commands/tests run:**
- **Screenshots or representative output:**
- **Decisions and assumptions:**
- **Deviations from story/technical guide:**
- **Known risks or follow-up:**
