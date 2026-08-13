---
story_id: ST-023
title: "Assemble a Manual Three-Minute LessonSpec and Full Composition"
phase: "01 \u2014 Visual Runtime Proof"
status: Done
priority: must-have
epics: ["E10", "E11", "E15"]
prd_user_stories: ["E10-US1", "E15-US2"]
depends_on: ["ST-007", "ST-012", "ST-013", "ST-015", "ST-021", "ST-022"]
---

# ST-023 — Assemble a Manual Three-Minute LessonSpec and Full Composition

## Story

As the product team, we need a hand-authored lesson to prove the schema and visual grammar before relying on AI generation.

## Outcome

A three-minute introductory science lesson fixture assembles multiple scenes into a deterministic full composition with transitions and captions.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E10-US1, E15-US2
- `docs/reference/epic-technical-implementation-guide.md` — E10, E11, E15 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-007
- ST-012
- ST-013
- ST-015
- ST-021
- ST-022

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [x] Create a licensed or original five-page-equivalent science fixture and a hand-authored LessonSpec.
- [x] Use at least hook, definition, input-process-output, and summary templates.
- [x] Implement scene-to-timeline frame calculation.
- [x] Implement allowed transitions and caption overlay across the full composition.
- [x] Create placeholder/local narration audio or deterministic silence tracks.
- [x] Expose a full composition preview in the development gallery.
- [x] Record known visual and pedagogical review notes.

## Technical Implementation Requirements

- The full timeline derives from scene duration and 30 fps.
- Scene IDs and source references are stable.
- Do not add AI generation in this story.
- This fixture becomes a regression anchor for later editor, audio, validation, and rendering stories.

## Contracts and Persistence

- Full lesson composition props.
- Timeline segment calculation.
- Fixture manifest.

## Interfaces

- Development full-lesson preview route.
- Composition registered for Remotion rendering.

## Acceptance Criteria

- [x] The lesson duration is approximately three minutes and matches calculated frames.
- [x] Scene transitions do not introduce audio/caption drift.
- [x] The fixture validates against LessonSpec v1.
- [x] The full lesson can be navigated and previewed locally.

## Required Tests

- [x] Timeline calculation tests.
- [x] Full composition frame snapshots.
- [x] Caption continuity test.
- [x] Schema and source-reference tests.

## Out of Scope

- Document ingestion.
- AI generation.
- Production editor.

## Story-Specific Notes

- Technical guide delivery sequence requires this manual visual pipeline before autonomous generation.

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
- **Started:** 2026-08-13
- **Completed:** 2026-08-13
- **Branch/PR:** `story/st-023`; no PR published.
- **Files changed:** `packages/scene-library/src/full-lesson.tsx`, `full-lesson.fixture.ts`, `full-lesson.test.ts`, `full-lesson-render.test.ts`, `scene-preview-composition.tsx`, and package exports; the development preview gallery, its Playwright test, this story, and `STORY_INDEX.md`.
- **Migrations:** None.
- **Contracts changed:** Added validated full-lesson composition props, deterministic-silence narration tracks, full-timeline caption cues, and stable timeline segments. Caption and silence-track coverage must exactly match scene frame ranges to prevent fixture timing drift.
- **Commands/tests run:** Passed: scene-library lint/typecheck/test (including 30fps Remotion full-composition smoke); web lint/typecheck/build; Playwright `e2e/video-design-preview.spec.ts` (3 tests); workspace `pnpm typecheck`; `git diff --check`. Workspace `pnpm test` is blocked by a pre-existing `@avlp/evals` baseline-fixture failure; affected scene-library and web tests passed.
- **Screenshots or representative output:** Full composition registered at 1920x1080/30fps with 5,400 frames. Browser test navigated directly to Scene 4 (frame 2,700); renderer smoke produced deterministic PNG frames at the initial and transition boundaries.
- **Decisions and assumptions:** The five-page source is original educational text, retained as an immutable fixture manifest. Each 30-second scene has a deterministic silence track until the later audio story supplies approved timed narration. Captions occupy the complete, non-overlapping scene frame range and transitions do not alter timeline duration.
- **Deviations from story/technical guide:** The authenticated preview manifest, signed-media refresh, stale state, edit-return action, and low-quality toggle require the project/editor and audio dependencies of later stories; this development fixture intentionally has no external media.
- **Known risks or follow-up:** Silence tracks are a regression anchor only and must be replaced with approved audio/caption assets before production render. The unrelated `@avlp/evals` baseline failure should be repaired in its owning story before repository-wide test gating.
