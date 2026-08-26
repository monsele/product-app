---
story_id: ST-081
title: "Build the Lesson Preview and Preflight Experience"
phase: "08 - Product UI"
status: Done
priority: must-have
epics: ["E14", "E15", "E16"]
prd_user_stories: ["E14-US3", "E15-US2", "E16-US1", "E16-US2"]
depends_on: ["ST-064", "ST-065", "ST-067", "ST-080"]
---

# ST-081 - Build the Lesson Preview and Preflight Experience

## Story

As a teacher, I want a focused full-lesson preview with clear preflight status so
that I can watch, navigate, fix issues, and know when the lesson is ready to
render.

## Outcome

The preview route becomes a Focus Studio theater with a dominant real player,
minimal controls, scene navigation, artifact truthfulness, and direct paths to
resolve blocking issues.

## Required Reading

- `AGENTS.md`
- `docs/design.md` sections 6-9, 10.11, and 11-16
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` E14, E15, and E16
- `docs/reference/epic-technical-implementation-guide.md` E14, E15, E16,
  sections 2.1, 5.3, 6.3, and 11

## Dependencies

- ST-064
- ST-065
- ST-067
- ST-080

Do not start this story until every dependency is marked **Done** in
`STORY_INDEX.md`.

## Scope

- [x] Restyle the full lesson preview as a Focus Studio theater centered on the
      real 16:9 player.
- [x] Provide accessible play, pause, seek, volume, caption, quality, and scene
      navigation controls using the existing preview behavior.
- [x] Connect scene markers to meaningful scene titles and provide an `Edit
      scene` action for the current scene.
- [x] Add a compact preflight region for blocking issues, acknowledged warnings,
      stale artifacts, missing assets, missing audio, invalid scenes, and preview
      quality context.
- [x] Link every resolvable issue to the correct existing storyboard or upstream
      editor location without duplicating the editor inside preview.
- [x] Keep lower-quality preview mode clearly separate from final render quality
      and preserve signed-URL renewal behavior.
- [x] Design initial loading, buffering, partial failure, signed-media renewal,
      stale, invalid, empty, ready, and refresh states.
- [x] Make `Render lesson` available only when the exact current validation and
      workflow state allow rendering.

## Technical Implementation Requirements

- Preview uses the same LessonSpec, scene library, audio, captions, assets, and
  timing logic as the render path.
- Do not hide stale or missing artifacts to make the player appear complete.
- Preserve timeline synchronization, lower-quality mode, signed-URL renewal,
  authorization, validation hashes, and scene deep links.
- Player controls use semantic media behavior and remain usable by keyboard and
  assistive technology.
- Motion is limited to player feedback, panel transitions, and meaningful scene
  changes. Playback remains complete under reduced motion.
- Do not initiate rendering automatically after validation succeeds.

## Contracts and Persistence

- No preview-manifest, caption, validation, signed-media, or persistence changes
  expected.

## Interfaces

- `/workspace/[projectId]/preview`
- Existing preview-manifest, validation, captions, and signed-media APIs.

## Acceptance Criteria

- [x] The real lesson player is visually dominant and play, pause, seek, volume,
      captions, quality, and scene navigation remain synchronized and keyboard
      usable.
- [x] The current scene links directly back to its editing context.
- [x] Blocking, warning, acknowledged, stale, and missing-artifact states are
      explicit and link to the correct existing resolution path.
- [x] Lower-quality mode is clearly explained and does not alter final render
      data.
- [x] Loading, buffering, renewal, partial-failure, and refresh states preserve
      usable context and do not expose signed URLs.
- [x] `Render lesson` appears only for the exact validated current state and
      always requires explicit teacher action.

## Required Tests

- [x] Existing preview synchronization, caption, quality, validation,
      signed-URL, stale-artifact, and authorization tests remain passing.
- [x] Player-control keyboard and accessible-name tests.
- [x] Scene navigation and edit-deep-link Playwright tests.
- [x] Validation issue and render-eligibility state tests.
- [x] Buffering, renewal, partial-failure, and refresh tests.
- [x] Desktop, tablet, mobile, and reduced-motion screenshots.
- [x] Affected web lint, typecheck, test, and build commands.

## Out of Scope

- Editing scenes directly inside preview.
- Changing player timing, validation rules, render eligibility, or media output.
- Public share playback, which is covered by ST-082.

## Story-Specific Notes

- Design direction: `DESIGN_VARIANCE 7`, `MOTION_INTENSITY 6`,
  `VISUAL_DENSITY 4`.

## Implementation Checklist

- [x] Inspect the current repository and related completed stories.
- [x] Write a short implementation plan listing files, contracts, tests,
      performance risks, and media states.
- [x] Implement only this story's scope.
- [x] Preserve timing, validation, authorization, signed-media, and explicit
      render-action behavior.
- [x] Run required automated, accessibility, media, and visual tests.
- [x] Self-review player controls, scene synchronization, stale-state truth, and
      mobile theater behavior.
- [x] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [x] Every acceptance criterion is implemented and verified.
- [x] Every required test is implemented and passing.
- [x] `lint`, `typecheck`, `test`, and `build` pass for affected workspaces.
- [x] No preview, caption, validation, signed-media, or authorization regression
      remains.
- [x] The Dev Agent Record is complete.
- [x] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:** Antigravity
- **Started:** 2026-08-26
- **Completed:** 2026-08-26
- **Branch/PR:** main
- **Files changed:**
  - `apps/web/app/workspace/[projectId]/preview/page.tsx`
  - `apps/web/app/workspace/[projectId]/preview/preview-player.tsx`
  - `apps/web/app/workspace/[projectId]/preview/preview-player.e2e.test.ts`
  - `apps/web/app/workspace/[projectId]/preview/preview.playwright.test.tsx`
  - `stories/08-product-ui/ST-081-build-the-lesson-preview-and-preflight-experience.md`
  - `STORY_INDEX.md`
- **Migrations:** None expected or required.
- **Contracts changed:** None. Reused existing preview manifest and validation schemas.
- **Commands/tests run:**
  - `pnpm --filter @avlp/web test` (38 test files, 152 tests passing)
  - `pnpm --filter @avlp/api test -- preview-manifest.test.ts` (44 test files, 406 tests passing)
  - `pnpm --filter @avlp/web typecheck` (passed)
  - `pnpm --filter @avlp/web lint` (passed)
  - `pnpm --filter @avlp/web build` (passed)
- **Screenshots or representative output:**
  - Focus Studio theater layout centered on dominant 16:9 player with violet accents.
  - Preflight checks section displaying readiness status, grouped blocking issues & advisory warnings, and warning acknowledgment.
  - Stale media alerts with plain-language scene breakdown and renewal actions.
  - Responsive desktop (1280px), tablet (768px), mobile (375px), and 200% zoom (640px) verified via Playwright tests.
- **Decisions and assumptions:**
  - Embedded `AuthenticatedAppShell` in `mode="focus-studio"` with project pipeline rail showing "Preview" step.
  - Preflight validation is fetched on load and allows inline re-runs and warning acknowledgments.
  - "Render lesson" CTA is gated strictly behind 0 blocking issues, 0 stale scenes, and fresh validation run.
- **Known risks or follow-up:** None. ST-082 will build the render, delivery, and public playback UI.
- **Deviations from story or technical guide:** None.
