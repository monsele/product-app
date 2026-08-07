---
story_id: ST-040
title: "Let Teachers Include or Exclude Extracted Figures"
phase: "03 \u2014 Ingestion and Lesson Configuration"
status: Ready
priority: must-have
epics: ["E5"]
prd_user_stories: ["E5-US4"]
depends_on: ["ST-035", "ST-037"]
---

# ST-040 — Let Teachers Include or Exclude Extracted Figures

## Story

As a teacher, I want decorative or irrelevant images excluded from visual planning while preserving their provenance.

## Outcome

Figure-selection overlays control whether extracted figures are eligible for AI asset planning and scene use.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E5-US4
- `docs/reference/epic-technical-implementation-guide.md` — E5 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-035
- ST-037

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create figure inclusion overlay records.
- [ ] Implement include/exclude/restore operations with owner authorization and optimistic concurrency.
- [ ] Display figure preview, caption, page, source section, and inclusion state.
- [ ] Filter excluded figures from source packages and asset-planning candidates.
- [ ] Preserve original figure metadata and storage object.

## Technical Implementation Requirements

- Exclusion is reversible and does not delete the source figure.
- Selection is project and parsed-version specific.
- A scene already bound to a newly excluded figure must receive a validation/stale issue rather than silently switching assets.
- Do not expose private figure URLs beyond signed access.

## Contracts and Persistence

- Figure inclusion overlay.
- Effective figure projection.

## Interfaces

- `PATCH /projects/:id/source-figures/:figureId`.
- Figure review controls.

## Acceptance Criteria

- [ ] Teachers can exclude and restore figures.
- [ ] Excluded figures disappear from future asset candidates.
- [ ] Original figure provenance remains available.
- [ ] Existing scene bindings become explicitly invalid/stale if affected.
- [ ] Cross-user updates fail.

## Required Tests

- [ ] Overlay tests.
- [ ] Candidate-filter test.
- [ ] Existing-binding invalidation test.
- [ ] Signed-URL authorization test.
- [ ] UI toggle test.

## Out of Scope

- Deleting extracted binaries.
- Editing figure pixels.
- General asset library.

## Story-Specific Notes

- Technical guide references: E5 and E13 dependencies.

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
