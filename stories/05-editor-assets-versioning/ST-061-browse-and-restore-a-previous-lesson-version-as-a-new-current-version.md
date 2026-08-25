---
story_id: ST-061
title: "Browse and Restore a Previous Lesson Version as a New Current Version"
phase: "05 \u2014 Storyboard Editing, Assets, and Versions"
status: Done
priority: must-have
epics: ["E20"]
prd_user_stories: ["E20-US2"]
depends_on: ["ST-060"]
---

# ST-061 — Browse and Restore a Previous Lesson Version as a New Current Version

## Story

As a teacher, I want to view earlier lesson states and restore one without deleting later history or detaching existing renders.

## Outcome

The version browser shows metadata and restoration creates a new version/current draft derived from the selected snapshot.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E20-US2
- `docs/reference/epic-technical-implementation-guide.md` — E20 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-060

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Implement version-list and version-detail/preview metadata APIs.
- [ ] Show creation time, creator, reason, duration, scene count, schema version, and render associations.
- [ ] Implement restore command with warning about unsaved/current changes.
- [ ] Clone selected snapshot into a new current version/draft rather than moving or deleting history.
- [ ] Keep existing renders attached to their original version.
- [ ] Audit restoration.

## Technical Implementation Requirements

- Restoration is one database transaction for pointer/version changes.
- Do not mutate or delete the source version.
- Schema compatibility/migration must be checked before restore.
- Restored derived artifacts are reused only when their content hashes remain valid.
- A stale restore request must not overwrite newer current work without confirmation/revision control.

## Contracts and Persistence

- Version restore command/result.
- Version summary/detail DTO.

## Interfaces

- `GET /projects/:id/versions`.
- `GET /projects/:id/versions/:versionId`.
- `POST /projects/:id/versions/:versionId/restore`.
- Version browser UI.

## Acceptance Criteria

- [ ] Teachers can list and inspect version metadata.
- [ ] Restoring creates a new version/current state.
- [ ] History and existing render associations remain intact.
- [ ] Incompatible schema versions are blocked with an actionable message.
- [ ] Concurrent/newer changes are protected.

## Required Tests

- [ ] Restore cloning test.
- [ ] History preservation test.
- [ ] Render association test.
- [ ] Schema incompatibility test.
- [ ] Concurrency/authorization tests.
- [ ] Version browser Playwright test.

## Out of Scope

- Diff visualization beyond metadata.
- Deleting individual versions.
- Branching/version merging.

## Story-Specific Notes

- Technical guide references: E20 and transaction guidance.

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
- **Started:** 2026-08-23
- **Completed:** 2026-08-23
- **Branch/PR:** Local branch `story/st-061`; no PR created.
- **Files changed:** Version API service/routes and tests; shared/database schemas; generated database migration; storyboard version-browser component and Playwright test; `STORY_INDEX.md`.
- **Migrations:** `0048_hesitant_alex_wilder.sql` adds the `restore` lesson-version reason and is registered in Drizzle metadata.
- **Contracts changed:** Version list now includes `currentVersionId`; added version-detail and restore-command DTOs plus `GET /projects/:id/versions/:versionId` and `POST /projects/:id/versions/:versionId/restore`.
- **Commands/tests run:** Schema test suite (250 tests); database/API/web typechecks; database/API/web lint; API lesson-version tests (7 tests); version-browser Playwright test; database/API builds; web production build; `git diff --check`; Drizzle migration generation and application against local PostgreSQL.
- **Screenshots or representative output:** Storyboard browser lists saved versions, previews duration/scene/schema metadata, and requires a confirmation before restore.
- **Decisions and assumptions:** Restore creates a new immutable child version plus a cloned storyboard draft/scenes, updates the current-version pointer transactionally, retains referenced artifacts/renders, validates portable LessonSpec/storyboard schemas, and writes a `version.restored` audit event. The current-version ID is the optimistic-concurrency guard.
- **Deviations from story/technical guide:** No render table exists before ST-068, so detail reports zero render associations while restore deliberately leaves all existing version references unchanged.
- **Known risks or follow-up:** Database-backed migration/restore integration coverage requires `TEST_DATABASE_URL`; the existing running development-process log changes were preserved and are unrelated.
