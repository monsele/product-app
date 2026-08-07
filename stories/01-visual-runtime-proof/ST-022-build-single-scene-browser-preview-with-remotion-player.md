---
story_id: ST-022
title: "Build Single-Scene Browser Preview with Remotion Player"
phase: "01 \u2014 Visual Runtime Proof"
status: Ready
priority: must-have
epics: ["E15"]
prd_user_stories: ["E15-US1"]
depends_on:
  [
    "ST-011",
    "ST-012",
    "ST-013",
    "ST-014",
    "ST-015",
    "ST-016",
    "ST-017",
    "ST-018",
    "ST-019",
    "ST-020",
    "ST-021",
  ]
---

# ST-022 — Build Single-Scene Browser Preview with Remotion Player

## Story

As a teacher, I want to preview one scene in the browser before paying for or waiting on a full video render.

## Outcome

A reusable preview component loads a valid scene, theme, assets, optional audio, captions, and transition context through the shared scene runtime.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E15-US1
- `docs/reference/epic-technical-implementation-guide.md` — E15 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-011
- ST-012
- ST-013
- ST-014
- ST-015
- ST-016
- ST-017
- ST-018
- ST-019
- ST-020
- ST-021

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Integrate Remotion Player into a preview route or component.
- [ ] Resolve scenes through the shared registry.
- [ ] Support play, pause, seek, replay, and muted playback.
- [ ] Load authorized assets/audio using short-lived URLs or local fixtures.
- [ ] Display captions and transition context where available.
- [ ] Display loading, invalid schema, missing asset, and playback error states.
- [ ] Avoid rendering the whole lesson when only one scene is selected.

## Technical Implementation Requirements

- Preview consumes LessonSpec-compatible scene data and the same component used by server rendering.
- Do not treat browser preview success as final validation.
- Cache only by scene content hash/theme/library version.
- Do not persist signed URLs in scene data.

## Contracts and Persistence

- Scene preview input DTO.
- Preview asset manifest.
- Caption cue input.

## Interfaces

- Preview component.
- Fixture route/gallery for all ten templates.
- Error boundary.

## Acceptance Criteria

- [ ] Each template fixture plays in the browser.
- [ ] Seeking produces the expected deterministic frame.
- [ ] Invalid input displays an actionable error rather than crashing the page.
- [ ] A scene preview does not trigger a server MP4 render.

## Required Tests

- [ ] Component tests for controls and error states.
- [ ] Playwright preview tests.
- [ ] Frame parity comparison with renderer fixture.
- [ ] Missing asset/audio tests.

## Out of Scope

- Full lesson timeline.
- Teacher storyboard editor.
- Provider-generated audio.

## Story-Specific Notes

- Technical guide references: E15 and section 11.2.

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
