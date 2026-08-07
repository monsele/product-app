---
story_id: ST-047
title: "Edit, Reorder, Link, and Approve the Lesson Outline"
phase: "04 \u2014 AI Planning and Grounding"
status: Ready
priority: must-have
epics: ["E8", "E20"]
prd_user_stories: ["E8-US2", "E20-US1"]
depends_on: ["ST-046"]
---

# ST-047 — Edit, Reorder, Link, and Approve the Lesson Outline

## Story

As a teacher, I want to change outline titles, descriptions, order, and objective links before narration is generated.

## Outcome

A revision-aware outline editor supports CRUD, drag ordering, objective mapping, duration recalculation, and immutable approval.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E8-US2, E20-US1
- `docs/reference/epic-technical-implementation-guide.md` — E8, E20 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-046

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Implement outline item add/edit/delete/reorder operations.
- [ ] Allow linking each item to one or more approved objectives.
- [ ] Recalculate duration totals and show under/over target warnings.
- [ ] Require structural validity and objective coverage before approval.
- [ ] Implement approve command creating an immutable outline revision.
- [ ] Display citations and source drill-down links.
- [ ] Use optimistic concurrency and audit approval.

## Technical Implementation Requirements

- Narration generation reads only an approved outline revision.
- Editing an approved outline creates a new draft.
- Deleting an item cannot silently leave an objective uncovered.
- Order is persisted with stable item IDs.

## Contracts and Persistence

- Outline draft/approved revision.
- Ordering and objective-link updates.
- Approval snapshot.

## Interfaces

- Outline CRUD/reorder/link endpoints.
- `POST /projects/:id/outline/approve`.
- Outline editor UI.

## Acceptance Criteria

- [ ] Teachers can edit, add, delete, and reorder outline items.
- [ ] Objective links and total duration update immediately after save.
- [ ] Approval is blocked for invalid structure or uncovered objectives.
- [ ] Approved outline is immutable and used by narration generation.
- [ ] Concurrent stale edits show a conflict.

## Required Tests

- [ ] CRUD/order tests.
- [ ] Coverage guard tests.
- [ ] Duration recalculation tests.
- [ ] Approval immutability test.
- [ ] API authorization/concurrency tests.
- [ ] Drag-and-drop Playwright test.

## Out of Scope

- Narration generation.
- Scene planning.
- Automatic prerequisite lessons.

## Story-Specific Notes

- Technical guide references: E8 and approval state machine.

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
