---
story_id: ST-028
title: "Create and List Teacher Projects with Workspace Status"
phase: "02 \u2014 Accounts, Projects, and Upload"
status: Done
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

- [x] Create the `projects` table with owner, title, stage, latest failed operation, timestamps, revision, and soft-delete fields.
- [x] Implement project creation and owner-scoped query services.
- [x] Implement cursor-paginated project list and project detail endpoints.
- [x] Implement the initial project stage state machine beginning at `draft`.
- [x] Create workspace UI with title, last modified time, stage, failure indicator, and empty state.
- [x] Redirect a newly created project to its next workflow step.

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

- [x] A teacher can create a titled project and is recorded as owner.
- [x] The workspace shows only that teacher’s projects.
- [x] Project status and last modification time are displayed.
- [x] Pagination and empty state work.
- [x] Cross-user project opening fails.

## Required Tests

- [x] Project domain tests.
- [x] Create/list/detail API tests.
- [x] Cross-user tests.
- [x] Workspace Playwright test.
- [x] Stage transition unit test.

## Out of Scope

- Project duplication and deletion.
- Source upload.
- Rich project search/filtering.

## Story-Specific Notes

- Technical guide references: E2 and project state machine section 5.1.

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
- **Branch/PR:** Current `story/st-024` worktree, which the repository owner accepted for ST-027; no branch or PR was created because pre-existing approved changes were preserved.
- **Files changed:** `packages/database` project schema, migration, generated snapshot, and audit enum; `apps/api` project contracts, repository, controllers, runtime wiring, and tests; `apps/web` workspace/create proxy/upload-step routes; Playwright workspace fixture/test and configuration; this story, `STORY_INDEX.md`, API package manifest, and lockfile.
- **Migrations:** `0009_spicy_colleen_wing` creates `project_stage`, `projects`, the owner/deleted/updated list index, and `project.created` audit-event enum value. It is forward-only with compatibility notes.
- **Contracts changed:** Added shared Zod project response contracts (`ProjectStage`, summary/detail, create response, and opaque cursor page), stage-transition rules, title/create input validation, `ProjectRepository`, and `ProjectService`. Added authenticated `POST /projects`, `GET /projects`, and `GET /projects/:projectId` endpoints.
- **Commands/tests run:** Focused API, database, schema, and web lint/typecheck/test/build commands passed. `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed across the monorepo. Playwright workspace tests passed (4), including malformed list/create upstream API response handling. `pnpm test` still fails only in pre-existing `@avlp/evals` fixtures owned by ST-009; all affected project tests passed. Live database integration tests are present and skipped because `TEST_DATABASE_URL` is not configured.
- **Screenshots or representative output:** Playwright verified both the anonymous redirect to sign-in and the authenticated workspace: existing project title/status, project creation, and redirect to `/workspace/{projectId}/upload`.
- **Decisions and assumptions:** Project creation is transactional and writes a correlated `project.created` audit event. The current stage remains `draft` when created; later operation failures belong in `latest_failed_operation`, rather than replacing the last successful stage. Project queries filter both owner and `deleted_at`; detail routes retain ST-027's fail-closed authorization hook. The API and web layers share strict Zod response contracts, so API payloads are validated at each boundary; the web proxy forwards creation with the browser cookie/origin so the API CSRF policy remains enforced.
- **Deviations from story/technical guide:** None. The story intentionally implements only creation/list/detail and the initial stage rules; title editing, duplication, deletion, upload, operation-status resolution, and stage persistence updates remain owned by later stories.
- **Known risks or follow-up:** Run the live Postgres project integration suite in CI by supplying `TEST_DATABASE_URL`. Resolve the unrelated `@avlp/evals` fixture drift under ST-009 ownership. The next story, ST-029, owns duplication/deletion and cleanup scheduling.
- **Code review:** Round 1 identified project-create CSRF enforcement as missing; it was fixed and covered. Round 2 identified incomplete web-boundary validation and an unchecked owner-scoping acceptance criterion; strict shared response schemas, malformed-response browser coverage, and the checklist evidence were added. Round 3 found no remaining blocking, high, medium, or low in-scope findings, no technical deviations, and concluded **Approve**.
