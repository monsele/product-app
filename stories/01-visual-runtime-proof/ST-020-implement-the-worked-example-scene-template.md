---
story_id: ST-020
title: "Implement the Worked Example Scene Template"
phase: "01 \u2014 Visual Runtime Proof"
status: Ready
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

- [ ] Define worked-example visual schema.
- [ ] Support problem statement, ordered reasoning/calculation steps, and result.
- [ ] Support plain text and limited equation/number formatting.
- [ ] Implement progressive reveal and active-step highlighting.
- [ ] Add numerical and non-numerical fixtures.

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

- [ ] Steps render in exact order and the result appears last.
- [ ] Valid equations/text remain within safe areas.
- [ ] Too many or excessively long steps fail validation.
- [ ] Key instructional frames pass regression.

## Required Tests

- [ ] Schema tests.
- [ ] Reveal-order tests.
- [ ] Visual regressions.
- [ ] Render smoke test.

## Out of Scope

- Mathematical correctness engine.
- Interactive learner input.

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
