---
story_id: ST-080
title: "Build the Focus Studio Storyboard Workspace"
phase: "08 - Product UI"
status: Ready
priority: must-have
epics: ["E10", "E12", "E13", "E14", "E16", "E19", "E20"]
prd_user_stories: ["E10-US2", "E12-US1", "E12-US2", "E12-US3", "E12-US4", "E13-US1", "E13-US2", "E13-US3", "E14-US2", "E16-US2", "E19-US1", "E19-US2", "E20-US1", "E20-US2"]
depends_on: ["ST-051", "ST-053", "ST-061", "ST-063", "ST-067", "ST-079"]
---

# ST-080 - Build the Focus Studio Storyboard Workspace

## Story

As a teacher, I want the storyboard to feel like a focused creative studio so
that I can navigate scenes, edit safely, inspect evidence, manage assets and
audio, and understand validation without leaving the selected scene.

## Outcome

The storyboard route becomes the main Focus Studio workspace with adaptive scene
navigation, a dominant real scene preview, a contextual inspector, complete
editor states, and keyboard-equivalent direct manipulation.

## Required Reading

- `AGENTS.md`
- `docs/design.md` sections 5-9, 10.10, and 11-16
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/adr/ADR-002-citation-history-version-wiring.md`
- `docs/adr/ADR-003-draft-scene-schema-relaxation.md`
- `docs/reference/mvp-prd.md` E10, E12, E13, E14, E16, E19, and E20
- `docs/reference/epic-technical-implementation-guide.md` E10, E12, E13, E14,
  E16, E19, E20, sections 2.1-2.3, 5.3, 6.3, and 11

## Dependencies

- ST-051
- ST-053
- ST-061
- ST-063
- ST-067
- ST-079

Do not start this story until every dependency is marked **Done** in
`STORY_INDEX.md`.

## Scope

- [ ] Compose the route as scene navigation, a dominant 16:9 selected-scene
      canvas, and a contextual inspector on wide screens.
- [ ] Restyle scene thumbnails using real frame previews when available, with
      order, title, duration, template, grounding, asset, audio, stale, and
      validation state outside the image.
- [ ] Keep selection in route or supported local state through refresh, save,
      reorder, generation, and refetch.
- [ ] Present add, duplicate, delete, reorder, template switch, save, scene
      regeneration, and preview actions with clear scope and consequences.
- [ ] Organize the inspector into `Content`, `Visual`, `Audio`, `Sources`, and
      `Checks` groups using tabs or disclosure sections as density requires.
- [ ] Restyle schema-driven fields, template migration confirmation, approved and
      teacher asset pickers, illustration candidates, citations, grounding,
      scene audio, validation issues, and version history inside the selected
      scene context.
- [ ] Keep paid generation actions explicit, show quota or usage guidance from
      current contracts, and separate candidates from accepted assets or scenes.
- [ ] Provide saving, saved, invalid, stale, conflict, loading, empty,
      generation, audio, signed-media, validation, and restore states.
- [ ] At tablet widths, use a collapsible scene strip and inspector drawer. At
      mobile widths, use `Scenes`, `Preview`, and `Details` tabs with button-based
      reorder alternatives.
- [ ] Keep `Preview lesson` as the primary continuation only when current
      workflow and validation state permit it.

## Technical Implementation Requirements

- Preserve all scene, storyboard, asset, audio, citation, grounding, validation,
  version, concurrency, authorization, cost, and idempotency behavior.
- The canvas uses the real selected Remotion scene preview. Do not build a fake
  representation from decorative rectangles.
- Mount only the selected scene player and keep maximum-scene-count navigation
  bounded and usable.
- The editor remains schema driven. Do not add free-form JSON, arbitrary pixel
  coordinates, or arbitrary animation controls.
- Draft scenes may be incomplete as defined by ADR-003. The UI labels missing
  narration or sources and does not imply final LessonSpec validity.
- Reorder and panel transitions may use Motion layout behavior. All interactions
  have reduced-motion and keyboard alternatives.
- The optional bottom tool dock may appear only if every visible tool maps to an
  implemented storyboard action. Do not add decorative tools.
- On small screens, no essential action may depend on hover, wide drag targets,
  or three simultaneous columns.

## Contracts and Persistence

- No storyboard, scene, asset, audio, citation, validation, or version contract
  changes expected.
- Internal storyboard-shell and inspector component contracts.

## Interfaces

- `/workspace/[projectId]/storyboard`
- Existing storyboard, scene, asset, illustration, citation, grounding, audio,
  validation, and version APIs.

## Acceptance Criteria

- [ ] The selected real scene preview is the dominant element and is the only
      mounted scene player.
- [ ] Scene navigation communicates order and authoritative state, supports deep
      linking, and remains usable at the configured maximum scene count.
- [ ] Every scene edit and generation action names its scope, preserves unrelated
      teacher edits, and reflects persisted save, conflict, or candidate state.
- [ ] Content, visual, audio, source, validation, and version tools remain within
      one contextual inspector path and do not compete with the canvas.
- [ ] Reorder, add, duplicate, delete, template switch, candidate selection, and
      version restore remain keyboard usable and show required confirmations.
- [ ] Desktop, tablet, and mobile layouts follow the documented three-region,
      strip-and-drawer, and tabbed models without hiding the primary action.
- [ ] Draft missing-data, stale, invalid, failed, and paid-generation states are
      explicit and do not rely on color alone.

## Required Tests

- [ ] All existing storyboard, scene, asset, illustration, citation, grounding,
      audio, validation, version, concurrency, authorization, cost, and
      idempotency suites remain passing.
- [ ] Selected-player mount-count and maximum-scene-count performance tests.
- [ ] Selection persistence, deep-link, save, conflict, and refresh Playwright
      tests.
- [ ] Keyboard reorder, CRUD, template-switch, dialog, asset-picker, inspector,
      and version-restore tests.
- [ ] Tablet drawer and mobile `Scenes`, `Preview`, and `Details` tab tests.
- [ ] Desktop, tablet, mobile, reduced-motion, and high-density screenshots.
- [ ] Affected web lint, typecheck, test, and build commands.

## Out of Scope

- New scene templates, arbitrary animation code, arbitrary coordinates, or a
  free-form canvas editor.
- New asset-generation providers, collaboration, comments, presence, or cursors.
- Changing LessonSpec, validation, version, or paid-action rules.

## Story-Specific Notes

- This is the only route where a real function-backed bottom editing dock may be
  considered.
- Design direction: `DESIGN_VARIANCE 6`, `MOTION_INTENSITY 5`,
  `VISUAL_DENSITY 7`.

## Implementation Checklist

- [ ] Inspect the current repository and related completed stories.
- [ ] Write a short implementation plan listing files, contracts, tests,
      performance risks, and panel ownership.
- [ ] Implement only this story's scope.
- [ ] Preserve schema-driven editing, immutable versions, cost controls,
      authorization, and selected-player limits.
- [ ] Run required automated, performance, accessibility, and visual tests.
- [ ] Self-review focus restoration, mobile equivalence, stale-state truthfulness,
      and client-boundary cost.
- [ ] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [ ] Every acceptance criterion is implemented and verified.
- [ ] Every required test is implemented and passing.
- [ ] `lint`, `typecheck`, `test`, and `build` pass for affected workspaces.
- [ ] No schema, editor, media, cost, version, or authorization regression
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
- **Contracts changed:** Internal storyboard UI contracts only.
- **Commands/tests run:**
- **Screenshots or representative output:**
- **Decisions and assumptions:**
- **Known risks or follow-up:**
- **Deviations from story or technical guide:**
