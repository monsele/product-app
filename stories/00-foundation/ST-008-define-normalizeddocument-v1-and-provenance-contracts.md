---
story_id: ST-008
title: "Define NormalizedDocument v1 and Provenance Contracts"
phase: "00 \u2014 Foundation"
status: Ready
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

- [ ] Create NormalizedDocument v1 and JSON Schema.
- [ ] Define hierarchical sections with stable IDs, order, level, page range, block IDs, figure IDs, and table IDs.
- [ ] Define paragraph, list, equation, caption, and extensible unsupported block handling.
- [ ] Define figure, table, ingestion warning, and source-reference schemas.
- [ ] Define canonical source-package schema used by AI prompts.
- [ ] Create representative clean, figure-heavy, table-heavy, and poor-quality fixtures.

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

- [ ] All fixtures validate or fail for the intended reason.
- [ ] Every content item resolves to a document and page.
- [ ] Section hierarchy can be reconstructed deterministically.
- [ ] Docling-specific response types do not leak into the contract.

## Required Tests

- [ ] Schema unit tests.
- [ ] Hierarchy validation tests.
- [ ] Duplicate/stale ID tests.
- [ ] Provenance completeness tests.

## Out of Scope

- Docling parsing.
- Teacher corrections.
- Database rows.

## Story-Specific Notes

- Technical guide references: sections 4.2, 9.3, and E4.

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
