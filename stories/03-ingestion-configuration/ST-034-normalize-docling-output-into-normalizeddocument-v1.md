---
story_id: ST-034
title: "Normalize Docling Output into NormalizedDocument v1"
phase: "03 \u2014 Ingestion and Lesson Configuration"
status: Done
priority: must-have
epics: ["E4"]
prd_user_stories: ["E4-US1", "E4-US2"]
depends_on: ["ST-008", "ST-033", "ST-003", "ST-004"]
---

# ST-034 — Normalize Docling Output into NormalizedDocument v1

## Story

As the product system, I need parser output converted into a stable application schema so later features are insulated from Docling changes.

## Outcome

A versioned adapter transforms canonical Docling output into validated NormalizedDocument JSON and queryable document/section/block metadata.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E4-US1, E4-US2
- `docs/reference/epic-technical-implementation-guide.md` — E4 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-008
- ST-033
- ST-003
- ST-004

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Implement a Docling-to-NormalizedDocument adapter.
- [ ] Reconstruct section hierarchy and reading order.
- [ ] Remove or mark repeated headers and footers using deterministic rules.
- [ ] Assign stable section/block IDs within the parsed version.
- [ ] Validate normalized output before persistence.
- [ ] Store immutable normalized JSON and clean Markdown references.
- [ ] Create parsed-document, section, and content-block database records sufficient for review and source lookup.

## Technical Implementation Requirements

- Never mutate canonical Docling JSON.
- The adapter is the only layer that understands Docling-specific structures.
- Unknown blocks create warnings rather than silent loss.
- A normalized version records parser version, adapter version, and schema version.
- Use one database transaction for importing normalized metadata after external artifacts exist.

## Contracts and Persistence

- Parsed document/version entities.
- Section and content-block entities.
- NormalizedDocument v1 storage reference.

## Interfaces

- Internal ingestion-completion handler.
- Parsed document query repository.

## Acceptance Criteria

- [ ] A canonical parser fixture produces valid NormalizedDocument v1.
- [ ] Section hierarchy, reading order, page references, and stable IDs are preserved.
- [ ] Repeated headers/footers are removed or clearly warned.
- [ ] Unsupported blocks are traceable.
- [ ] A normalization failure does not destroy canonical parser output.

## Required Tests

- [ ] Golden-file adapter tests.
- [ ] Hierarchy/order tests.
- [ ] Header/footer rule tests.
- [ ] Unknown block tests.
- [ ] Transactional import failure test.

## Out of Scope

- Teacher corrections.
- AI source packaging.
- Figure binary extraction details.

## Story-Specific Notes

- Technical guide references: E4 and core contract 4.2.

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
- **Started:** 2026-08-15
- **Completed:** 2026-08-15
- **Branch/PR:** Existing working branch; no publish requested.
- **Files changed:** `apps/pipeline-worker/src/docling-normalizer.ts`, ingestion handler and tests, tenant-scoped parsed-document repository, database schema/migration, normalized staging key and test.
- **Migrations:** `0021_living_maddog` creates `parsed_documents`, `parsed_sections`, and `content_blocks`; compatibility note added.
- **Contracts changed:** Internal `NormalizedDocument` persistence now records parser, adapter, and schema versions and uses immutable normalized storage keys; no new public HTTP endpoint.
- **Commands/tests run:** Focused adapter tests; pipeline-worker tests/lint/typecheck/build; API/database/storage/schema builds and checks; root lint/typecheck/build. The complete pipeline-worker suite passes with a local Compose PostgreSQL `TEST_DATABASE_URL` (32 tests), including transactional-import, normalization-failure, idempotency, and concurrency coverage. Root test remains red only for the pre-existing `@avlp/evals` baseline-fixture failure.
- **Screenshots or representative output:** Golden Docling fixture produces heading hierarchy `Water cycle > Condensation` with ordered paragraph/list blocks and page provenance.
- **Decisions and assumptions:** Stable UUIDv7-shaped IDs are deterministically derived from artifact, page, kind, order, and content. Canonical, Markdown, and normalized JSON are written to staging, promoted, then their metadata is imported in one transaction.
- **Deviations from story/technical guide:** None.
- **Known risks or follow-up:** Ensure CI supplies `TEST_DATABASE_URL`; existing historical ready artifacts are not backfilled by this story.
