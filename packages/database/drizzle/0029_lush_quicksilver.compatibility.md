# Migration 0029 — model_calls and ai.grounding usage operation

## Change

- Adds `ai.grounding` to the `usage_operation_type` enum (before `image.generation`).
- Creates the `model_calls` metadata table for immutable per-model-call records.

## Compatibility

- `usage_operation_type` gains a new value; existing rows are unaffected. The
  enum addition cannot be rolled back in PostgreSQL without recreating the enum.
- `model_calls` is a new table with no dependents; it can be dropped for rollback.
- The unique index `model_calls_tenant_idempotency_unique` keeps model-call
  records idempotent per (owner, project, idempotency key).

## Notes

- `operation_type`, `validation_status`, and `status` are validated text columns
  at the API boundary (schemas) rather than enum columns, matching the
  `source_documents`/`source_snapshots` convention and avoiding enum migration
  churn as operations evolve.
