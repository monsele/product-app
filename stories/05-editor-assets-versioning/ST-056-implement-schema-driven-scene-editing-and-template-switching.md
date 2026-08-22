---
story_id: ST-056
title: "Implement Schema-Driven Scene Editing and Template Switching"
phase: "05 \u2014 Storyboard Editing, Assets, and Versions"
status: Done
priority: must-have
epics: ["E12"]
prd_user_stories: ["E12-US4"]
depends_on: ["ST-011", "ST-054", "ST-055"]
---

# ST-056 — Implement Schema-Driven Scene Editing and Template Switching

## Story

As a teacher, I want to edit narration, on-screen text, duration, transition, template data, and asset slots with immediate validation.

## Outcome

The selected scene renders an editor derived from template metadata, supports safe template migration, and marks only affected artifacts stale.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E12-US4
- `docs/reference/epic-technical-implementation-guide.md` — E12 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-011
- ST-054
- ST-055

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [x] Build schema-driven forms from scene registry metadata.
- [x] Support common fields and template-specific visual fields.
- [x] Validate client-side and server-side against the same domain schemas.
- [x] Implement save with optimistic concurrency and explicit saving/saved/conflict states.
- [x] Implement template switching with compatible field mapping and confirmation for reset data.
- [x] Apply dependency invalidation rules for narration, duration, asset, visual, and transition changes.
- [x] Refresh the selected-scene preview after persisted changes.

## Technical Implementation Requirements

- The API is the final validation authority.
- Do not use `any` or free-form JSON editors for normal scene editing.
- Changing template never carries incompatible hidden fields.
- Narration changes invalidate audio/captions; asset-only changes do not.
- Duration changes generate audio-fit warnings but do not edit audio automatically.

## Contracts and Persistence

- Template migration result.
- Scene update command with revision.
- Field-level validation errors.

## Interfaces

- Scene update endpoint.
- Template switch endpoint/command.
- Schema-driven editor UI.

## Acceptance Criteria

- [x] All supported template fields are editable through generated forms.
- [x] Invalid values return field-level errors and are not saved.
- [x] Compatible fields survive a template switch; incompatible fields require confirmation/reset.
- [x] Stale/conflict states are explicit.
- [x] Dependency invalidation matches the changed field categories.

## Required Tests

- [x] Form metadata coverage tests.
- [x] API schema validation tests.
- [x] Template migration tests.
- [x] Invalidation matrix tests.
- [x] Concurrency tests.
- [x] Editor/preview Playwright tests.

## Out of Scope

- Free-form animation controls.
- Arbitrary coordinates.
- Asset browsing implementation.

## Story-Specific Notes

- Technical guide references: E12 and schema-driven forms 11.3.

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
- **Branch/PR:** `story/st-056` (no PR created)
- **Files changed:** Shared scene-editor schemas and migration helpers; shared API error envelope and scene-registry metadata; storyboard service/controllers; storyboard editor form/query/panel; unit and Playwright coverage; `STORY_INDEX.md`.
- **Migrations:** None. The mutable storyboard JSON and normalized scene rows already persist the required fields.
- **Contracts changed:** `storyboardSceneUpdateInputSchema`, `storyboardSceneTemplateSwitchInputSchema`, `storyboardSceneEditResponseSchema`, template form metadata, template migration result, selective invalidation scope, and the typed `edit_conflict` API error (including the latest revision/storyboard). Added `PATCH /projects/:projectId/scenes/:sceneId` and `POST /projects/:projectId/scenes/:sceneId/change-template`.
- **Commands/tests run:** affected config/schemas/scene-library/API/web lint and typecheck; config, schema, scene-library, API, and web unit tests; targeted Playwright scene-save and template-confirmation tests; API production build; web production compilation and type validation; `git diff --check`.
- **Review conclusion:** Approve. Follow-up review repaired all findings and found no remaining blocking, high, medium, or low findings.
- **Review findings fixed:** Template migration preserves un-slotted asset bindings; stale edits return a typed conflict with latest persisted state; registry form metadata is sourced from the shared schema metadata; success feedback remains visible while the selected-scene preview reloads; normalized scene rows synchronize changed content and revision; asset-slot edits validate tenant-scoped included source figures, with the broader catalog deferred to ST-057.
- **Screenshots or representative output:** Playwright passed the selected-scene save flow and confirmation-required template migration flow.
- **Decisions and assumptions:** A scene update carries a complete, schema-validated `SceneSpec`; identity/order/provenance/template are immutable in that command. Template changes are isolated to the confirmation-aware migration command. Asset-slot edits are limited to included source figures from the current tenant/project; ST-057 adds the broader approved catalog and picker.
- **Deviations from story/technical guide:** None.
- **Known risks or follow-up:** Full asset catalog selection remains ST-057 scope. Audio/caption invalidation is recorded as a precise invalidation summary; generation/retry is deferred to the audio stories.
