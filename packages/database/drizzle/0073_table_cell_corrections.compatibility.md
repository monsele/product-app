# 0073 table cell corrections compatibility

Additive only. No existing row changes and nothing is backfilled.
`parsed_tables` and `parsed_table_cells` are not touched and stay immutable.

## New tables

- `table_cell_corrections`: one correction overlay per cell, unique per
  `(project_id, table_id, row_index, column_index)`. The position addresses
  the table's `rows` grid. `original_text` copies the parser's cell text when
  the cell is first corrected; `corrected_text` is the teacher's text, or null
  after a restore. A restore keeps the row and bumps `revision`, so revisions
  only count up and a stale editor always gets a conflict. `edited_by` is the
  user who made the latest change. A check constraint bounds `corrected_text`
  to 160 characters, the source-table preview bound.
- `source_table_invalidations`: one row per `(project_id, table_id,
  row_index, column_index, cell_revision)`, written in the same transaction
  as each correction or restore, with scope `unapproved_drafts`. It mirrors
  `source_content_invalidations` for blocks.

Both tables carry `owner_user_id` and `project_id`, and every API query
filters on both. Cell text is user content: it is never logged and never
copied into audit metadata, which records only the table, the position and
the revision.

## Enum additions

- `audit_event_type` gains `source.table_cell_corrected` and
  `source.table_cell_restored`.

Enum values cannot be removed, so a rollback leaves them unused. Rolling back
the tables is `DROP TABLE "source_table_invalidations"` then
`DROP TABLE "table_cell_corrections"`.

## Snapshot compatibility

Approved source snapshots stay at schema version 1.0. A snapshot table gains
an optional `correctedCells` list only when a cell is corrected, and its
`rows` then hold the corrected text. A table with no corrections hashes
exactly as before, so existing approvals do not become stale.
