---
story_id: ST-013
title: "Implement the Definition Scene Template"
phase: "01 \u2014 Visual Runtime Proof"
status: Ready
priority: must-have
epics: ["E11"]
prd_user_stories: ["E11-US1", "E11-US2"]
depends_on: ["ST-010", "ST-011"]
---

# ST-013 — Implement the Definition Scene Template

## Story

As a learner, I want a new term explained with a concise definition and visual example.

## Outcome

The definition template renders a term, a short explanation, and an optional example/asset within strict density limits.

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

- [ ] Define the definition visual schema and form metadata.
- [ ] Support term, concise definition, optional example label/text, and optional visual asset.
- [ ] Implement term reveal, definition build, and example emphasis timing.
- [ ] Implement deterministic layout variants for text-only and visual-assisted scenes.
- [ ] Add fixtures and preview composition.

## Technical Implementation Requirements

- Do not display paragraph-length source text.
- Use shared typography and safe-area tokens.
- The example must be visually secondary to the term and definition.
- Missing optional asset must not break layout.

## Contracts and Persistence

- `DefinitionVisual`.
- Definition template field and asset metadata.

## Interfaces

- Scene registry definition implementation.
- Preview composition.

## Acceptance Criteria

- [ ] The term and definition are readable and do not overlap captions.
- [ ] Maximum-length valid input renders without overflow.
- [ ] Inputs above schema limits fail with field errors.
- [ ] Text-only and asset-assisted layouts pass frame regression.

## Required Tests

- [ ] Schema tests.
- [ ] Visual regression tests.
- [ ] Render smoke test.
- [ ] Caption safe-area test.

## Out of Scope

- Narration generation.
- Vocabulary extraction UI.

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
