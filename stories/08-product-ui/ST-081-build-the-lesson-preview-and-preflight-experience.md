---
story_id: ST-081
title: "Build the Lesson Preview and Preflight Experience"
phase: "08 - Product UI"
status: Ready
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

- [ ] Restyle the full lesson preview as a Focus Studio theater centered on the
      real 16:9 player.
- [ ] Provide accessible play, pause, seek, volume, caption, quality, and scene
      navigation controls using the existing preview behavior.
- [ ] Connect scene markers to meaningful scene titles and provide an `Edit
      scene` action for the current scene.
- [ ] Add a compact preflight region for blocking issues, acknowledged warnings,
      stale artifacts, missing assets, missing audio, invalid scenes, and preview
      quality context.
- [ ] Link every resolvable issue to the correct existing storyboard or upstream
      editor location without duplicating the editor inside preview.
- [ ] Keep lower-quality preview mode clearly separate from final render quality
      and preserve signed-URL renewal behavior.
- [ ] Design initial loading, buffering, partial failure, signed-media renewal,
      stale, invalid, empty, ready, and refresh states.
- [ ] Make `Render lesson` available only when the exact current validation and
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

- [ ] The real lesson player is visually dominant and play, pause, seek, volume,
      captions, quality, and scene navigation remain synchronized and keyboard
      usable.
- [ ] The current scene links directly back to its editing context.
- [ ] Blocking, warning, acknowledged, stale, and missing-artifact states are
      explicit and link to the correct existing resolution path.
- [ ] Lower-quality mode is clearly explained and does not alter final render
      data.
- [ ] Loading, buffering, renewal, partial-failure, and refresh states preserve
      usable context and do not expose signed URLs.
- [ ] `Render lesson` appears only for the exact validated current state and
      always requires explicit teacher action.

## Required Tests

- [ ] Existing preview synchronization, caption, quality, validation,
      signed-URL, stale-artifact, and authorization tests remain passing.
- [ ] Player-control keyboard and accessible-name tests.
- [ ] Scene navigation and edit-deep-link Playwright tests.
- [ ] Validation issue and render-eligibility state tests.
- [ ] Buffering, renewal, partial-failure, and refresh tests.
- [ ] Desktop, tablet, mobile, and reduced-motion screenshots.
- [ ] Affected web lint, typecheck, test, and build commands.

## Out of Scope

- Editing scenes directly inside preview.
- Changing player timing, validation rules, render eligibility, or media output.
- Public share playback, which is covered by ST-082.

## Story-Specific Notes

- Design direction: `DESIGN_VARIANCE 7`, `MOTION_INTENSITY 6`,
  `VISUAL_DENSITY 4`.

## Implementation Checklist

- [ ] Inspect the current repository and related completed stories.
- [ ] Write a short implementation plan listing files, contracts, tests,
      performance risks, and media states.
- [ ] Implement only this story's scope.
- [ ] Preserve timing, validation, authorization, signed-media, and explicit
      render-action behavior.
- [ ] Run required automated, accessibility, media, and visual tests.
- [ ] Self-review player controls, scene synchronization, stale-state truth, and
      mobile theater behavior.
- [ ] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [ ] Every acceptance criterion is implemented and verified.
- [ ] Every required test is implemented and passing.
- [ ] `lint`, `typecheck`, `test`, and `build` pass for affected workspaces.
- [ ] No preview, caption, validation, signed-media, or authorization regression
      remains.
- [ ] The Dev Agent Record is complete.
- [ ] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:**
- **Started:**
- **Completed:**
- **Branch/PR:**
- **Files changed:**
- **Migrations:** None expected.
- **Contracts changed:** None expected.
- **Commands/tests run:**
- **Screenshots or representative output:**
- **Decisions and assumptions:**
- **Known risks or follow-up:**
- **Deviations from story or technical guide:**
