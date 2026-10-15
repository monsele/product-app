---
story_id: ST-117
title: "Correct Extracted Table Cells as Overlays"
phase: "03 — Ingestion and Lesson Configuration"
status: Done
priority: should-have
epics: ["E4", "E5", "E19"]
prd_user_stories: ["E4-US3", "E5-US3", "E19-US2"]
depends_on: ["ST-039", "ST-093", "ST-114"]
---

# ST-117 — Correct Extracted Table Cells as Overlays

## Story

As a teacher whose source table was parsed with a wrong value, I want to
correct that cell in ingestion review, so that a chart or table image built
from it shows the right number, while the parser's original stays available.

## Background

ST-039 added correction overlays for paragraph text only (E5-US3 covers
"extracted paragraph text"). Tables are read straight from the immutable
`parsed_tables` rows, so a misread cell cannot be fixed today.

ST-114 (animated data charts) needed this for its AC4: "Correcting a table
cell in ingestion review updates the chart on the next preview and marks the
scene's grounding stale until rechecked." On 2026-10-14 the product owner
deferred that part of ST-114 to this story. ST-114 already makes charts read
the latest approved snapshot on every preview, and the grounding recheck
already fires when the snapshot changes, so this story only has to put
corrected cells into the snapshot.

## Required Reading

- `AGENTS.md`
- `docs/reference/mvp-prd.md`: E4-US3, E5-US3, E19-US2
- `docs/reference/epic-technical-implementation-guide.md`: E5, E19 and the
  cross-cutting sections
- `stories/03-ingestion-configuration/ST-039-implement-corrected-text-overlays-and-restore-original-text.md`
  (the overlay pattern to follow)
- `stories/11-visual-storytelling/ST-114-animated-data-chart-scene-from-source-tables.md`
  (AC4 and its Dev Agent Record deviation)

## Scope

- [x] A table-cell correction overlay: table ID, row and column index,
      original cell text, corrected text, editor, timestamp and revision.
      `parsed_tables` and `parsed_table_cells` stay immutable.
- [x] Edit, save, conflict and restore-original commands for one cell,
      following the ST-039 block-correction commands.
- [x] The effective table (parser output plus overlays) is what source
      approval snapshots, so source visuals, previews, renders and charts
      use corrected cells.
- [x] Mark unapproved downstream drafts stale when a correction changes, as
      ST-039 does for blocks.
- [x] Ingestion review UI: edit a cell inline, show original versus
      corrected, restore the original.

## Technical Implementation Requirements

- Corrections keep the table ID, page and section provenance.
- A corrected cell is bounded plain text (at most 160 characters, the
  preview bound). It is not parsed or validated as a number here; charts keep
  their own numeric rule.
- Audit corrections without logging cell text outside the database.
- Tenant isolation on every query, as for block corrections.

## Acceptance Criteria

- [x] AC1 A corrected cell appears in the next approved snapshot's table,
      with the original still viewable and restorable.
- [x] AC2 A data-chart scene over the corrected cell shows the corrected value
      on the next preview after re-approval, and its grounding is marked stale
      until rechecked. This completes ST-114 AC4.
- [x] AC3 A stale concurrent cell edit returns a conflict.
- [x] AC4 Another tenant cannot read or correct the table.

## Required Tests

- [x] Overlay persistence, restore and concurrency tests.
- [x] Effective-table projection test, including the snapshot.
- [x] Postgres integration: correct a cell, re-approve, preview a chart with
      the corrected value and see `grounding_recheck_required`. This replaces
      ST-114's simulated test, which wrote to `parsed_tables` directly.
- [x] Authorization test for a foreign table.

## Out of Scope

- Adding, deleting or reordering rows or columns.
- Correcting table structure (merged cells, headers).
- Correcting figures.

## Dev Agent Record

- **Agent:** Claude Code (Opus 5.5).
- **Started:** 2026-10-15.
- **Completed:** 2026-10-15. The product owner approved it on 2026-10-15
  after the `/story-code-review` pass, and the status is now Done.
- **Branch/PR:** `feat/st117-table-cell-corrections`, branched from
  `feat/st115-conversational-editing` at `b5a1b35`, which contains ST-114.
  Not committed or pushed; no PR.
- **Files changed:**
  - Schemas (`packages/schemas/src/index.ts`):
    - `reviewTableCellCorrectionSchema` and an optional
      `reviewTableSchema.cellCorrections`.
    - `tableCellCorrectionInputSchema`, `tableCellRestoreInputSchema`,
      `tableCellUpdateResponseSchema` and `tableCellCorrectionMaxLength`
      (160).
    - An optional `sourceSnapshotTableSchema.correctedCells`, which must lie
      inside the grid.
    - Tests: new `table-cell-correction.test.ts`, plus three cases added to
      `source-snapshot.test.ts`.
  - Database:
    - `packages/database/src/schema.ts`: `tableCellCorrections`,
      `sourceTableInvalidations`, and two audit event types.
    - Migration `drizzle/0073_table_cell_corrections.sql` with its
      `.compatibility.md` and a journal entry.
  - API:
    - New `apps/api/src/table-cell-corrections.ts`. It holds the service and
      the pure `projectEffectiveTableRows` / `projectReviewTable` functions.
    - `source-snapshot.ts`: the effective table goes into the snapshot.
    - `parsed-document-review.ts` and `parsed-document-repository.ts`:
      review shows the overlays.
    - `app.ts`: routes and DI. `runtime.ts`: wiring.
    - Tests:
      - `table-cell-corrections.test.ts` (projection, snapshot hash, routes).
      - `table-cell-corrections.integration.test.ts` (Postgres).
      - `project-route-authorization.test.ts` (two routes added to the
        cross-tenant inventory).
      - `data-chart.integration.test.ts`: ST-114's simulated AC4 test is
        replaced with the real correction path.
  - Web (`apps/web/app/workspace/[projectId]/review/`):
    - New `table-cell-controls.ts` (pure request and display mapping) and
      `source-table-editor.tsx` (`EditableSourceTable`), each with tests.
    - `ingestion-review-viewer.tsx` renders the editable table and calls
      `correctTableCell`, which refreshes the approval banner on success.
  - E2E:
    - `e2e/ingestion-review.spec.ts`: one new browser test.
    - `e2e/workspace-mock-api.mjs`: a table in the Evaporation section, the
      two cell commands, and a `GET /source-sections` handler (see
      Deviations).
- **Migrations:** `0073_table_cell_corrections`. It is additive only.
  - `table_cell_corrections` is unique on `(project_id, table_id, row_index,
    column_index)`, with check constraints on position, revision, and
    corrected-text length ≤ 160.
  - `source_table_invalidations` is unique on `(project_id, table_id,
    row_index, column_index, cell_revision)`.
  - Both tables have cascading FKs to `parsed_documents`, `parsed_sections`
    and `parsed_tables`.
  - `audit_event_type` gains `source.table_cell_corrected` and
    `source.table_cell_restored`.
  - Rollback notes are in the compatibility file.
- **Contracts changed:**
  - `PATCH /projects/:id/source-tables/:tableId/cells` takes `{ rowIndex,
    columnIndex, revision, correctedText }`.
  - `POST /projects/:id/source-tables/:tableId/cells/restore` takes
    `{ rowIndex, columnIndex, revision }`.
  - Both answer with the `ReviewTable`. Responses: 400 for a bad body, an
    out-of-grid position or a merged-over position; 404 for a foreign or
    unknown table; 409 for a stale revision.
  - `ReviewTable.cellCorrections` is optional and lists active and restored
    overlays.
  - `SourceSnapshotTable.correctedCells` is optional, and `rows` hold
    effective text.
  - The snapshot schema stays at version 1.0. A table without corrections
    hashes exactly as before, so existing approvals do not turn stale.
- **Commands/tests run** (Postgres at `TEST_DATABASE_URL` = the compose
  container on :5433; each integration run uses its own temporary database):
  - Unit tests:
    - schemas: 564 pass.
    - database: 12 pass, 3 skipped.
    - web: 389 pass, 26 of them in the review folder.
    - pipeline-worker: 327 pass.
    - API, run serially: 676 pass. In a parallel run, the first Nest-booting
      test of four files hit the known 5 s timeout. They all pass serially.
  - Postgres:
    - API: all 24 integration files, 166/166, run with
      `--hookTimeout=120000 --maxWorkers=3`. This includes
      `table-cell-corrections` 11/11 and `data-chart` 4/4.
    - Worker: 57/64. The 7 failures are the ones already recorded in ST-114
      (`document-ingestion-job` ×5, `duration-reconciliation` ×2), from
      committed code this story does not touch.
  - Browser (`npx playwright test e2e/ingestion-review.spec.ts`):
    - The ST-117 test passes. It corrects a cell, sees "Corrected" with the
      original, then restores it.
    - 3 older tests in the spec fail on stale assertions (see Known risks).
  - `pnpm typecheck`: 16/16.
  - `pnpm lint`: the affected workspaces are clean. The only error is the
    known scene-library `text-overflow.test.ts:55 _title`.
  - `pnpm build`: 16/16.
  - `graphify update .` was run.
- **Representative output:** In the replaced ST-114 chart test, a grounding
  check is recorded for the current lesson revision and snapshot, and lesson
  validation then has no `grounding_recheck_required`.
  - Correcting row 0, column 1 to `0.534` leaves the parser row unchanged.
  - Before re-approval the preview still shows `["0.53","0.97","0.86"]`.
  - After re-approval the preview shows `["0.534","0.97","0.86"]`, and
    validation reports `grounding_recheck_required` for the chart scene.
  - No screenshot was captured. The Playwright test is the UI evidence.
- **Decisions/assumptions:**
  - A cell is addressed by its position in the table's `rows` grid, the
    same grid charts and source visuals read.
  - `columns` (the headings) are not correctable, because headers are out of
    scope.
  - A position covered by a merged cell that starts elsewhere is refused
    with 400. The merged cell is correctable where it starts.
  - Review keeps `rows` as the parser's text and adds `cellCorrections`, as
    blocks keep `text` and add `correction`. The snapshot carries the
    effective text, as blocks do.
  - The text is trimmed, at most 160 characters, and refused if it contains
    control characters. An empty cell is allowed because a blank cell is real
    table structure. The text is never parsed as a number.
  - `original_text` copies the parser's cell when the cell is first
    corrected. `edited_by` is the acting user.
  - The invalidation row and the audit event are written in the correction's
    transaction. The audit metadata holds the table, the position and the
    revision, never the cell text; a test checks this.
  - Every overlay query filters on `owner_user_id` and `project_id`. The
    table must belong to the project's latest parsed document, so a table
    from another tenant or an older parse returns 404.
  - After a successful cell command the review page refreshes the approval
    status, so "Re-confirm source content" appears at once. Re-approval is
    what carries the correction to charts.
- **Deviations:**
  - **Restore keeps the overlay.** ST-039 deletes a block overlay on restore.
    A cell restore instead sets `corrected_text` to null and bumps the
    revision, so revisions only count up. With delete-on-restore, a stale
    editor holding revision 1 could match a re-created overlay at revision
    1 and overwrite it silently (an ABA problem). A Postgres test covers
    this case. The commands, status codes and the "revision 0 means never
    corrected" rule otherwise follow ST-039.
  - **Position in the body.** The row and column travel in the request body
    instead of the path, so one zod schema validates them with the text.
  - **E2E mock repair outside the story.** `e2e/workspace-mock-api.mjs`
    never served `GET /source-sections` (added in ST-038). Without it every
    ingestion-review e2e test failed with "We could not load the document
    review", including the five tests written before this story. I added a
    minimal handler so the new browser test can run. Two of those older
    tests now pass as well.
- **Known risks/follow-up:**
  - Three older tests in `e2e/ingestion-review.spec.ts` still fail on
    assertions that predate the ST-083 interface pass. They expect the
    heading "Review extracted document" (now "Document review"), the
    "Warnings (1)" heading, and the figure image role. They were not changed
    because they are outside this story.
  - The seven worker integration failures recorded in ST-114 remain.
  - As with ST-039, the invalidation rows are recorded but nothing consumes
    them yet.
  - A chart binding's alt text is still written when the scene is saved
    (ST-114 known risk). After a correction and re-approval it keeps the old
    value until the scene is next saved or regenerated. The grounding recheck
    flags the scene in the meantime.
  - The correction applies to the latest parsed document only. A re-parse
    produces new table IDs, so its overlays do not carry over. Block
    corrections behave the same way.
- **Code review (2026-10-15, `/story-code-review`, done by the implementing
  agent):** All four ACs are met, and none of the deviations needs an ADR.
  The product owner approved the story as it stands. These findings are open
  follow-ups and are not fixed:
  - M1, medium: table cells show no keyboard focus ring. The cell button's
    inline `all: "unset"` (`source-table-editor.tsx:166`) overrides the
    global `*:focus-visible` outline. Chromium confirms that a focused cell
    computes `outline-style: none`.
  - L1: a failed save throws away the text the teacher typed, because the
    editor closes before the request finishes. After a 409 the section also
    keeps its old revision until it is reloaded.
  - L2: re-saving a cell with its current text, or with the parser's text,
    still changes the snapshot hash, so the teacher must re-approve and
    grounding must be rechecked.
  - L3: the 160-character limit is declared twice
    (`tableCellCorrectionMaxLength` and `sourceTableVisualMaxCellLength`).
  - L4: nothing reads the stale-draft (invalidation) rows yet; ST-039 has
    the same gap.
  - L5: ST-114's Dev Agent Record still lists ST-117 as Ready and calls its
    AC4 test a simulation.
  - L6: `effectiveCellText` is exported but not used by any product code.
