# Migration 0030 — learning_objective_sets and learning_objectives

## Change

- Creates the `learning_objective_set_status` enum (`draft`, `approved`).
- Creates the `learning_objective_sets` table: one generated (later approved)
  objective set per project, tenant-scoped, referencing the approved
  `source_snapshots` row and the `model_calls` record that produced it.
- Creates the `learning_objectives` child table with per-objective
  `source_refs` (JSONB), `generated`, and `revision` columns.

## Compatibility

- Both tables are new with no existing dependents; they can be dropped for
  rollback (the new enum can only be dropped together with its dependent
  tables in PostgreSQL).
- The unique index `learning_objective_sets_tenant_idempotency_unique`
  (`owner_user_id`, `project_id`, `idempotency_key`) makes objective-set
  persistence idempotent across job retries; the model-call record is already
  idempotent from migration 0029.
- `status` uses a real PostgreSQL enum (`draft`/`approved`), unlike
  `model_calls.status` which is a validated text column. This matches the
  stable, narrow status domain of objective sets; a new status would require
  an enum migration (expected only if the MVP approval model changes).

## Notes

- `learning_objective_sets.source_snapshot_id` and `model_call_id` are
  `ON DELETE RESTRICT`: a generation outcome must never dangle from the
  snapshot or model-call it was derived from.
- `learning_objectives.set_id` is `ON DELETE CASCADE`: deleting a draft set
  removes its objectives.
