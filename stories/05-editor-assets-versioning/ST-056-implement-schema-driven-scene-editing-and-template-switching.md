---
story_id: ST-056
title: "Implement Schema-Driven Scene Editing and Template Switching"
phase: "05 \u2014 Storyboard Editing, Assets, and Versions"
status: Ready
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

- [ ] Build schema-driven forms from scene registry metadata.
- [ ] Support common fields and template-specific visual fields.
- [ ] Validate client-side and server-side against the same domain schemas.
- [ ] Implement save with optimistic concurrency and explicit saving/saved/conflict states.
- [ ] Implement template switching with compatible field mapping and confirmation for reset data.
- [ ] Apply dependency invalidation rules for narration, duration, asset, visual, and transition changes.
- [ ] Refresh the selected-scene preview after persisted changes.

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

- [ ] All supported template fields are editable through generated forms.
- [ ] Invalid values return field-level errors and are not saved.
- [ ] Compatible fields survive a template switch; incompatible fields require confirmation/reset.
- [ ] Stale/conflict states are explicit.
- [ ] Dependency invalidation matches the changed field categories.

## Required Tests

- [ ] Form metadata coverage tests.
- [ ] API schema validation tests.
- [ ] Template migration tests.
- [ ] Invalidation matrix tests.
- [ ] Concurrency tests.
- [ ] Editor/preview Playwright tests.

## Out of Scope

- Free-form animation controls.
- Arbitrary coordinates.
- Asset browsing implementation.

## Story-Specific Notes

- Technical guide references: E12 and schema-driven forms 11.3.

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
