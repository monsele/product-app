---
story_id: ST-065
title: "Build Full-Lesson Preview, Timeline Seeking, and Scene Navigation"
phase: "06 \u2014 Audio, Validation, Rendering, and Delivery"
status: Ready
priority: must-have
epics: ["E15"]
prd_user_stories: ["E15-US2"]
depends_on: ["ST-023", "ST-054", "ST-063", "ST-064", "ST-056"]
---

# ST-065 — Build Full-Lesson Preview, Timeline Seeking, and Scene Navigation

## Story

As a teacher, I want to watch the complete current lesson, seek through it, navigate by scene, and jump back to editing.

## Outcome

The browser assembles the current valid LessonSpec, audio, captions, and assets into a lower-quality-capable full preview with stale-state awareness.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E15-US2
- `docs/reference/epic-technical-implementation-guide.md` — E15 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-023
- ST-054
- ST-063
- ST-064
- ST-056

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create full preview data/asset manifest API.
- [ ] Assemble scene timeline using shared composition logic.
- [ ] Support play, pause, seek, scene markers, current-scene indicator, and jump-to-editor.
- [ ] Load current authorized audio, captions, and assets.
- [ ] Display outdated/missing scene artifacts before and during preview.
- [ ] Support configurable lower-resolution/quality browser mode.
- [ ] Handle refresh, partial failures, and signed-URL renewal.

## Technical Implementation Requirements

- The browser preview is not a final MP4 and does not change approved versions.
- Use the same LessonSpec and scene library as rendering.
- Do not hide stale audio/caption/asset state.
- Only authorized manifests include signed URLs.
- Avoid downloading unnecessary high-resolution media where lower preview variants exist.

## Contracts and Persistence

- Full preview manifest.
- Timeline/scene marker DTO.

## Interfaces

- `GET /projects/:id/preview-manifest`.
- Full lesson preview route.

## Acceptance Criteria

- [ ] Teachers can play, pause, seek, and navigate by scene.
- [ ] Audio, captions, transitions, and current scene stay synchronized.
- [ ] A teacher can return directly to editing the selected scene.
- [ ] Outdated/missing artifacts are clearly marked.
- [ ] A lower-quality mode reduces preview load without altering final render data.

## Required Tests

- [ ] Timeline synchronization tests.
- [ ] Signed-URL renewal test.
- [ ] Stale artifact UI tests.
- [ ] Playwright seek/navigation test.
- [ ] Frame parity test with renderer.

## Out of Scope

- Collaborative viewing.
- Public share playback.
- Final validation/render.

## Story-Specific Notes

- Technical guide references: E15 and frontend server-state guidance.

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
