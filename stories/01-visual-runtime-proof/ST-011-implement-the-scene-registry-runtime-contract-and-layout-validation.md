---
story_id: ST-011
title: "Implement the Scene Registry, Runtime Contract, and Layout Validation"
phase: "01 \u2014 Visual Runtime Proof"
status: Ready
priority: must-have
epics: ["E11", "E15", "E16"]
prd_user_stories: ["E11-US1", "E15-US1", "E16-US1"]
depends_on: ["ST-007", "ST-010"]
---

# ST-011 — Implement the Scene Registry, Runtime Contract, and Layout Validation

## Story

As the video system, I need one registry that resolves each valid scene type to its schema, editor metadata, preview component, and render component.

## Outcome

A scene can be validated, measured, previewed, and rendered through a deterministic runtime without template-specific branching across the app.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E11-US1, E15-US1, E16-US1
- `docs/reference/epic-technical-implementation-guide.md` — E11, E15, E16 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-007
- ST-010

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create a scene registry keyed by the ten LessonSpec template names.
- [ ] Define the common scene component interface and frame-timing helpers.
- [ ] Define template metadata for form fields, item limits, asset slots, and migration behavior.
- [ ] Implement common layout measurement and overflow reporting primitives.
- [ ] Implement safe text fitting behavior that reports invalid input rather than silently shrinking below readability thresholds.
- [ ] Create default scene factories for each registered template.
- [ ] Create a registry-level preview fixture.

## Technical Implementation Requirements

- Each template owns its input schema and layout.
- The registry must reject unsupported templates before rendering.
- Preview and server rendering use the same component implementation.
- The AI never controls exact coordinates.
- Validation issues must identify the scene, field/path, severity, and suggested correction.

## Contracts and Persistence

- `SceneDefinition<TVisual>`.
- `SceneRegistry`.
- `SceneValidationIssue`.
- `TemplateFormMetadata`.
- `LayoutMeasurement`.

## Interfaces

- `resolveSceneDefinition(scene)`.
- `validateScene(scene)`.
- `createDefaultScene(template)`.
- Shared Remotion scene wrapper.

## Acceptance Criteria

- [ ] All ten template names resolve to registered definitions, even if later stories initially provide placeholder components.
- [ ] Unknown templates fail before player/render execution.
- [ ] A deliberately overflowing fixture returns a field-specific validation issue.
- [ ] Preview and render paths invoke the same registry.

## Required Tests

- [ ] Registry completeness test.
- [ ] Unsupported template test.
- [ ] Overflow primitive tests.
- [ ] Browser/server component parity smoke test.

## Out of Scope

- Final implementation of the ten templates.
- Storyboard editor UI.
- Full lesson timeline.

## Story-Specific Notes

- Technical guide references: E11, E16, and frontend schema-driven forms section 11.3.

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
