---
story_id: ST-017
title: "Implement the Cause-and-Effect Scene Template"
phase: "01 \u2014 Visual Runtime Proof"
status: Ready
priority: must-have
epics: ["E11"]
prd_user_stories: ["E11-US1", "E11-US2"]
depends_on: ["ST-010", "ST-011"]
---

# ST-017 — Implement the Cause-and-Effect Scene Template

## Story

As a learner, I want a cause, mechanism, and result shown as a connected chain.

## Outcome

The template renders bounded causal relationships with arrows and progressive explanation.

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

- [ ] Define cause-effect visual schema supporting one or more causes, an optional mechanism, and one or more effects within limits.
- [ ] Implement chain or branching layout rules.
- [ ] Implement progressive reveal and connection emphasis.
- [ ] Support optional per-node icons/assets.
- [ ] Add simple and branching fixtures.

## Technical Implementation Requirements

- Causal direction must be visually explicit.
- The renderer does not invent missing mechanisms.
- Branching is bounded to prevent diagram congestion.
- Use shared arrow and node primitives.

## Contracts and Persistence

- `CauseEffectVisual`.
- Causal node and connection schemas.

## Interfaces

- Scene registry cause-effect implementation.
- Preview composition.

## Acceptance Criteria

- [ ] Simple and bounded branching chains render without ambiguous direction.
- [ ] Invalid empty causes/effects fail.
- [ ] Overly complex graphs fail validation rather than auto-compressing.
- [ ] Key frames pass visual regression.

## Required Tests

- [ ] Schema tests.
- [ ] Branch-layout unit tests.
- [ ] Visual regressions.
- [ ] Render smoke test.

## Out of Scope

- General graph visualization.
- Causal inference or truth validation.

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
