---
story_id: ST-018
title: "Implement the Labelled Diagram Scene Template"
phase: "01 \u2014 Visual Runtime Proof"
status: Done
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

- [x] Define labelled-diagram visual schema with one base asset and label anchors expressed as semantic regions or normalized anchor hints.
- [x] Implement callout placement, collision detection, and leader lines.
- [x] Support progressive label reveal.
- [x] Implement a shapes-only fallback for simple diagrams.
- [x] Create fixtures with varied aspect ratios and label counts.

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

- [x] Labels do not overlap each other, the caption area, or leave the frame for valid fixtures.
- [x] Unsupported anchors fail schema validation.
- [x] Missing required base asset produces a blocking validation issue.
- [x] Source and library assets render with consistent containment.

## Required Tests

- [x] Callout-placement tests.
- [x] Collision/overflow tests.
- [x] Visual regressions.
- [x] Missing asset test.

## Out of Scope

- Freehand diagram editor.
- Computer vision label detection.
- Interactive hotspots.

## Story-Specific Notes

- Technical guide references: E11 and E13.

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
- **Started:** 2026-08-12
- **Completed:** 2026-08-12
- **Approved:** 2026-08-12
- **Branch/PR:** `story/st-005-job-platform` / not published
- **Files changed:** `packages/schemas/src/index.ts`, generated LessonSpec JSON Schema and compatibility notes; scene registry, resolved-media composition contract, diagram layout/component/fixtures, exports, and focused tests; `STORY_INDEX.md`.
- **Migrations:** LessonSpec `1.5` to `1.6`; legacy labelled diagrams map to the bounded shapes-only fallback with deterministic semantic anchors.
- **Contracts changed:** `DiagramVisual`, `DiagramLabel`, and the approved semantic anchor enum; an asset diagram requires the `diagram` slot, while shapes mode requires an approved shape.
- **Commands/tests run:** schema generation; schemas and scene-library lint/typecheck/build; schemas test (32 passed); scene-library test including fixed asset/shapes Remotion PNG hash regressions (30 passed).
- **Screenshots or representative output:** Deterministic 30fps Remotion PNG smoke renders for asset and shapes diagrams match fixed SHA-256 visual baselines at settled and progressive-reveal frames; repeated asset render is byte-identical.
- **Decisions and assumptions:** Immutable `LessonSpec` retains only asset IDs. A separate renderer-owned resolved-media map provides approved bundled `/assets/...` or image data sources, preserves source/library provenance, and rejects arbitrary URL schemes before rendering. Missing or unsafe resolved media is an explicit preview-only placeholder and blocks final rendering.
- **Deviations from story/technical guide:** No material deviations. No persistence, authorization, jobs, telemetry, or provider calls are in scope for this deterministic scene-library story.
- **Known risks or follow-up:** The fixed semantic-anchor layout intentionally rejects colliding anchors; a future template-version upgrade could add an approved automatic alternate-anchor strategy.
