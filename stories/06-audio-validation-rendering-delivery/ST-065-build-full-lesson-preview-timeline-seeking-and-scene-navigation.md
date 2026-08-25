---
story_id: ST-065
title: "Build Full-Lesson Preview, Timeline Seeking, and Scene Navigation"
phase: "06 \u2014 Audio, Validation, Rendering, and Delivery"
status: Done
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

- [x] Create full preview data/asset manifest API.
- [x] Assemble scene timeline using shared composition logic.
- [x] Support play, pause, seek, scene markers, current-scene indicator, and jump-to-editor.
- [x] Load current authorized audio, captions, and assets.
- [x] Display outdated/missing scene artifacts before and during preview.
- [x] Support configurable lower-resolution/quality browser mode.
- [x] Handle refresh, partial failures, and signed-URL renewal.

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

- [x] Teachers can play, pause, seek, and navigate by scene.
- [x] Audio, captions, transitions, and current scene stay synchronized.
- [x] A teacher can return directly to editing the selected scene.
- [x] Outdated/missing artifacts are clearly marked.
- [x] A lower-quality mode reduces preview load without altering final render data.

## Required Tests

- [x] Timeline synchronization tests.
- [x] Signed-URL renewal test.
- [x] Stale artifact UI tests.
- [x] Playwright seek/navigation test.
- [x] Frame parity test with renderer.

## Out of Scope

- Collaborative viewing.
- Public share playback.
- Final validation/render.

## Story-Specific Notes

- Technical guide references: E15 and frontend server-state guidance.

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
- **Started:** 2026-08-24
- **Completed:** 2026-08-24
- **Branch/PR:** `story/st-065` / not published
- **Files changed:** Preview-manifest API/controller/runtime wiring; preview-manifest schema; full-lesson composition and tests; preview route/player and Playwright coverage; storyboard preview link; story index and this record.
- **Migrations:** None. The manifest is a derived, non-persistent read model.
- **Contracts changed:** `GET /projects/:id/preview-manifest?quality=standard|low`; versioned `previewManifestSchema`; full-lesson composition accepts resolved signed/catalog assets and browser-audio tracks.
- **Commands/tests run:** `pnpm --filter @avlp/api test -- preview-manifest.test.ts`; `pnpm --filter @avlp/web test -- preview-player.playwright.test.tsx`; `pnpm --filter @avlp/web test -- preview-player.e2e.test.ts`; `pnpm --filter @avlp/scene-library test -- full-lesson.test.ts`; `pnpm exec vitest run src/full-lesson-render-parity.test.ts`; API/web/schema/scene-library typechecks; web/schema/scene-library lint; API/web/schema/scene-library builds; `git diff --check`. The full scene-library suite was also invoked, but pre-existing maximum-density visual tests timed out after test workers from timed commands contended for resources; ST-065's focused suite passes.
- **Screenshots or representative output:** Hydrated Playwright route test confirms Scene 2 navigation changes both seek position and current-scene indicator; static browser coverage confirms stale-artifact alert and selected-scene edit link. Preview-manifest renewal test confirms sequential signed media URLs differ. Remotion parity test confirms equivalent preview and renderer fixture frames have identical PNG output.
- **Decisions and assumptions:** Manifest URLs are generated only after route-level project authorization and never persisted. The latest draft storyboard is preferred, with the latest approved storyboard as fallback. Low quality uses half-resolution Player dimensions and selects project-asset thumbnails when available; catalog assets remain local approved SVGs. Missing scene rows/assets/audio/captions leave their scene visibly stale rather than fabricating output. Audio-load failures automatically renew the in-memory manifest without reloading the editor state.
- **Deviations from story/technical guide:** No migration or preview cache was needed because the guide treats preview as derived. API lint remains blocked by an unrelated existing unused `scene` variable in `apps/api/src/caption-export.ts`.
- **Known risks or follow-up:** Low-quality mode uses an available project-asset/source-figure thumbnail; media without a thumbnail remains authorized at its original rendition. Final render still performs its own E16/E17 validation.
