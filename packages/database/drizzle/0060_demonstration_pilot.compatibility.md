# 0060 demonstration pilot compatibility

ST-096 adds the experimental demonstration-led video approach as additive, tenant-owned state. No existing table's semantics change and no existing row is rewritten.

## `lesson_configurations.video_approach`

- New `video_approach` enum (`standard`, `demonstration`) and a `NOT NULL DEFAULT 'standard'` column.
- Every pre-existing row becomes `standard`, which is what those lessons already were. Nothing to backfill and nothing to interpret: the absence of a choice has always meant the standard approach.
- Immutable `lesson_versions.snapshot` JSON written before this migration has no `videoApproach` key. It is **not** rewritten. The API reads it through `readVideoApproach`, which treats absence as `standard` and an explicit unknown value as an error, never as a silent downgrade.
- Adding the field to newly written snapshots changes `lesson_versions.content_hash` for versions saved after deployment. That is intended: the approach is a render-affecting input (CR-06). Existing versions keep their stored hashes and remain renderable and restorable.

## New tables

- `demonstration_comparisons` — one baseline lesson version explained two ways, unique per `(owner_user_id, project_id, baseline_lesson_version_id, experiment_version)`.
- `demonstration_variants` — one row per approach per comparison, unique per `(comparison_id, approach)` and per `(owner_user_id, project_id, identity_sha256)`. `render_job_id` references an existing `render_jobs` row, which may be one the project already completed (adoption) or one this story queued.
- `demonstration_feedback` — one row per tester per comparison, updated in place with a monotonic `revision`.

All three carry `owner_user_id` and `project_id` and are reached only through tenant-scoped queries. `demonstration_variants` and `demonstration_feedback` cascade from `demonstration_comparisons`, which restricts against `lesson_versions` and `source_snapshots` so a baseline cannot be deleted out from under a recorded comparison.

## Deployment order

- Apply `0060` and `0061` before API instances that write the new column, tables, or audit event values.
- Rolling back requires dropping the new tables, the column and the two new enum types. Enum-value removal from `audit_event_type` is intentionally not automated; see `0061`.
