# Migration 0023 compatibility notes

- Adds immutable ingestion quality reports for each normalized parsed document.
- Adds a requested configuration version to parser artifacts and expands their uniqueness key, so a retry creates a new immutable output rather than overwriting an earlier parse.
- Existing parser artifacts are assigned the `default` configuration version and remain valid.
- Deploy this migration before API or worker binaries that use ingestion status or retry endpoints.
