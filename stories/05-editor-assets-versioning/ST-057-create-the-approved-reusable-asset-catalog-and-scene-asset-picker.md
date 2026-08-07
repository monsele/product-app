---
story_id: ST-057
title: "Create the Approved Reusable Asset Catalog and Scene Asset Picker"
phase: "05 \u2014 Storyboard Editing, Assets, and Versions"
status: Ready
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

- [ ] Create asset catalog metadata for type, tags, subject, dimensions, aspect ratio, source/license, usage constraints, and storage/static location.
- [ ] Seed an MVP library of licensed SVG icons, simple illustrations, and shapes.
- [ ] Implement search/filter by scene slot and tags.
- [ ] Implement scene asset binding/unbinding with validation.
- [ ] Display provenance/license metadata.
- [ ] Allow asset reuse across scenes.
- [ ] Mark missing required bindings as validation issues.

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

- [ ] Teachers can find and select compatible assets.
- [ ] Incompatible asset types are rejected.
- [ ] Provenance and usage metadata are visible.
- [ ] The same asset can be reused across scenes.
- [ ] Missing required assets produce clear validation state.

## Required Tests

- [ ] Catalog filter tests.
- [ ] Slot compatibility tests.
- [ ] Binding authorization tests.
- [ ] Invalidation test.
- [ ] Asset picker Playwright test.
- [ ] License metadata completeness test.

## Out of Scope

- Stock-media search.
- Teacher-uploaded assets.
- AI image generation.

## Story-Specific Notes

- Technical guide references: E13.

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
