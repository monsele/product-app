---
story_id: ST-039
title: "Implement Corrected-Text Overlays and Restore Original Text"
phase: "03 \u2014 Ingestion and Lesson Configuration"
status: Ready
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
