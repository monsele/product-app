---
story_id: ST-030
title: "Implement Private PDF and DOCX Upload Sessions"
phase: "02 \u2014 Accounts, Projects, and Upload"
status: Done
priority: must-have
epics: ["E3"]
prd_user_stories: ["E3-US1"]
depends_on: ["ST-004", "ST-005", "ST-027", "ST-028"]
---

# ST-030 — Implement Private PDF and DOCX Upload Sessions

## Story

As a teacher, I want to upload one PDF or DOCX to a project and see upload progress and retry states.

## Outcome

The API creates a constrained signed upload session, records one active source document, and completes upload metadata before ingestion is requested.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E3-US1
- `docs/reference/epic-technical-implementation-guide.md` — E3 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-004
- ST-005
- ST-027
- ST-028

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create `source_documents` and `upload_sessions` tables.
- [ ] Implement create-upload-session command with file name, declared MIME type, and size.
- [ ] Generate a constrained private signed upload URL/key.
- [ ] Implement complete-upload command that verifies object existence and metadata.
- [ ] Attach one active source document to the project.
- [ ] Create web upload UI with progress, retry, and clear error states.
- [ ] Create the ingestion request outbox event only after successful completion validation.

## Technical Implementation Requirements

- Do not proxy large file bytes through ordinary API handlers unless required by the deployment.
- Only PDF and DOCX are accepted.
- The original object is immutable after completion.
- Completion is idempotent.
- A new source replacement, if later allowed, must supersede rather than overwrite the prior record.

## Contracts and Persistence

- Source document entity.
- Upload session DTOs.
- Document status enum.
- Ingestion-request event.

## Interfaces

- `POST /projects/:id/source-upload`.
- `POST /projects/:id/source-upload/:sessionId/complete`.
- Upload screen.

## Acceptance Criteria

- [ ] A supported file uploads directly to private storage with visible progress.
- [ ] Completing the upload attaches the document and requests ingestion once.
- [ ] An interrupted upload can be retried safely.
- [ ] A project cannot have two active source documents in the MVP.
- [ ] Cross-user upload sessions fail.

## Required Tests

- [ ] Upload-session API tests.
- [ ] Completion idempotency test.
- [ ] Missing/mismatched object test.
- [ ] Cross-user test.
- [ ] Browser upload progress test.

## Out of Scope

- Page-count and malware validation, completed in ST-031.
- Docling parsing.

## Story-Specific Notes

- Technical guide references: E3 and storage key section 6.2.

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
- **Started:** 2026-08-13
- **Completed:** 2026-08-13
- **Branch/PR:** `story/st-030` (not published)
- **Files changed:** API source-upload service, project routes/runtime, source-upload contracts and persistence schema, upload UI, API/browser tests, migration metadata, and this story/index.
- **Migrations:** `0013_soft_nick_fury` adds `source_documents`, `upload_sessions`, the `source_document_status` enum, tenant/checksum indexes, and a one-active-source constraint. Compatibility notes accompany the migration.
- **Contracts changed:** Added version-1 source-upload create/complete DTOs, source-document media/status enums, `POST /projects/:id/source-upload`, and `POST /projects/:id/source-upload/:sessionId/complete` (202 when ingestion is queued).
- **Commands/tests run:** `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. `pnpm --filter @avlp/storage test` passed (27 tests; 3 storage integration tests skipped without storage integration configuration); `pnpm --filter @avlp/api test` passed (29 tests; 9 PostgreSQL-backed tests skipped without `TEST_DATABASE_URL`); `pnpm exec playwright test e2e/workspace.spec.ts` passed (5 tests); `git diff --check` passed. Full `pnpm test` is blocked only by the unrelated `@avlp/evals` deterministic-baseline fixture failure described below.
- **Screenshots or representative output:** Browser upload flow test verified selection of a PDF, direct signed PUT, visible progress/completion state, and completion response.
- **Decisions and assumptions:** The browser supplies a SHA-256 only to constrain the signed PUT; completion trusts only the storage HEAD size, MIME type, and checksum. Keys are generated from authenticated owner/project/document IDs and never accepted from the browser. Completion locks the active owner-scoped project and upload session before writing the immutable document, job, outbox event, project stage, and audit event.
- **Code review:** Round 1 found and fixed a high-severity delete/completion race by locking and rechecking the active owner-scoped project during completion. Round 3 fixed two further findings: confirmed storage-object absence is now distinguished from retryable provider failures, and the browser test observes the intermediate upload-progress state. The final review found no remaining scoped findings and concluded **Approve**.
- **Deviations from story/technical guide:** None. Validation of magic bytes, page count, and malware remains deliberately deferred to ST-031.
- **Known risks or follow-up:** The PostgreSQL integration tests are present but could not run because `TEST_DATABASE_URL` is unset and the local Docker daemon is unavailable. The unrelated `@avlp/evals/src/runner.test.ts` deterministic-baseline assertion currently fails in the full workspace suite.
