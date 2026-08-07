---
story_id: ST-028
title: "Create and List Teacher Projects with Workspace Status"
phase: "02 \u2014 Accounts, Projects, and Upload"
status: Ready
priority: must-have
epics: ["E2"]
prd_user_stories: ["E2-US1", "E2-US2"]
depends_on: ["ST-025", "ST-027", "ST-003"]
---

# ST-028 — Create and List Teacher Projects with Workspace Status

## Story

As a teacher, I want to create a project and see my existing projects and their workflow statuses.

## Outcome

The workspace supports project creation, owner-scoped listing, opening, pagination, empty state, and last-known workflow status.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E2-US1, E2-US2
- `docs/reference/epic-technical-implementation-guide.md` — E2 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-025
- ST-027
- ST-003

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create the `projects` table with owner, title, stage, latest failed operation, timestamps, revision, and soft-delete fields.
- [ ] Implement project creation and owner-scoped query services.
- [ ] Implement cursor-paginated project list and project detail endpoints.
- [ ] Implement the initial project stage state machine beginning at `draft`.
- [ ] Create workspace UI with title, last modified time, stage, failure indicator, and empty state.
- [ ] Redirect a newly created project to its next workflow step.

## Technical Implementation Requirements

- Project stage retains the last successful stage; operation failures are represented separately.
- A title is required and bounded.
- Project list returns only the current teacher’s non-deleted projects.
- Use optimistic concurrency for future updates.

## Contracts and Persistence

- Project entity/table.
- `ProjectStage`.
- Project summary/detail DTOs.

## Interfaces

- `POST /projects`.
- `GET /projects` with cursor.
- `GET /projects/:projectId`.
- Workspace and create-project UI.

## Acceptance Criteria

- [ ] A teacher can create a titled project and is recorded as owner.
- [ ] The workspace shows only that teacher’s projects.
- [ ] Project status and last modification time are displayed.
- [ ] Pagination and empty state work.
- [ ] Cross-user project opening fails.

## Required Tests

- [ ] Project domain tests.
- [ ] Create/list/detail API tests.
- [ ] Cross-user tests.
- [ ] Workspace Playwright test.
- [ ] Stage transition unit test.

## Out of Scope

- Project duplication and deletion.
- Source upload.
- Rich project search/filtering.

## Story-Specific Notes

- Technical guide references: E2 and project state machine section 5.1.

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
