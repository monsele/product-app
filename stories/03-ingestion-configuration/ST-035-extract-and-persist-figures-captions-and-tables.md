---
story_id: ST-035
title: "Extract and Persist Figures, Captions, and Tables"
phase: "03 \u2014 Ingestion and Lesson Configuration"
status: Ready
priority: must-have
epics: ["E4"]
prd_user_stories: ["E4-US3"]
depends_on: ["ST-034", "ST-004"]
---

# ST-035 — Extract and Persist Figures, Captions, and Tables

## Story

As a teacher, I want figures and tables preserved because they may be essential to the lesson.

## Outcome

The ingestion pipeline stores figure assets, captions, table structures, provenance, and section associations without silently dropping failures.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E4-US3
- `docs/reference/epic-technical-implementation-guide.md` — E4 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-034
- ST-004

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Extract figure images or references from Docling output.
- [ ] Store each figure privately with stable IDs, page, caption, dimensions, checksum, and section proximity.
- [ ] Normalize tables into rows/cells while retaining a canonical raw representation.
- [ ] Associate figures/tables with nearby sections and content blocks.
- [ ] Create thumbnails for review where useful.
- [ ] Record extraction warnings for unsupported, missing, or malformed media.

## Technical Implementation Requirements

- Figure/table IDs must resolve through SourceRef.
- Image binaries live in object storage; queryable metadata lives in PostgreSQL.
- Table normalization must preserve row/column order and merged-cell information when available.
- Extraction failure is a warning unless it makes the document unusable.
- Do not make extracted textbook figures publicly accessible.

## Contracts and Persistence

- Extracted figure entity.
- Parsed table entity/cell structure.
- Figure/table source references.

## Interfaces

- Internal asset metadata queries.
- No teacher asset selection UI yet.

## Acceptance Criteria

- [ ] Extracted figures can be previewed through authorized URLs.
- [ ] Captions and page numbers remain attached.
- [ ] Tables retain deterministic row/column order.
- [ ] Nearby section associations are present.
- [ ] Failures produce visible warnings rather than silent omission.

## Required Tests

- [ ] Figure extraction fixture tests.
- [ ] Table normalization tests.
- [ ] Association-rule tests.
- [ ] Authorized URL test.
- [ ] Malformed media warning test.

## Out of Scope

- General asset catalog.
- AI illustration generation.
- Table-to-chart conversion.

## Story-Specific Notes

- Technical guide references: E4 and NormalizedDocument contract.

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
