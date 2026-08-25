---
story_id: ST-057
title: "Create the Approved Reusable Asset Catalog and Scene Asset Picker"
phase: "05 \u2014 Storyboard Editing, Assets, and Versions"
status: Done
priority: must-have
epics: ["E13"]
prd_user_stories: ["E13-US1"]
depends_on: ["ST-004", "ST-011", "ST-040", "ST-056"]
---

# ST-057 — Create the Approved Reusable Asset Catalog and Scene Asset Picker

## Story

As a teacher, I want consistent icons and illustrations selected from an approved library for each scene requirement.

## Outcome

A tagged asset catalog exposes approved reusable media and a schema-aware picker that binds compatible assets to scene slots.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E13-US1
- `docs/reference/epic-technical-implementation-guide.md` — E13 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-004
- ST-011
- ST-040
- ST-056

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [x] Create asset catalog metadata for type, tags, subject, dimensions, aspect ratio, source/license, usage constraints, and storage/static location.
- [x] Seed an MVP library of licensed SVG icons, simple illustrations, and shapes.
- [x] Implement search/filter by scene slot and tags.
- [x] Implement scene asset binding/unbinding with validation.
- [x] Display provenance/license metadata.
- [x] Allow asset reuse across scenes.
- [x] Mark missing required bindings as validation issues.

## Technical Implementation Requirements

- Only approved/licensed assets enter the catalog.
- Scene definitions declare acceptable asset types/aspect ratios.
- Store stable asset IDs, not signed URLs, in LessonSpec.
- Excluded source figures are not candidates.
- Asset changes invalidate scene preview/render, not narration audio.

## Contracts and Persistence

- Asset catalog entity/manifest.
- Asset search DTO.
- Scene asset binding.

## Interfaces

- `GET /assets` with bounded filters.
- Bind/unbind scene asset endpoints.
- Asset picker UI.

## Acceptance Criteria

- [x] Teachers can find and select compatible assets.
- [x] Incompatible asset types are rejected.
- [x] Provenance and usage metadata are visible.
- [x] The same asset can be reused across scenes.
- [x] Missing required assets produce clear validation state.

## Required Tests

- [x] Catalog filter tests.
- [x] Slot compatibility tests.
- [x] Binding authorization tests.
- [x] Invalidation test.
- [x] Asset picker Playwright test.
- [x] License metadata completeness test.

## Out of Scope

- Stock-media search.
- Teacher-uploaded assets.
- AI image generation.

## Story-Specific Notes

- Technical guide references: E13.

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
- **Completed:** 2026-08-22
- **Approved:** 2026-08-22
- **Branch/PR:** `story/st-057` / no PR created
- **Files changed:** Shared asset/catalog and slot contracts; API catalog manifest, search, binding routes, and scene-aware asset validation; the picker/query UI with tag filtering; five original CC0 SVGs; focused API, UI, and browser tests.
- **Migrations:** None. The approved MVP catalog is an immutable static manifest and the existing `LessonSpec` binding keeps only stable asset UUIDs.
- **Contracts changed:** `GET /assets` and project-scoped catalog search; `PUT`/`DELETE /projects/:projectId/scenes/:sceneId/asset-bindings/:slot`; catalog search/result and slot-requirement schemas; `missing_required` scene asset status.
- **Review conclusion:** Approve. Follow-up review repaired all findings and found no remaining blocking, high, medium, or low findings.
- **Review findings fixed:** Required-asset validation now follows the actual visual mode and all planned slots; tag filtering is available in the picker; catalog query inputs handle repeated tag parameters safely.
- **Commands/tests run:** `pnpm --filter @avlp/schemas build`; schemas lint/typecheck/test (250 passing); API lint/typecheck/build and focused tests (40 passing across three files); web lint/typecheck/build and focused tests (15 passing across two files), including the Playwright picker check; `git diff --check`.
- **Screenshots or representative output:** Playwright verified the picker’s accessible slot selector and visible CC0/source provenance; production web build completed successfully.
- **Decisions and assumptions:** The catalog contains five original, in-repository CC0 SVGs so every asset has deterministic licensing/provenance and no external media search is needed. Catalog assets are globally immutable; project authorization remains mandatory for scene binding. Required slots are evaluated against the actual scene visual mode plus its planned requirements, picker tag filters use the bounded project catalog endpoint, and repeated tag query values are validated at the API boundary.
- **Deviations from story/technical guide:** No migrations were necessary because the story permits an asset catalog manifest/static location. Teacher uploads, stock search, and AI generation remain out of scope.
- **Known risks or follow-up:** The next asset stories must preserve the catalog’s slot-compatibility and provenance checks when adding private teacher uploads or generated assets.
