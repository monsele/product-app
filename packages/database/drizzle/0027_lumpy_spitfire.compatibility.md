# Migration 0027 compatibility notes

- Adds the `lesson_configurations` table: one current-draft row per project with an optimistic-concurrency `revision` that increments on every save.
- Adds the `lesson.configuration_saved` audit event type (inserted before `lesson.approved` to preserve enum ordering).
- The table records the effective selected-source parsed-document version (`source_parsed_document_version`) that grounds the lesson.
- Approved immutable configuration versions referenced by generated artifacts are preserved by downstream stories (ST-042+), not stored in this draft table.
- Deploy this migration before API builds that serve the `GET/PUT /projects/:id/configuration` surface.
