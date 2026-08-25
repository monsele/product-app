# `0002_graceful_scorpion` compatibility

This additive migration creates the `audit_events` and `usage_records` tables,
their bounded PostgreSQL enum types, and indexes for tenant-scoped project,
actor, operation, and correlation investigation.

No existing table is rewritten and no backfill is required. Deploy the schema
before enabling audit or usage writers. The new records are operational and
financial evidence; do not roll this migration back in place after writes have
begun. Retain or export them according to reviewed audit and billing policy and
use a forward migration for later contract changes.
