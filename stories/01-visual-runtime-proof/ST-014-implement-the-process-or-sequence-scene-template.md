---
story_id: ST-014
title: "Implement the Process or Sequence Scene Template"
phase: "01 \u2014 Visual Runtime Proof"
status: Ready
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
