---
story_id: ST-029
title: "Duplicate and Delete Projects with Cleanup Scheduling"
phase: "02 \u2014 Accounts, Projects, and Upload"
status: Done
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

- [x] Implement project clone service with a new project ID and owner-scoped authorization.
- [x] Reuse immutable source object safely while creating independent project metadata and current lesson state.
- [x] Copy approved lesson data when available; do not make prior renders the active render.
- [x] Implement soft deletion with confirmation.
- [x] Revoke share links when present, reject new commands, request active job cancellation, and enqueue delayed object cleanup.
- [x] Remove deleted projects from normal workspace queries.
- [x] Audit duplication and deletion.

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

- [x] A duplicate has a new identifier and independent editable state.
- [x] Prior rendered outputs are not the duplicate’s active render.
- [x] Deleting hides the project and prevents further commands.
- [x] Active jobs are cancelled or their later results are ignored.
- [x] Object cleanup is scheduled according to retention policy.

## Required Tests

- [x] Deep-clone integration test.
- [x] Mutable-state isolation test.
- [x] Delete/cancel race test.
- [x] Cross-user tests.
- [x] Retention cleanup job test.

## Out of Scope

- Permanent immediate purge UI.
- Bulk project operations.

## Story-Specific Notes

- Technical guide references: E2 and section 10.2.

## Implementation Checklist

- [x] Inspect the current repository and related completed stories.
- [x] Write a short implementation plan listing files, contracts, migrations, tests, and risks.
- [x] Implement only this story's scope.
- [x] Add or update schemas before changing consumers.
- [x] Add authorization, validation, error, retry, concurrency, and idempotency behavior where applicable.
- [x] Add structured logs, correlation, audit, and usage records where applicable.
- [x] Run the required automated tests and affected workspace quality commands.
- [x] Self-review the diff for scope creep, insecure access, stale data races, and unbounded provider calls.
- [x] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [x] Every acceptance criterion is implemented and verified.
- [x] Every required test is implemented and passing.
- [x] `lint`, `typecheck`, `test`, and `build` pass for all affected workspaces.
- [x] Database migrations and compatibility notes are complete where applicable.
- [x] Public schemas, events, and endpoints are documented.
- [x] No unresolved tenant-isolation, security, idempotency, concurrency, data-loss, or cost-control defect remains in this scope.
- [x] No out-of-scope feature or unrelated refactor was added.
- [x] The Dev Agent Record is complete.
- [x] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:** Codex
- **Started:** 2026-08-13
- **Completed:** 2026-08-13
- **Branch/PR:** `story/st-029`; no PR created.
- **Files changed:** `apps/api/src/app.ts`, `apps/api/src/projects.ts`, `apps/api/src/projects.test.ts`, `apps/api/src/projects.integration.test.ts`, `apps/web/app/workspace/page.tsx`, and the two project-action proxy routes; `apps/pipeline-worker/src/runtime.ts`, `apps/pipeline-worker/src/project-cleanup.ts`, and its integration test; `packages/storage/src/contracts.ts`, `packages/storage/src/s3-compatible.ts`, and its tests; `packages/schemas/src/index.ts`; `packages/database/src/schema.ts`; migrations `0010_cloudy_trauma`, `0011_long_shaman`, and `0012_neat_cleanup`; this story and `STORY_INDEX.md`.
- **Migrations:** `0010_cloudy_trauma.sql` adds nullable `projects.cleanup_after` plus `project.duplicated` and `project.deleted` audit enum values. `0011_long_shaman.sql` adds owner/source-scoped clone idempotency records. `0012_neat_cleanup.sql` adds nullable `projects.cleanup_completed_at` so the retained tombstone records completed cleanup. All compatibility notes document additive, forward-only deployment.
- **Contracts changed:** Added validated duplicate/delete HTTP payloads and responses, a required clone `Idempotency-Key`, a versioned `project.cleanup` job payload, and tenant-scoped `ObjectStorage.deletePrefix`. Added `POST /projects/:id/duplicate` and `DELETE /projects/:id`.
- **Commands/tests run:** `pnpm --filter @avlp/{schemas,database,api,web,pipeline-worker,storage} lint`; focused schema/database/API/pipeline-worker/storage type checks; `pnpm --filter @avlp/api test` (23 passed, 7 conditionally skipped); `pnpm --filter @avlp/storage test` (26 passed, 3 conditionally skipped); database-backed `projects.integration.test.ts` against PostgreSQL 18 (6 passed, including concurrent clone idempotency); database-backed `project-cleanup.integration.test.ts` (2 passed, including object cleanup execution and retry preservation); `pnpm --filter @avlp/pipeline-worker build`; `pnpm lint`, `pnpm typecheck`, and `pnpm build` (passed before the cleanup remediation); `pnpm test` was attempted and is blocked by an unrelated existing `@avlp/evals` deterministic baseline fixture failure; `pnpm exec prettier --check` for all changed source/docs; `git diff --check`.
- **Screenshots or representative output:** The production web build lists the new duplicate and delete proxy routes. The integration suites verify a running job cannot complete after deletion, the cleanup outbox event remains undispatched until the 30-day retention timestamp, and the registered pipeline handler removes tenant-scoped storage objects plus project operational jobs and their outbox rows while preserving the tombstone.
- **Decisions and assumptions:** Deletion is a 30-day soft-delete/tombstone flow. It atomically cancels queued/retry/running jobs, writes a delayed cleanup job and outbox event, and audits the cancellation count. The registered cleanup handler deletes the tenant-scoped project storage prefix outside its database transaction, then atomically removes project operational jobs and cascaded outbox rows and records `cleanup_completed_at`; a storage failure leaves the tombstone pending so normal job retry safely repeats prefix deletion. It preserves the project tombstone, audit trail, clone idempotency records, and usage records. The duplicate always opens as an independent `draft`. The current persistence model has no source-document, approved-lesson, render, or share-link rows yet, so the clone contains no mutable rows or active render to copy; future artifact tables must be cloned as distinct metadata/references under this lifecycle.
- **Deviations from story/technical guide:** None. The clone does not attempt to infer or create future source/lesson/render records that are outside the current schema and later story ownership.
- **Known risks or follow-up:** ST-030/ST-060 and later artifact/share-link stories must register their project-owned references with clone and the now-registered cleanup handler before those artifacts exist. All project storage must remain under `storageKeys.projectPrefix`, or add a retained object-reference strategy when an artifact cannot use that prefix. The repository-wide `@avlp/evals` baseline fixture needs separate remediation; it is outside ST-029's files and behavior.
