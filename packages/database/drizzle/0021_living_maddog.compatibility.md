# Migration 0021 compatibility notes

- Adds immutable normalized-document metadata plus query-oriented section and content-block records.
- Deploy this migration before worker binaries that finalize normalized ingestion artifacts.
- Existing canonical parser artifacts remain immutable and are not backfilled by this migration.
