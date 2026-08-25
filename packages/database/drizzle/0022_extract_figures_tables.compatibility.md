# Migration 0022 compatibility notes

- Adds immutable query rows for extracted figures, parsed tables, ordered table cells, and ingestion warnings.
- Deploy this migration before pipeline-worker binaries that finalize figure or table extraction.
- Existing normalized documents and parser artifacts remain immutable; they are not backfilled.
- Figure objects remain private and are available only through the tenant-authorized signed-URL storage surface.
