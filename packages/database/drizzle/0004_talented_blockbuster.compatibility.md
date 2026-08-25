# `0004_talented_blockbuster` compatibility

This additive migration extends `audit_event_type` with
`job.admin_cancelled` so administrative cancellation can retain actor, target,
tenant, and correlation evidence in the same transaction as the job update.

Existing audit rows are unchanged and no backfill is required. PostgreSQL enum
values are forward-only in non-disposable deployments; do not remove the value
after cancellation events have been written.
