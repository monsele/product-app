---
story_id: ST-027
title: "Enforce Project Resource Authorization and Tenant Isolation"
phase: "02 \u2014 Accounts, Projects, and Upload"
status: In Review
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

- [x] Create shared `assertProjectAccess` or resource-authorization service.
- [x] Create owner-scoped repository patterns and query helpers.
- [x] Add ownership columns/helpers to relevant future tables and a convention test.
- [x] Implement authorization middleware/guards for project routes.
- [x] Require authorization before generating signed object URLs.
- [x] Create cross-user test utilities used by every later project feature.
- [x] Define not-found versus forbidden response policy to minimize identifier disclosure.

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

- [x] Changing a project/resource identifier cannot expose another teacher’s data.
- [x] Cross-user reads, updates, deletes, and signed URL requests fail.
- [x] Owner-scoped repository tests catch an intentionally unscoped query.
- [x] Authorization failures use the standard error envelope.

## Required Tests

- [x] Cross-user API tests.
- [x] Object URL authorization test.
- [x] Repository scoping tests.
- [x] Identifier enumeration behavior test.

## Out of Scope

- Organization sharing.
- Public share tokens.
- Administrator interface.

## Story-Specific Notes

- This story is a mandatory dependency for every project-owned endpoint. Technical guide principle 2.7.

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
- [ ] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:** Codex
- **Started:** 2026-08-13
- **Completed:** 2026-08-13
- **Branch/PR:** Current `story/st-024` worktree; no branch or PR was created because unrelated, uncommitted ST-024 changes were already present and were preserved.
- **Files changed:** `packages/auth` project policy/service/repository contract/test fixtures and documentation; `apps/api` project-route authorization hook, tests, and documentation; `packages/storage` authorized project object URL wrapper, tests, exports, and documentation; `packages/database` ownership-column helper, schema convention assertion/tests, and exports; this story and `STORY_INDEX.md`.
- **Migrations:** None. ST-028 owns the future `projects` table; the project ownership helper refactors existing Drizzle declarations without changing their SQL shape.
- **Contracts changed:** Added version 1 `ProjectAccessPolicy`, `ProjectAccessScope`, `OwnerScopedProjectRepository`, `ProjectAuthorizationService`, cross-user fixture utilities, `ProjectRouteAuthorizer`, `AuthorizedProjectStorage`, semantic project-object locators, and signed project upload/download request schemas. The authenticated user ID is deliberately a separate server-context argument and is not part of either signed-URL request DTO. User-authorized upload locators are limited to `source_original` and `asset_original`; generated/immutable artifact locators are download-only at this boundary.
- **Commands/tests run:** Affected `@avlp/auth`, `@avlp/api`, `@avlp/storage`, and `@avlp/database` lint, typecheck, test, and build all passed. Repository-wide `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. `pnpm test` remains red only in unrelated `@avlp/evals`: the pre-existing `figure` and `low-quality` baseline fixtures no longer parse as valid `LessonSpec`; `pnpm --filter @avlp/evals test` and `eval` reproduced it. `TEST_DATABASE_URL` and `STORAGE_INTEGRATION` were not configured, so live Postgres/MinIO suites were skipped.
- **Screenshots or representative output:** API authorization suite: 6 passed; auth project-access suite: 3 passed; storage suite: 25 passed with 3 live-provider tests skipped; database suite: 8 passed with 3 live-Postgres tests skipped. Cross-user GET/PUT/DELETE and signed URL requests return 404 without invoking protected handlers/signers; foreign and missing identifiers return identical standard envelopes; a client-claimed owner identity and upload requests targeting derived artifacts cannot reach the signer.
- **Decisions and assumptions:** Project existence is concealed by default with a 404 policy; forbidden responses require an explicit future policy. Route authorization and owner-scoped repositories are both mandatory. Storage callers pass the authenticated principal separately and provide semantic object locators, never owner identities or raw keys, in public DTOs. Only original source documents and teacher replacement assets are user-authorized upload targets; trusted workers own parser, audio, render, and thumbnail writes. The API fails closed with 503 when project routes are registered before a production authorizer is composed.
- **Deviations from story/technical guide:** None. A production Drizzle project repository is intentionally deferred to ST-028 with the `projects` table; ST-027 supplies and tests the mandatory owner-scoped contract and fail-closed convention now.
- **Known risks or follow-up:** ST-028 must implement the production `OwnerScopedProjectRepository` with a query constrained by both `projects.id` and `projects.owner_user_id`, inject it into API startup, and add live Postgres cross-user coverage. Production object URL endpoints must compose `AuthorizedProjectStorage`; lower-level storage signing remains an infrastructure primitive. The unrelated `@avlp/evals` fixture drift should be resolved under ST-009 ownership.
- **Code review:** Round 1 fixed a high-severity principal-spoofing boundary by separating the authenticated user ID from signed-URL DTOs. Round 2 fixed a medium-severity immutability boundary by restricting user-authorized uploads to original sources and replacement assets. Round 3 found no remaining findings or technical deviations and concluded **Approve**.
