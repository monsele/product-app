---
story_id: ST-055
title: "Reorder, Add, Duplicate, and Delete Storyboard Scenes"
phase: "05 \u2014 Storyboard Editing, Assets, and Versions"
status: Ready
priority: must-have
epics: ["E12"]
prd_user_stories: ["E12-US2", "E12-US3"]
depends_on: ["ST-054", "ST-011"]
---

# ST-055 — Reorder, Add, Duplicate, and Delete Storyboard Scenes

## Story

As a teacher, I want to change the scene sequence and scene count to improve lesson flow.

## Outcome

Scene list commands preserve stable IDs/citations where appropriate, recalculate timeline duration, and invalidate only lesson-level derived outputs.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E12-US2, E12-US3
- `docs/reference/epic-technical-implementation-guide.md` — E12 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-054
- ST-011

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Implement atomic scene reorder command.
- [ ] Implement add scene from registered template default factory.
- [ ] Implement duplicate scene with a new scene ID and copied content/provenance.
- [ ] Implement delete scene with confirmation and at-least-one-scene rule.
- [ ] Recalculate order, numbering, total duration, and lesson hash.
- [ ] Mark full timeline, validation, and final render stale while preserving unaffected per-scene audio when content is unchanged.
- [ ] Build drag-and-drop and CRUD UI.

## Technical Implementation Requirements

- Commands use optimistic concurrency and one database transaction.
- Reordering does not detach citations from scenes.
- Duplicating creates independent editable data and does not incorrectly reuse scene-specific audio without content-hash rules.
- At least one scene must remain.
- Do not silently compress duration to target; show warnings.

## Contracts and Persistence

- Scene ordering command.
- Default scene creation.
- Scene duplication/deletion events.

## Interfaces

- Reorder endpoint.
- Create/duplicate/delete scene endpoints.
- Drag-and-drop and action UI.

## Acceptance Criteria

- [ ] Reorder persists and numbering updates after refresh.
- [ ] Adding uses a valid default for a supported template.
- [ ] Duplicating assigns a new scene ID.
- [ ] Deleting the final scene is blocked.
- [ ] Citations remain with their scenes and invalidation is correctly scoped.

## Required Tests

- [ ] Atomic reorder tests.
- [ ] CRUD tests.
- [ ] At-least-one test.
- [ ] Citation attachment test.
- [ ] Dependency invalidation tests.
- [ ] Drag-and-drop Playwright test.
- [ ] Cross-user/concurrency tests.

## Out of Scope

- Editing scene fields.
- AI regeneration.
- Automatic duration balancing.

## Story-Specific Notes

- Technical guide references: E12 and transaction guidance 10.1.

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
