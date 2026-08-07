---
story_id: ST-003
title: "Establish PostgreSQL and Drizzle Database Foundations"
phase: "00 \u2014 Foundation"
status: Ready
priority: must-have
epics: ["E21"]
prd_user_stories: ["E21-US1", "E21-US3"]
depends_on: ["ST-001", "ST-002"]
---

# ST-003 — Establish PostgreSQL and Drizzle Database Foundations

## Story

As the engineering team, we need a safe database foundation so feature stories can add tables through reviewed migrations and test real persistence behavior.

## Outcome

The API and workers can access PostgreSQL through one owned database package with migration and integration-test conventions.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E21-US1, E21-US3
- `docs/reference/epic-technical-implementation-guide.md` — E21 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-001
- ST-002

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Configure Drizzle ORM and migration tooling.
- [ ] Create database connection pooling and lifecycle management.
- [ ] Create shared column helpers for UUID, UTC timestamps, revisions, soft deletion, and ownership.
- [ ] Create a migration journal and documented naming conventions.
- [ ] Create transaction helpers and optimistic-concurrency utilities.
- [ ] Create isolated integration-test database setup and cleanup.
- [ ] Add a minimal schema-version or migration smoke table if required by tooling.

## Technical Implementation Requirements

- The database package is the only package allowed to own migrations.
- Do not hold database transactions open across object storage, AI, TTS, or rendering calls.
- Support PostgreSQL JSONB for versioned snapshots while reserving normalized rows for permissions, lists, status, and ordering.
- Repository code must accept a transaction context.
- Use UTC values consistently.

## Contracts and Persistence

- Database client interface.
- Transaction callback/helper.
- Optimistic concurrency error.
- Base ownership and audit column helpers.

## Interfaces

- Migration commands.
- Test database factory.
- API startup database health check.

## Acceptance Criteria

- [ ] A migration can be generated, applied, and reverted or accompanied by compatibility notes.
- [ ] Integration tests execute against PostgreSQL rather than an in-memory substitute.
- [ ] Concurrent update helpers detect stale revisions.
- [ ] No domain tables from later stories are prematurely implemented.

## Required Tests

- [ ] Migration apply smoke test.
- [ ] Transaction rollback test.
- [ ] Optimistic concurrency test.
- [ ] Connection failure health-check test.

## Out of Scope

- Feature-specific tables.
- Database access from React components.
- Large media blob storage.

## Story-Specific Notes

- Technical guide references: sections 4.1 and 10.

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
