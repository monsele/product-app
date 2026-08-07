---
story_id: ST-027
title: "Enforce Project Resource Authorization and Tenant Isolation"
phase: "02 \u2014 Accounts, Projects, and Upload"
status: Ready
priority: must-have
epics: ["E1", "E21"]
prd_user_stories: ["E1-US4", "E21-US3"]
depends_on: ["ST-025", "ST-003", "ST-004"]
---

# ST-027 — Enforce Project Resource Authorization and Tenant Isolation

## Story

As a teacher, I want every project document, asset, lesson, render, and URL to be inaccessible to other accounts.

## Outcome

A reusable authorization layer enforces owner-scoped queries and signed-media access across all project-owned resources.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E1-US4, E21-US3
- `docs/reference/epic-technical-implementation-guide.md` — E1, E21 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-025
- ST-003
- ST-004

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create shared `assertProjectAccess` or resource-authorization service.
- [ ] Create owner-scoped repository patterns and query helpers.
- [ ] Add ownership columns/helpers to relevant future tables and a convention test.
- [ ] Implement authorization middleware/guards for project routes.
- [ ] Require authorization before generating signed object URLs.
- [ ] Create cross-user test utilities used by every later project feature.
- [ ] Define not-found versus forbidden response policy to minimize identifier disclosure.

## Technical Implementation Requirements

- UI checks are not authorization.
- Every project-owned query includes owner user ID or passes through an equivalent policy.
- Storage keys are tenant scoped and never accepted directly from untrusted client input.
- Share-link access is a separate explicit capability implemented later.
- Administrators do not implicitly bypass ownership without a documented policy.

## Contracts and Persistence

- `ProjectAccessPolicy`.
- Owner-scoped repository contract.
- Authorization test harness.

## Interfaces

- Route guard/decorator or middleware.
- Signed URL authorization wrapper.

## Acceptance Criteria

- [ ] Changing a project/resource identifier cannot expose another teacher’s data.
- [ ] Cross-user reads, updates, deletes, and signed URL requests fail.
- [ ] Owner-scoped repository tests catch an intentionally unscoped query.
- [ ] Authorization failures use the standard error envelope.

## Required Tests

- [ ] Cross-user API tests.
- [ ] Object URL authorization test.
- [ ] Repository scoping tests.
- [ ] Identifier enumeration behavior test.

## Out of Scope

- Organization sharing.
- Public share tokens.
- Administrator interface.

## Story-Specific Notes

- This story is a mandatory dependency for every project-owned endpoint. Technical guide principle 2.7.

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
