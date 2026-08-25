# `0001_woozy_stranger` compatibility

This forward migration adds the authoritative `jobs` and `outbox_events` workflow tables plus their PostgreSQL enum types, uniqueness constraints, indexes, and foreign key.

It is additive and requires no data backfill. Existing deployments can continue serving synchronous foundation endpoints while the migration is applied. Deploy consumers only after the migration succeeds.

Do not roll this migration back in place after jobs have been accepted: removing either table can lose workflow or undispatched queue state. For non-disposable environments, disable producers and workers, drain the outbox, retain/export operational records as policy requires, and use a reviewed forward migration. Disposable test databases may be dropped and recreated.
