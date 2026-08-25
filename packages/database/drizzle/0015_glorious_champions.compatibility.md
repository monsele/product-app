# Migration 0015 compatibility notes

- Replaces the source-document status index with a partial unique index for `active` documents only.
- A project may retain multiple rejected or validation-error attempts for auditability and safe replacement, while still allowing exactly one active source document.
- The migration briefly recreates the index; run it during normal migration maintenance windows.
