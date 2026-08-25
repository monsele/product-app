# Migration 0028 compatibility notes

- Adds the `source_snapshots` table: immutable approved source snapshots for the AI pipeline. One row per approval; `snapshot_version` increments per project; `payload` freezes the effective reviewed content (included sections, corrected blocks, included figures/tables) as JSONB.
- Adds the `source.review_approved` audit event type (inserted before `share.created` to preserve enum ordering).
- Queryable columns (`parsed_document_id`, `parsed_document_version`, `content_hash`, `approved_by`, `approved_at`) mirror snapshot metadata so generation jobs can select snapshots without parsing the payload.
- Later overlay edits never mutate an existing snapshot; re-approval creates a new row.
- Deploy this migration before API builds that serve `POST /projects/:id/source-review/approve`, `GET /projects/:id/source-review`, and `GET /projects/:id/source-snapshots/:snapshotId`.
