# ADR-002: Citation-History Snapshot Writer Lives in ST-053, Wired to Versions in ST-060

## Status

Accepted

## Context

PRD E19-US2 requires "Citation history is retained with lesson versions", and E20-US1 requires each version to include citations. Story ST-053 ("Recheck Grounding After Teacher Edits and Preserve Citation History") includes the scope item "Preserve citation/grounding history in versions" and the acceptance criterion "Older versions retain their original citation history".

ST-060 ("Create Immutable Lesson Versions at Approval and Explicit Save Points") owns the `lesson_versions` table and version-creation service. ST-060 is **not** a dependency of ST-053, so no version entity or version-creation milestone exists while ST-053 is being implemented. Without a version to attach a snapshot to, a fully wired "snapshot at version creation" flow cannot be demonstrated end to end within ST-053.

## Decision

- ST-053 ships the citation-history preservation **mechanism**: the `citation_history_snapshots` table, the `CitationHistorySnapshot` contract, and the `PostgresCitationHistoryService` (`snapshotForVersion` + `persistSnapshot`) in `apps/api/src/citation-history.ts`, with tests that prove snapshots are immutable, tenant-scoped, and idempotent per lesson version.
- ST-060 wires the mechanism into version creation: when a `lesson_versions` row is created, the version service calls `snapshotForVersion` (with the approved source snapshot binding and the latest grounding check id) and `persistSnapshot`.
- Snapshot rows are insert-only and never updated, so history is preserved by construction; retries for the same `(owner_user_id, project_id, lesson_version_id)` return the existing row.

## Consequences

- Older versions retain their original citation history once ST-060 creates versions and calls the provided service.
- ST-060 must write the version-history test that exercises snapshot-at-version-creation end to end; ST-053 provides the version-history preservation unit tests for the writer.
- No `lesson_versions` FK is added in ST-053 (`lesson_version_id` is a plain UUID column) to avoid a dangling reference before the version table exists.
