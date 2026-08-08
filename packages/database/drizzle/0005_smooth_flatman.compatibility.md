# `0005_smooth_flatman` compatibility

This forward migration replaces the global job and usage idempotency indexes
with unique indexes scoped by `owner_user_id`, `project_id`, and
`idempotency_key`. Existing globally unique data already satisfies the new
constraints, so no backfill or row rewrite is required.

The old and new writers use different PostgreSQL conflict targets. Pause job
and usage producers, apply this migration, deploy the matching repository code,
and then resume producers. Do not run an old writer after the global indexes
have been dropped. PostgreSQL applies the index replacement as one migration;
if index creation fails, retain the old application version and restore the
migration transaction before accepting new work.

Do not restore global uniqueness in place after different tenants have reused
the same caller-provided key. Any future idempotency-key change must use a
reviewed forward migration that preserves every job and usage record.
