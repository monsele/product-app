# Migration 0017 compatibility notes

- Adds immutable ingestion-artifact records and project-local reuse references.
- A reuse requires an exact same-owner checksum and matching parser and normalized-schema versions; review overlays are not represented or copied.
- Adds a persisted completion-time duplicate indicator and an audit event for automatic reuse.
- Deploy this migration before application or worker binaries that query or create reuse records.
