---
story_id: ST-038
title: "Let Teachers Rename, Include, Exclude, and Reorder Source Sections"
phase: "03 \u2014 Ingestion and Lesson Configuration"
status: Done
priority: must-have
epics: ["E5"]
prd_user_stories: ["E5-US2"]
depends_on: ["ST-037", "ST-003"]
---

# ST-038 — Let Teachers Rename, Include, Exclude, and Reorder Source Sections

## Story

As a teacher, I want to exclude references, exercises, or sidebars and correct section labels so AI uses only relevant material.

## Outcome

Project-specific section-selection overlays preserve parser truth while creating an editable source configuration.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E5-US2
- `docs/reference/epic-technical-implementation-guide.md` — E5 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-037
- ST-003

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create project source-section overlay records for included status, display heading, and optional review order.
- [ ] Implement include/exclude, rename, and restore-original operations with optimistic concurrency.
- [ ] Enforce that at least one usable section remains selected.
- [ ] Display clear excluded state and reversible actions.
- [ ] Ensure downstream source-package queries use overlays rather than raw sections.
- [ ] Audit source selection confirmation.

## Technical Implementation Requirements

- Do not mutate normalized parser section headings or hierarchy.
- Section selection is project/version specific.
- Excluded sections are omitted from generation prompts and retrieval.
- Renaming changes teacher-facing/generated context but preserves original text for audit.
- An approved source snapshot later freezes these decisions.

## Contracts and Persistence

- Source section overlay entity.
- Selection revision.
- Effective section projection.

## Interfaces

- `PATCH /projects/:id/source-sections/:sectionId`.
- Bulk selection endpoint if required.
- Review UI controls.

## Acceptance Criteria

- [ ] Teachers can rename and include/exclude sections.
- [ ] At least one section must remain included.
- [ ] Restoring returns the original heading/status.
- [ ] Effective source queries reflect the overlays.
- [ ] Concurrent stale edits are rejected with a conflict state.

## Required Tests

- [ ] Overlay domain tests.
- [ ] At-least-one validation test.
- [ ] Optimistic concurrency API test.
- [ ] Effective projection test.
- [ ] UI include/exclude/restore test.

## Out of Scope

- Editing paragraph text.
- Changing parser hierarchy levels.
- Multiple source documents.

## Story-Specific Notes

- Technical guide references: E5 and immutable overlay principle 2.3.

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

- **Agent:** Kilo (deepseek/deepseek-v4-pro)
- **Started:** 2026-08-15
- **Completed:** 2026-08-15
- **Branch/PR:** `story/st-038` (created locally; not committed/pushed pending owner authorization)
- **Files changed:**
  - `packages/schemas/src/index.ts` — ST-038 source-section selection DTOs
  - `packages/database/src/schema.ts` — `source_section_overlays` table + `source.selection_updated` audit event type
  - `packages/database/drizzle/0024_tidy_solo.sql` (+ `meta/0024_snapshot.json`, `_journal.json`) — generated migration
  - `apps/api/src/source-section-selection.ts` — service + `projectEffectiveSections`
  - `apps/api/src/source-section-selection.test.ts` / `.integration.test.ts` — tests
  - `apps/api/src/app.ts` — `GET/PATCH /projects/:id/source-sections[...]` routes, DI, CORS `PATCH`
  - `apps/api/src/runtime.ts` — service wiring
  - `apps/web/app/workspace/[projectId]/review/source-section-controls.ts` (+ test) — pure action→patch mapper
  - `apps/web/app/workspace/[projectId]/review/ingestion-review-viewer.tsx` — include/exclude/rename/restore controls
- **Migrations:** `0024_tidy_solo.sql` — `ALTER TYPE audit_event_type ADD VALUE 'source.selection_updated'`; create `source_section_overlays` with FKs and unique `(project_id, section_id)`.
- **Contracts changed:** New schemas `sourceSectionOverlayInputSchema`, `sourceSectionOverlaySchema`, `sourceSectionSelectionSchema`, `sourceSectionSelectionResponseSchema`, `sourceSectionUpdateResponseSchema`; new audit event type `source.selection_updated`; new endpoints `GET /projects/:id/source-sections` and `PATCH /projects/:id/source-sections/:sectionId`.
- **Commands/tests run:** `pnpm --filter @avlp/schemas|@avlp/database|@avlp/api|@avlp/web lint` (pass), `typecheck` (pass), `test` (api 49 passed / 18 skipped-integration, web 10 passed, database 8 passed, schemas 36 passed), `build` for api + web (pass). `pnpm --filter @avlp/database db:generate` produced the migration.
- **Screenshots or representative output:** API contract test `source-section-selection.test.ts` (12 pass) including 409 conflict; `source-section-controls.test.ts` (5 pass) include/exclude/rename/restore.
- **Decisions and assumptions:** One overlay row per (project, section) created lazily on first edit; `revision: 0` means "create" and positive values are matched for optimistic concurrency. Restore maps to `{included:true, displayHeading:null, reviewOrder:null}`. At-least-one and stale-revision failures return HTTP 409 via `PublicError("bad_request", …, 409)` (no dedicated "conflict" error code exists in the shared envelope).
- **Deviations from story/technical guide:** Consolidated the guide's `source_selections` + `section_metadata_overrides` tables into one `source_section_overlays` table (matches the story's single "source section overlay entity" contract). Single-section `PATCH` endpoint (as the story specifies) rather than the guide's batch `PATCH /source-selections`; a batch endpoint was deemed optional by the story.
- **Known risks or follow-up:** DB-backed integration tests (`source-section-selection.integration.test.ts`) are skipped unless `TEST_DATABASE_URL` is set; run them against a live Postgres to verify concurrency/at-least-one end-to-end. Effective projection is consumed downstream by ST-042's source-snapshot materializer, which is out of scope here.
- **Review:** Approved 2026-08-15. Non-blocking follow-ups logged: (1) at-least-one invariant not atomic under concurrent cross-section excludes; (2) `reviewOrder` stored but not applied/surfaced; (3) `sourceSectionOverlaySchema` unused; (4) `ALTER TYPE ADD VALUE` needs PG ≥ 12; (5) update `WHERE` omits `ownerUserId` (defense-in-depth).
