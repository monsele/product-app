---
story_id: ST-058
title: "Upload and Manage Teacher Replacement Assets"
phase: "05 \u2014 Storyboard Editing, Assets, and Versions"
status: Ready
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

- [ ] Create project asset and upload-session records.
- [ ] Support approved MVP image formats, file-size, pixel-dimension, aspect-ratio, and file-signature validation.
- [ ] Scan uploaded images for malware through the existing adapter.
- [ ] Generate normalized thumbnail/preview metadata.
- [ ] Implement project asset list, select, replace, remove, and restore suggested asset behavior.
- [ ] Keep project assets owner-scoped and private.
- [ ] Record provenance as teacher uploaded.

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

- [ ] A valid image can be uploaded, previewed, and bound to an eligible scene slot.
- [ ] Invalid, unsafe, oversized, or unsupported images are rejected.
- [ ] The original suggested asset can be restored.
- [ ] Another user cannot access the project asset.
- [ ] Preview updates after selection.

## Required Tests

- [ ] Image validation tests.
- [ ] Malware/sanitization tests.
- [ ] Thumbnail metadata test.
- [ ] Cross-user signed-URL tests.
- [ ] Restore-binding test.
- [ ] Upload UI test.

## Out of Scope

- Video uploads.
- Image editing.
- Public asset marketplace.

## Story-Specific Notes

- Technical guide references: E13 and E21.

## Implementation Checklist

- [ ] Inspect the current repository and related completed stories.
- [ ] Write a short implementation plan listing files, contracts, migrations, tests, and risks.
- [ ] Implement only this story's scope.
- [ ] Add or update schemas before changing consumers.
- [ ] Add authorization, validation, error, retry, concurrency, and idempotency behavior where applicable.
- [ ] Add structured logs, correlation, audit, and usage records where applicable.
- [ ] Run the required automated tests and affected workspace quality commands.
- [ ] Self-review the diff for scope creep, insecure access, stale data races, and unbounded provider calls.
- [ ] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [ ] Every acceptance criterion is implemented and verified.
- [ ] Every required test is implemented and passing.
- [ ] `lint`, `typecheck`, `test`, and `build` pass for all affected workspaces.
- [ ] Database migrations and compatibility notes are complete where applicable.
- [ ] Public schemas, events, and endpoints are documented.
- [ ] No unresolved tenant-isolation, security, idempotency, concurrency, data-loss, or cost-control defect remains in this scope.
- [ ] No out-of-scope feature or unrelated refactor was added.
- [ ] The Dev Agent Record is complete.
- [ ] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:**
- **Started:**
- **Completed:**
- **Branch/PR:**
- **Files changed:**
- **Migrations:**
- **Contracts changed:**
- **Commands/tests run:**
- **Screenshots or representative output:**
- **Decisions and assumptions:**
- **Deviations from story/technical guide:**
- **Known risks or follow-up:**
