---
story_id: ST-018
title: "Implement the Labelled Diagram Scene Template"
phase: "01 \u2014 Visual Runtime Proof"
status: Ready
priority: must-have
epics: ["E11", "E13"]
prd_user_stories: ["E11-US1", "E11-US2", "E13-US1"]
depends_on: ["ST-010", "ST-011"]
---

# ST-018 — Implement the Labelled Diagram Scene Template

## Story

As a learner, I want parts of a figure or simple model labelled clearly.

## Outcome

The template displays an approved source or library diagram with bounded labels and deterministic callout placement.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E11-US1, E11-US2, E13-US1
- `docs/reference/epic-technical-implementation-guide.md` — E11, E13 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-010
- ST-011

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Define labelled-diagram visual schema with one base asset and label anchors expressed as semantic regions or normalized anchor hints.
- [ ] Implement callout placement, collision detection, and leader lines.
- [ ] Support progressive label reveal.
- [ ] Implement a shapes-only fallback for simple diagrams.
- [ ] Create fixtures with varied aspect ratios and label counts.

## Technical Implementation Requirements

- AI may choose semantic anchors from an approved set but must not emit arbitrary pixel coordinates.
- Teacher-provided/source assets are rendered through a safe media wrapper.
- Label count and text length are bounded.
- Collision failure becomes a validation issue.

## Contracts and Persistence

- `DiagramVisual`.
- `DiagramLabel` with approved anchor enum/hint.
- Base asset slot.

## Interfaces

- Scene registry labelled-diagram implementation.
- Preview composition.

## Acceptance Criteria

- [ ] Labels do not overlap each other, the caption area, or leave the frame for valid fixtures.
- [ ] Unsupported anchors fail schema validation.
- [ ] Missing required base asset produces a blocking validation issue.
- [ ] Source and library assets render with consistent containment.

## Required Tests

- [ ] Callout-placement tests.
- [ ] Collision/overflow tests.
- [ ] Visual regressions.
- [ ] Missing asset test.

## Out of Scope

- Freehand diagram editor.
- Computer vision label detection.
- Interactive hotspots.

## Story-Specific Notes

- Technical guide references: E11 and E13.

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
