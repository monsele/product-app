---
story_id: ST-045
title: "Edit, Reorder, Regenerate, and Approve Learning Objectives"
phase: "04 \u2014 AI Planning and Grounding"
status: Ready
priority: must-have
epics: ["E7", "E20"]
prd_user_stories: ["E7-US2", "E20-US1"]
depends_on: ["ST-044"]
---

# ST-045 — Edit, Reorder, Regenerate, and Approve Learning Objectives

## Story

As a teacher, I want to add, edit, remove, reorder, regenerate, and approve objectives before they guide the lesson.

## Outcome

A revision-aware objective editor preserves approved content, supports candidate regeneration, and creates an immutable approved objective snapshot.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E7-US2, E20-US1
- `docs/reference/epic-technical-implementation-guide.md` — E7, E20 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-044

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Implement objective CRUD and ordering within a draft revision.
- [ ] Allow adding teacher-authored objectives with optional/required source links according to grounding policy.
- [ ] Implement regeneration into a candidate revision without discarding current content.
- [ ] Require at least one objective.
- [ ] Implement approve command that creates an immutable approved revision/snapshot.
- [ ] Display citations and unsupported/teacher-added status.
- [ ] Use optimistic concurrency and audit approval.

## Technical Implementation Requirements

- Outline generation uses only the approved objective revision.
- Editing approved objectives creates a new draft; it does not mutate the approved snapshot used by prior outputs.
- Teacher-added unsupported claims may be allowed only with a visible warning and grounding status.
- Reordering must preserve objective IDs and citation links.

## Contracts and Persistence

- Objective draft/approved revision.
- Objective ordering.
- Approval event.

## Interfaces

- Objective CRUD/reorder endpoints.
- `POST /projects/:id/objectives/approve`.
- Objective editor UI.

## Acceptance Criteria

- [ ] Teachers can add, edit, remove, and reorder objectives.
- [ ] At least one objective is required for approval.
- [ ] Regeneration preserves the current approved/draft version until the teacher selects a candidate.
- [ ] Approval creates an immutable version used by outline generation.
- [ ] Stale concurrent saves are rejected.

## Required Tests

- [ ] Objective editor domain tests.
- [ ] Ordering and ID preservation tests.
- [ ] Approval immutability test.
- [ ] Regeneration candidate test.
- [ ] Concurrency and cross-user API tests.
- [ ] Editor Playwright test.

## Out of Scope

- Objective-to-standards mapping.
- Collaborative editing.

## Story-Specific Notes

- Technical guide references: E7 and approval state machine 5.3.

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
