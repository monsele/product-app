---
story_id: ST-033
title: "Run Docling Ingestion in an Isolated Python Worker"
phase: "03 \u2014 Ingestion and Lesson Configuration"
status: Done
priority: must-have
epics: ["E4"]
prd_user_stories: ["E4-US1"]
depends_on: ["ST-005", "ST-008", "ST-030", "ST-031"]
---

# ST-033 — Run Docling Ingestion in an Isolated Python Worker

## Story

As a teacher, I want the uploaded document parsed in the background while I can see progress and recover from failures.

## Outcome

A Python worker consumes validated ingestion jobs, invokes Docling, stores immutable canonical outputs, and publishes a structured completion result.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E4-US1
- `docs/reference/epic-technical-implementation-guide.md` — E4 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-005
- ST-008
- ST-030
- ST-031

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create the Python ingestion service with typed job-envelope parsing.
- [ ] Download the authorized source object to an isolated temporary workspace.
- [ ] Invoke Docling for supported PDF and DOCX inputs.
- [ ] Persist immutable Docling JSON and readable Markdown to private storage.
- [ ] Emit progress/heartbeat updates and structured completion/failure results.
- [ ] Clean temporary files on success and failure.
- [ ] Record parser version, configuration hash, processing time, and warnings.

## Technical Implementation Requirements

- The Python worker does not own teacher edits or lesson generation.
- It must not write arbitrary database rows directly; return results through the approved worker contract or internal API.
- Retry only classified transient failures.
- Use immutable versioned storage paths.
- Do not log full source text.

## Contracts and Persistence

- Ingestion job payload/result.
- Parser metadata.
- Canonical Docling object references.

## Interfaces

- BullMQ-compatible bridge or approved ingestion queue consumer.
- Worker health/heartbeat.
- No teacher review UI in this story.

## Acceptance Criteria

- [ ] A valid supported document creates canonical JSON and Markdown artifacts.
- [ ] The job reports queued/running/succeeded or classified failure states.
- [ ] A duplicated message does not create conflicting parser versions.
- [ ] Temporary source files are removed.
- [ ] Parser metadata is available for reproducibility.

## Required Tests

- [ ] Python unit tests with recorded parser fixtures.
- [ ] Job contract test between TypeScript and Python.
- [ ] Duplicate delivery test.
- [ ] Temporary-file cleanup test.
- [ ] Failure classification test.

## Out of Scope

- Application normalization.
- Figure/table persistence.
- OCR-quality UI.

## Story-Specific Notes

- Technical guide references: E4, service ownership, and immutable-output principle.

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
- **Started:** 2026-08-14
- **Completed:** 2026-08-14
- **Branch/PR:** Inherited local `story/st-032` worktree; no branch or PR published.
- **Files changed:** Isolated Python Docling service and fixture tests; versioned TypeScript/Python contract and HTTP client; ingestion job handler/runtime registration/integration tests; private storage write/copy/key support and tests; artifact persistence schema and migrations; renderer storage double compatibility; story index and this record.
- **Migrations:** `0018_bright_xorn.sql` adds the immutable Markdown object reference and makes the later normalization reference nullable; `0019_wooden_sunspot.sql` adds the ingestion-completed audit event value; `0020_mature_salo.sql` adds durable parser metadata and an artifact `staging`/`ready` lifecycle.
- **Contracts changed:** Adds `DoclingIngestionRequest` and `DoclingIngestionResult` v1, classified ingestion failures (including schema-normalization defects), private worker `putBytes`/`copy`, and parsed Markdown/staging storage keys. The ingestion-artifact contract now records canonical JSON, Markdown, parser metadata, and a publication state before ST-034 supplies its normalized JSON reference.
- **Commands/tests run:** Repository `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass. `pnpm --filter @avlp/pipeline-worker test` passes 26/26 with `TEST_DATABASE_URL` against disposable PostgreSQL 16, including recovery after a simulated crash before artifact promotion and overlapping duplicate delivery at both the validator-to-outbox and ingestion stages. Storage tests pass 29/29 plus 3 configuration-skipped external-storage tests. Python tests pass 8/8 in an isolated virtual environment with the pinned `docling==2.115.0`, including live golden PDF/DOCX conversion, cleanup, fail-closed authentication, and classification coverage. Full `pnpm test` continues to fail only in the pre-existing unrelated `@avlp/evals` deterministic baseline test; all affected ST-033 tests pass.
- **Screenshots or representative output:** No UI change. Representative result metadata records parser version, configuration hash, processing time, warning count, and the immutable artifact ID.
- **Decisions and assumptions:** The TypeScript worker creates a short-lived authorized source URL; Python downloads it only inside a temporary workspace and returns no database mutation. Python fails closed without its internal bearer token and executes Docling in a child process with wall-clock, CPU, and address-space limits. TypeScript persists opaque staging keys, promotes them to immutable final keys, then atomically makes the artifact ready with its project/audit/usage records. A canonical-only artifact is not reusable until ST-034 attaches its normalized result, preventing unsafe reuse.
- **Deviations from story/technical guide:** None. The temporary-key, database-commit, and promotion workflow required by E4 is now explicit. Linux deployment containers must retain matching CPU and memory limits; the service README documents this operational requirement.
- **Known risks or follow-up:** ST-034 owns normalization and will attach the immutable normalized object reference before the ST-032 reuse path becomes eligible. Docling may download its pinned OCR models on a clean worker image; production images should prewarm those models to avoid first-job latency.
- **Review remediation:** Closed the review findings for fail-closed internal authentication, Linux child-process resource limits, classified parser failures, version-aware idempotency keys, idempotent usage records, staged artifact promotion/recovery, live golden PDF/DOCX tests, and concurrent validator-to-outbox delivery. Final independent review found no remaining in-scope approval blocker.
