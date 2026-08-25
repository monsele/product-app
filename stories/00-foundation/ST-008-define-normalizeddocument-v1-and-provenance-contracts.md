---
story_id: ST-008
title: "Define NormalizedDocument v1 and Provenance Contracts"
phase: "00 \u2014 Foundation"
status: Done
priority: must-have
epics: ["E4", "E5", "E19"]
prd_user_stories: ["E4-US2", "E4-US3", "E5-US1", "E19-US1"]
depends_on: ["ST-001", "ST-002"]
---

# ST-008 — Define NormalizedDocument v1 and Provenance Contracts

## Story

As the system, we need an application-owned document schema so downstream features do not depend directly on Docling output.

## Outcome

A strict versioned schema represents section hierarchy, content blocks, figures, tables, warnings, pages, and stable source references.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E4-US2, E4-US3, E5-US1, E19-US1
- `docs/reference/epic-technical-implementation-guide.md` — E4, E5, E19 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-001
- ST-002

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [x] Create NormalizedDocument v1 and JSON Schema.
- [x] Define hierarchical sections with stable IDs, order, level, page range, block IDs, figure IDs, and table IDs.
- [x] Define paragraph, list, equation, caption, and extensible unsupported block handling.
- [x] Define figure, table, ingestion warning, and source-reference schemas.
- [x] Define canonical source-package schema used by AI prompts.
- [x] Create representative clean, figure-heavy, table-heavy, and poor-quality fixtures.

## Technical Implementation Requirements

- Raw Docling JSON remains separate and immutable.
- Every block, figure, and table has a stable identifier and page provenance.
- Unknown parser blocks are logged and represented as warnings rather than silently discarded.
- The application schema must be usable without importing Python or Docling types.
- Use language `en` for MVP.

## Contracts and Persistence

- `NormalizedDocument`.
- `NormalizedSection`.
- `ContentBlock`.
- `ExtractedFigure`.
- `ParsedTable`.
- `IngestionWarning`.
- `SourcePackage`.

## Interfaces

- Package exports for ingestion adapter, API, pipeline worker, and review UI.
- JSON Schema generation.

## Acceptance Criteria

- [x] All fixtures validate or fail for the intended reason.
- [x] Every content item resolves to a document and page.
- [x] Section hierarchy can be reconstructed deterministically.
- [x] Docling-specific response types do not leak into the contract.

## Required Tests

- [x] Schema unit tests.
- [x] Hierarchy validation tests.
- [x] Duplicate/stale ID tests.
- [x] Provenance completeness tests.

## Out of Scope

- Docling parsing.
- Teacher corrections.
- Database rows.

## Story-Specific Notes

- Technical guide references: sections 4.2, 9.3, and E4.

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
- **Started:** 2026-08-08
- **Completed:** 2026-08-08
- **Branch/PR:** `story/st-005-job-platform` / not published; retained because the worktree already contained unrelated changes.
- **Files changed:** `packages/schemas/src/index.ts`, `packages/schemas/src/normalized-document.test.ts`, `packages/schemas/fixtures/normalized-document/*`, `packages/schemas/normalized-document-v1.schema.json`, `packages/schemas/NORMALIZED_DOCUMENT_COMPATIBILITY.md`, generator script and package script, plus this story and `STORY_INDEX.md`.
- **Migrations:** None; this story defines portable contracts only.
- **Contracts changed:** Strict `NormalizedDocument` v1, section/block/figure/table/warning contracts, `SourcePackage`, parsers, types, and named JSON Schema.
- **Commands/tests run:** `pnpm --filter @avlp/schemas generate:normalized-document-json-schema`; package `test` (20 passing), `typecheck`, `lint`, and `build`; focused `prettier --check`; `git diff --check`; repository `lint` passed. Repository `typecheck`, `test`, and `build` are blocked by pre-existing uncommitted ST-007 work removing `packageBoundary`, which `@avlp/test-fixtures` still imports. Repository `format:check` is blocked by the unrelated `pnpm-lock.yaml`; all ST-008 files pass focused formatting.
- **Screenshots or representative output:** Four schema fixtures cover clean, figure-heavy, table-heavy, and poor-quality parser output.
- **Decisions and assumptions:** Keep raw parser data outside this contract; unknown blocks retain minimal raw data and require a warning. Blocks carry optional normalized page-relative bounding boxes when available. Stable IDs are validated at the boundary; deterministic ID creation remains the future ingestion adapter's responsibility.
- **Deviations from story/technical guide:** None. Asset storage/authorized previews are explicitly deferred to ST-035. Immutable snapshotting and bounded source-package selection are explicitly deferred to ST-042; this story provides only the portable package shape.
- **Known risks or follow-up:** The future normalizer must deterministically derive UUIDv7-compatible stable IDs and preserve its mapping across harmless reruns. ST-035 must associate figures with private asset metadata, and ST-042 must bound selected prompt content. Resolve the unrelated `packageBoundary` transition before expecting repository-wide typecheck, test, or build to pass.
