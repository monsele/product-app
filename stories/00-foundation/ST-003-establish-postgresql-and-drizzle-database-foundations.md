---
story_id: ST-003
title: "Establish PostgreSQL and Drizzle Database Foundations"
phase: "00 \u2014 Foundation"
status: Done
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

- **Agent:** Codex
- **Started:** 2026-08-07
- **Completed:** 2026-08-07
- **Branch/PR:** `main` (the existing worktree contained uncommitted ST-001/ST-002 work, so no branch switch or publication was attempted)
- **Files changed:** `packages/database/**`, `packages/config/src/index.ts`, `packages/config/src/index.test.ts`, `apps/api/package.json`, `apps/api/src/app.ts`, `apps/api/src/app.test.ts`, `apps/api/src/main.ts`, `.github/workflows/ci.yml`, `.prettierignore`, `docker-compose.yml`, `eslint.config.mjs`, `turbo.json`, `pnpm-lock.yaml`, `STORY_INDEX.md`, and this story record.
- **Migrations:** Added generated Drizzle migration `0000_dark_phalanx` for the infrastructure-only `database_metadata` smoke table and its journal/snapshot. Its compatibility note requires a reviewed forward migration or restore plan rather than deleting the shared Drizzle journal.
- **Contracts changed:** Added pooled `DatabaseConnection`/`DatabaseClient`, repository `DatabaseExecutor` and transaction context/callback, migration runner, UUID/UTC timestamp/revision/soft-deletion/ownership column helpers, optimistic concurrency error/assertion utilities, and isolated PostgreSQL test database factory. Test database administration is available only from `@avlp/database/testing` and rejects non-test runtimes. API startup and `GET /health` now verify PostgreSQL and close the pool on application shutdown. PostgreSQL URLs are validated at configuration and connection boundaries.
- **Commands/tests run:** `pnpm install`; `pnpm --filter @avlp/database db:generate`; focused config/database/API lint, typecheck, test, and build commands; PostgreSQL-backed `pnpm --filter @avlp/database test` (9 passed); `TEST_DATABASE_URL=... pnpm test` (all workspace tests passed, including 9 database tests); `pnpm format:check`; `pnpm run ci` (lint, typecheck, tests, and builds passed).
- **Screenshots or representative output:** PostgreSQL integration suite reports 4 test files and 9 tests passed; it creates and destroys isolated databases while verifying migration idempotency, transaction rollback, stale-revision rejection, and test-runtime protection. API failure injection returns a redacted retryable `503` without exposing the connection error.
- **Decisions and assumptions:** Application code generates sortable UUIDs; PostgreSQL stores UUIDs without sequential public IDs. `timestamptz`/`Date` is the UTC persistence boundary. Integration tests may skip for ordinary package-only runs without `TEST_DATABASE_URL`, while CI always supplies a real PostgreSQL 16 service and Turborepo explicitly propagates the variable. The Compose host port is configurable through `POSTGRES_PORT` for developer machines with an existing PostgreSQL listener. Test cleanup creates a fresh administrative connection on each attempt and marks itself complete only after the database is removed.
- **Deviations from story/technical guide:** None. No later-story domain tables, object blobs, queue/job records, or tenant repositories were added.
- **Known risks or follow-up:** The isolated test factory requires a PostgreSQL role allowed to create/drop databases; the documented development and CI role has that permission. Production migrations require a separately governed least-privilege migration identity. ST-005 owns outbox/job persistence and will consume the transaction context established here.
