# Migration 0013 compatibility notes

- Adds `source_documents` and `upload_sessions`; it does not alter or rewrite existing project rows.
- Existing projects remain eligible to start an upload session. A project can receive one `active` source document only.
- The `source_documents_project_active_unique` constraint is intentionally scoped to the active status. A later source-replacement story must mark the previous document superseded before attaching its replacement.
- Rolling back application code before this migration is safe because older code ignores these additive tables and enum.
