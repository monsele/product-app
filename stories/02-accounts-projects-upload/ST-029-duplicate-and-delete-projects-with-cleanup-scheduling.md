---
story_id: ST-029
title: "Duplicate and Delete Projects with Cleanup Scheduling"
phase: "02 \u2014 Accounts, Projects, and Upload"
status: Ready
priority: must-have
epics: ["E2", "E20", "E21"]
prd_user_stories: ["E2-US3", "E2-US4", "E21-US3"]
depends_on: ["ST-028", "ST-005", "ST-004"]
---

# ST-029 — Duplicate and Delete Projects with Cleanup Scheduling

## Story

As a teacher, I want to duplicate a lesson variation or remove a project I no longer need.

## Outcome

Duplication creates an independent draft based on approved state, while deletion revokes access, cancels work, and schedules retained cleanup safely.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E2-US3, E2-US4, E21-US3
- `docs/reference/epic-technical-implementation-guide.md` — E2, E20, E21 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-028
- ST-005
- ST-004

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Implement project clone service with a new project ID and owner-scoped authorization.
- [ ] Reuse immutable source object safely while creating independent project metadata and current lesson state.
- [ ] Copy approved lesson data when available; do not make prior renders the active render.
- [ ] Implement soft deletion with confirmation.
- [ ] Revoke share links when present, reject new commands, request active job cancellation, and enqueue delayed object cleanup.
- [ ] Remove deleted projects from normal workspace queries.
- [ ] Audit duplication and deletion.

## Technical Implementation Requirements

- Duplication must not share mutable rows between projects.
- Deletion follows the technical guide retention sequence rather than immediately deleting every object.
- A duplicate opens in draft mode.
- Cancellation is best effort; a late worker result must not reactivate a deleted project.
- Only the owner can duplicate/delete.

## Contracts and Persistence

- Clone command/result.
- Project tombstone/deletion metadata.
- Cleanup job payload.

## Interfaces

- `POST /projects/:id/duplicate`.
- `DELETE /projects/:id`.
- Workspace actions and confirmation UI.

## Acceptance Criteria

- [ ] A duplicate has a new identifier and independent editable state.
- [ ] Prior rendered outputs are not the duplicate’s active render.
- [ ] Deleting hides the project and prevents further commands.
- [ ] Active jobs are cancelled or their later results are ignored.
- [ ] Object cleanup is scheduled according to retention policy.

## Required Tests

- [ ] Deep-clone integration test.
- [ ] Mutable-state isolation test.
- [ ] Delete/cancel race test.
- [ ] Cross-user tests.
- [ ] Retention cleanup job test.

## Out of Scope

- Permanent immediate purge UI.
- Bulk project operations.

## Story-Specific Notes

- Technical guide references: E2 and section 10.2.

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
