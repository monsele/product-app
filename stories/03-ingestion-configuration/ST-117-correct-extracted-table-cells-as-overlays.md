---
story_id: ST-117
title: "Correct Extracted Table Cells as Overlays"
phase: "03 — Ingestion and Lesson Configuration"
status: Ready
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

- [ ] A table-cell correction overlay: table ID, row and column index,
      original cell text, corrected text, editor, timestamp and revision.
      `parsed_tables` and `parsed_table_cells` stay immutable.
- [ ] Edit, save, conflict and restore-original commands for one cell,
      following the ST-039 block-correction commands.
- [ ] The effective table (parser output plus overlays) is what source
      approval snapshots, so source visuals, previews, renders and charts
      use corrected cells.
- [ ] Mark unapproved downstream drafts stale when a correction changes, as
      ST-039 does for blocks.
- [ ] Ingestion review UI: edit a cell inline, show original versus
      corrected, restore the original.

## Technical Implementation Requirements

- Corrections keep the table ID, page and section provenance.
- A corrected cell is bounded plain text (at most 160 characters, the
  preview bound). It is not parsed or validated as a number here; charts keep
  their own numeric rule.
- Audit corrections without logging cell text outside the database.
- Tenant isolation on every query, as for block corrections.

## Acceptance Criteria

- [ ] AC1 A corrected cell appears in the next approved snapshot's table,
      with the original still viewable and restorable.
- [ ] AC2 A data-chart scene over the corrected cell shows the corrected value
      on the next preview after re-approval, and its grounding is marked stale
      until rechecked. This completes ST-114 AC4.
- [ ] AC3 A stale concurrent cell edit returns a conflict.
- [ ] AC4 Another tenant cannot read or correct the table.

## Required Tests

- [ ] Overlay persistence, restore and concurrency tests.
- [ ] Effective-table projection test, including the snapshot.
- [ ] Postgres integration: correct a cell, re-approve, preview a chart with
      the corrected value and see `grounding_recheck_required`. This replaces
      ST-114's simulated test, which wrote to `parsed_tables` directly.
- [ ] Authorization test for a foreign table.

## Out of Scope

- Adding, deleting or reordering rows or columns.
- Correcting table structure (merged cells, headers).
- Correcting figures.
