---
story_id: ST-058
title: "Upload and Manage Teacher Replacement Assets"
phase: "05 \u2014 Storyboard Editing, Assets, and Versions"
status: Done
priority: must-have
epics: ["E13", "E21"]
prd_user_stories: ["E13-US2", "E21-US3"]
depends_on: ["ST-004", "ST-027", "ST-031", "ST-057"]
---

# ST-058 — Upload and Manage Teacher Replacement Assets

## Story

As a teacher, I want to upload my own image to replace a suggested asset while keeping the original recoverable.

## Outcome

Project-private image uploads are validated, thumbnailed, bound to scenes, and reversible.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E13-US2, E21-US3
- `docs/reference/epic-technical-implementation-guide.md` — E13, E21 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-004
- ST-027
- ST-031
- ST-057

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [x] Create project asset and upload-session records.
- [x] Support approved MVP image formats, file-size, pixel-dimension, aspect-ratio, and file-signature validation.
- [x] Scan uploaded images for malware through the existing adapter.
- [x] Generate normalized thumbnail/preview metadata.
- [x] Implement project asset list, select, replace, remove, and restore suggested asset behavior.
- [x] Keep project assets owner-scoped and private.
- [x] Record provenance as teacher uploaded.

## Technical Implementation Requirements

- Original upload is immutable; derived thumbnails use versioned keys.
- Do not allow SVG/script content unless safely sanitized and explicitly approved.
- Replacing a scene binding does not delete the previous catalog suggestion.
- Asset-only changes invalidate preview/render, not narration/audio.
- EXIF or sensitive metadata should be stripped where feasible.

## Contracts and Persistence

- Project asset entity.
- Image validation result.
- Asset provenance enum.

## Interfaces

- Project asset upload/complete/list/delete endpoints.
- Scene replacement asset UI.

## Acceptance Criteria

- [x] A valid image can be uploaded, previewed, and bound to an eligible scene slot.
- [x] Invalid, unsafe, oversized, or unsupported images are rejected.
- [x] The original suggested asset can be restored.
- [x] Another user cannot access the project asset.
- [x] Preview updates after selection.

## Required Tests

- [x] Image validation tests.
- [x] Malware/sanitization tests.
- [x] Thumbnail metadata test.
- [x] Cross-user signed-URL tests.
- [x] Restore-binding test.
- [x] Upload UI test.

## Out of Scope

- Video uploads.
- Image editing.
- Public asset marketplace.

## Story-Specific Notes

- Technical guide references: E13 and E21.

## Implementation Checklist

- [x] Inspect the current repository and related completed stories.
- [x] Write a short implementation plan listing files, contracts, migrations, tests, and risks.
- [x] Implement only this story's scope.
- [x] Add or update schemas before changing consumers.
- [x] Add authorization, validation, error, retry, concurrency, and idempotency behavior where applicable.
- [x] Add structured logs, correlation, audit, and usage records where applicable.
- [x] Run the required automated tests and affected workspace quality commands.
- [x] Self-review the diff for scope creep, insecure access, stale data races, and unbounded provider calls.
- [x] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [x] Every acceptance criterion is implemented and verified.
- [x] Every required test is implemented and passing.
- [x] `lint`, `typecheck`, `test`, and `build` pass for all affected workspaces.
- [x] Database migrations and compatibility notes are complete where applicable.
- [x] Public schemas, events, and endpoints are documented.
- [x] No unresolved tenant-isolation, security, idempotency, concurrency, data-loss, or cost-control defect remains in this scope.
- [x] No out-of-scope feature or unrelated refactor was added.
- [x] The Dev Agent Record is complete.
- [x] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:** Codex
- **Started:** 2026-08-22
- **Completed:** 2026-08-23
- **Branch/PR:** Current workspace branch; no PR created.
- **Files changed:** Project-asset persistence, migrations, schemas, API routes/service, pipeline validation job, storage keys, storyboard authorization, replacement picker, selected-scene preview, and focused tests. Post-review follow-up adds rejected-upload status polling, picker deletion, deleted-asset worker guards, and retained asset cleanup.
- **Migrations:** `0040_clammy_klaw` creates project assets and upload sessions; `0041_magical_slapstick` adds asynchronous validation state; `0042_flippant_namorita` permits separate immutable uploads with identical bytes; `0043_complete_joseph` records per-asset retention cleanup state. Compatibility notes accompany each migration.
- **Contracts changed:** Project asset create/complete/list contracts; `project-asset.validation` v1 and `project-asset.cleanup` v1 job payloads; private teacher-asset routes; scene bindings accept only active owner/project-scoped teacher assets.
- **Commands/tests run:** `db:generate`; lint and typecheck for API, pipeline worker, web, database, schemas, and storage; full web/database/schemas/storage test suites; full API and pipeline-worker test suites; focused project-asset, worker, route, restore, UI, preview, and storyboard tests; builds for all affected workspaces. Post-review: focused API/pipeline/web suites, worker retention test, and API/pipeline/database/schema/storage lint and typecheck.
- **Screenshots or representative output:** Valid replacement assets render as a signed private thumbnail in the picker and selected-scene preview; the full scene renderer remains manifest-driven.
- **Decisions and assumptions:** Original uploads remain immutable; validation/thumbnailing and malware scanning run asynchronously through the outbox-backed pipeline job; retrying an upload completion returns its persisted pending, active, or rejected state. Individual deletions retain a private tombstone for 30 days, then an outbox-backed idempotent worker deletes the asset-specific storage prefix while retaining audit evidence.
- **Deviations from story/technical guide:** Private upload endpoints use `/projects/{id}/teacher-assets` to avoid changing the existing `/projects/{id}/assets` approved-catalog contract from ST-057. The selected replacement thumbnail provides immediate preview; full media-manifest rendering remains the planned ST-065 responsibility.
- **Known risks or follow-up:** Signed thumbnails expire normally and are refreshed through the project-asset list. Failed scanner infrastructure leaves the asset pending for job retry rather than exposing unscanned media.
