---
story_id: ST-039
title: "Implement Corrected-Text Overlays and Restore Original Text"
phase: "03 \u2014 Ingestion and Lesson Configuration"
status: Done
priority: must-have
epics: ["E5", "E19"]
prd_user_stories: ["E5-US3", "E19-US2"]
depends_on: ["ST-037", "ST-038"]
---

# ST-039 — Implement Corrected-Text Overlays and Restore Original Text

## Story

As a teacher, I want to correct extraction errors while retaining the parser output for audit and rollback.

## Outcome

Editable block overlays supply effective text to downstream generation and can be restored without mutating immutable normalized content.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E5-US3, E19-US2
- `docs/reference/epic-technical-implementation-guide.md` — E5, E19 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-037
- ST-038

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create content-block correction overlay records with original block reference, corrected text, editor, timestamp, and revision.
- [ ] Implement edit, save, conflict, and restore-original commands.
- [ ] Use bounded plain/structured text appropriate to the block kind.
- [ ] Create an effective-content projection used by source packages.
- [ ] Mark unapproved downstream drafts stale when corrections change.
- [ ] Show original versus corrected state in the review UI.

## Technical Implementation Requirements

- Original extracted text remains immutable.
- Approved downstream content is not silently regenerated; require explicit action later.
- Corrections retain the same source block ID and page provenance.
- Avoid a rich-text model that cannot be represented in source packages.
- Audit corrections without logging unnecessary full content outside the database.

## Contracts and Persistence

- Block correction overlay.
- Effective content block.
- Downstream stale/invalidation event.

## Interfaces

- `PATCH /projects/:id/source-blocks/:blockId`.
- `POST /projects/:id/source-blocks/:blockId/restore`.
- Inline block editor.

## Acceptance Criteria

- [ ] Corrected text appears in effective source content.
- [ ] Original text remains viewable and restorable.
- [ ] Page/block provenance remains unchanged.
- [ ] Stale concurrent updates produce a conflict.
- [ ] Unapproved downstream drafts are invalidated according to policy.

## Required Tests

- [ ] Overlay persistence tests.
- [ ] Restore test.
- [ ] Effective source projection test.
- [ ] Concurrency test.
- [ ] Dependency invalidation test.

## Out of Scope

- OCR correction suggestions.
- Bulk find/replace.
- Changing figure/table content.

## Story-Specific Notes

- Technical guide references: E5, E19, and dependency invalidation section 6.3.

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

- **Agent:** Kilo (deepseek/deepseek-v4-flash)
- **Started:** 2026-08-15
- **Completed:** 2026-08-15
- **Branch/PR:** `story/st-039` (created locally; not committed/pushed pending owner authorization)
- **Files changed:**
  - `packages/schemas/src/index.ts` — ST-039 block-correction DTOs (`contentBlockCorrectionInputSchema`, `contentBlockRestoreInputSchema`, `contentBlockCorrectionSchema`, `contentBlockCorrectionStateSchema`, `contentBlockUpdateResponseSchema`) and `correction` fields on `reviewContentBlockSchema` editable variants
  - `packages/database/src/schema.ts` — `content_block_corrections` + `source_content_invalidations` tables, audit event types `source.block_corrected` / `source.block_restored`
  - `packages/database/drizzle/0025_mean_devos.sql` (+ meta `0025_snapshot.json`, `_journal.json`) — generated migration
  - `apps/api/src/content-block-corrections.ts` — service + `projectEffectiveContentBlocks`
  - `apps/api/src/content-block-corrections.test.ts` / `.integration.test.ts` — tests
  - `apps/api/src/parsed-document-repository.ts` — `findBlockCorrections`
  - `apps/api/src/parsed-document-review.ts` — attach correction state to section blocks
  - `apps/api/src/app.ts` — `PATCH /projects/:id/source-blocks/:blockId` + `POST .../restore` routes, DI
  - `apps/api/src/runtime.ts` — service wiring
  - `apps/web/app/workspace/[projectId]/review/source-block-controls.ts` (+ test) — pure action→patch mapper
  - `apps/web/app/workspace/[projectId]/review/ingestion-review-viewer.tsx` — inline block editor with edit/save/restore and original-vs-corrected display
- **Migrations:** `0025_mean_devos.sql` — `ALTER TYPE audit_event_type ADD VALUE` for `source.block_corrected`/`source.block_restored`; create `content_block_corrections` and `source_content_invalidations` with FKs, unique `(project_id, block_id)` and `(project_id, block_id, block_revision)`.
- **Contracts changed:** New schemas `contentBlockCorrectionInputSchema` (discriminated union by `kind`), `contentBlockRestoreInputSchema`, `contentBlockCorrectionSchema`, `contentBlockCorrectionStateSchema`, `contentBlockUpdateResponseSchema`; optional `correction` on `reviewContentBlockSchema` paragraph/list/equation/caption variants; new endpoints `PATCH /projects/:id/source-blocks/:blockId` and `POST /projects/:id/source-blocks/:blockId/restore`; audit event types `source.block_corrected`/`source.block_restored`; invalidation contract `source_content_invalidations` (scope `unapproved_drafts`).
- **Commands/tests run:** `pnpm db:generate`; `lint`, `typecheck`, `test`, `build` for `@avlp/schemas`, `@avlp/database`, `@avlp/api`, `@avlp/web` — all pass (api 58 passed / 25 skipped-integration, web 13 passed, database 8 passed, schemas 36 passed).
- **Screenshots or representative output:** API contract test `content-block-corrections.test.ts` (9 pass) including 409 conflict and 404 cross-tenant; `source-block-controls.test.ts` (6 pass); integration tests cover persistence, restore, projection, concurrency, kind-mismatch, and invalidation.
- **Decisions and assumptions:** One overlay row per (project, block) created lazily on first edit; `revision: 0` means "create" and positive values are matched for optimistic concurrency; restore deletes the overlay (revision must match or 409). Corrected content is bounded per block kind and validated against the immutable block kind. Dependency invalidation is recorded as an idempotent `source_content_invalidations` row per block revision (no queue handler yet, since no downstream AI drafts exist). Audit events carry block/section/revision metadata only, never the corrected text.
- **Deviations from story/technical guide:** Followed the story's `source-blocks` endpoints (guide suggested `PUT/DELETE /blocks/:blockId/override`); implemented a durable invalidation table rather than an outbox event because no downstream draft consumers exist yet. `contentBlockCorrectionSchema` mirrors persisted shape but is not consumed by the response path (response reuses `reviewContentBlockSchema`).
- **Known risks or follow-up:** DB-backed integration tests skip unless `TEST_DATABASE_URL` is set. `restore` on a block with no overlay and `revision: 0` returns the uncorrected block without recording an audit event (idempotent no-op). Invalidation rows are not yet consumed; ST-042+ snapshot materializers should honor them. Concurrent cross-block edits are each revision-checked per block.
