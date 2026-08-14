# Migration 0014 compatibility notes

- Adds the `validating_source` project stage and non-destructive source-document validation states.
- Existing active documents remain active and continue to use their existing storage objects unchanged.
- The migration replaces the two affected enums transactionally before changing defaults, preserving all existing stage/status values without PostgreSQL's new-enum-value commit restriction.
- Deploy the worker capable of `document.validation` before sending new upload-completion traffic so pending documents are processed promptly.
