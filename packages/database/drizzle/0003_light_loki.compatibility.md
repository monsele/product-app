# `0003_light_loki` compatibility

This forward migration adds an idempotency key to `usage_records`. It first adds
the column as nullable, deterministically backfills any records written after
`0002_graceful_scorpion` with `legacy:{record-id}`, then makes it required and
adds the unique index. New writers must supply a provider-operation key so job
redelivery cannot double-meter one paid call.

The backfill preserves every existing usage row and needs no private payload.
Deploy the migration before the idempotent usage writer. Do not remove the key
or index after metering starts; make later compatibility changes forward-only.
