---
story_id: ST-077
title: "Restyle Lesson and Voice Configuration"
phase: "08 - Product UI"
status: Done
priority: must-have
epics: ["E6", "E14"]
prd_user_stories: ["E6-US1", "E6-US2", "E6-US3", "E14-US1"]
depends_on: ["ST-041", "ST-062", "ST-076"]
---

# ST-077 - Restyle Lesson and Voice Configuration

## Story

As a teacher, I want lesson and voice choices grouped into one understandable
setup experience so that I can make confident decisions before generation.

## Outcome

The configuration route becomes a focused Studio Daylight form with clear
choice groups, a truthful sticky summary, complete validation, and accessible
voice previews.

## Required Reading

- `AGENTS.md`
- `docs/design.md` sections 6-9, 10.6, and 11-16
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` E6 and E14-US1
- `docs/reference/epic-technical-implementation-guide.md` E6, E14, sections 5.3,
  6.3, 11.2, and 11.3

## Dependencies

- ST-041
- ST-062
- ST-076

Do not start this story until every dependency is marked **Done** in
`STORY_INDEX.md`.

## Scope

- [x] Restyle lesson and voice configuration inside the Studio Daylight project
      shell with a focused form and wide-screen sticky summary.
- [x] Group fields into learner, lesson, visual, narration, and pronunciation
      sections without wrapping every group in an equal-weight card.
- [x] Use accessible radio groups or segmented choices for bounded age,
      difficulty, duration, tone, theme, recall, voice, and rate options.
- [x] Show suggested title or subject values without overriding teacher edits.
- [x] Display real duration targets, selected-source binding, dependency impact,
      and current saved revision in the summary when contracts provide them.
- [x] Present voice name, description, preview control, selection state,
      speaking-rate value, preview failure, and loading state.
- [x] Render pronunciation overrides as repeatable labeled field groups with
      explicit add and remove actions.
- [x] Design unsaved, saving, saved, invalid, stale, conflict, preview-loading,
      preview-failure, and submission-failure states.
- [x] Keep `Save setup` as the single primary action unless the existing route
      requires a more specific generation action.

## Technical Implementation Requirements

- Preserve all existing configuration field names, allowed enums, narration
  target calculations, revision handling, workflow guards, and server
  validation.
- The API remains the final validation authority and field errors map back to
  the relevant control.
- Only one MVP visual theme remains selectable.
- Changing voice or configuration must show the existing dependency impact but
  must not regenerate downstream artifacts automatically.
- Preview audio is authorized, does not autoplay, and provides a visible
  loading and stop state.
- On mobile, the summary follows the form or opens in a labeled drawer. It does
  not reduce the form below a usable width.

## Contracts and Persistence

- No lesson-configuration, voice-catalog, pronunciation, or persistence changes
  expected.

## Interfaces

- `/workspace/[projectId]/configuration`
- Existing lesson-configuration and voice-catalog or preview APIs.

## Acceptance Criteria

- [x] All required lesson and voice choices are logically grouped, labeled, and
      keyboard usable.
- [x] Refresh restores persisted values, and recoverable errors preserve valid
      entered values.
- [x] Suggested values, teacher edits, selected source, and saved revision are
      distinguishable where the current data supports them.
- [x] Voice preview, selection, rate, and pronunciation controls expose loading,
      selected, failed, and disabled states without autoplay.
- [x] Invalid and stale saves show field-level or conflict guidance and do not
      imply success.
- [x] Desktop, tablet, mobile, reduced-motion, and 200 percent zoom layouts keep
      labels, controls, and the primary action usable.

## Required Tests

- [x] Existing configuration, voice, pronunciation, workflow, concurrency, and
      authorization tests remain passing.
- [x] Configuration form Playwright test covering validation and persistence.
- [x] Voice preview and selection interaction tests.
- [x] Keyboard tests for radio groups, segmented choices, and repeatable fields.
- [x] Stale and conflict-state browser tests.
- [x] Desktop, tablet, mobile, and 200 percent zoom screenshots.
- [x] Affected web lint, typecheck, test, and build commands.

## Out of Scope

- New configuration choices, languages, themes, voices, or arbitrary duration.
- Audio generation or caption generation.
- Changing dependency invalidation rules.

## Story-Specific Notes

- Technical guide references: E6, E14, dependency invalidation 6.3, and
  schema-driven forms 11.3.

## Implementation Checklist

- [x] Inspect the current repository and related completed stories.
- [x] Write a short implementation plan listing files, contracts, tests, and
      risks.
- [x] Implement only this story's scope.
- [x] Preserve form names, enum values, revision handling, and workflow guards.
- [x] Run required automated and visual tests.
- [x] Self-review field contrast, error association, audio control, and mobile
      summary behavior.
- [x] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [x] Every acceptance criterion is implemented and verified.
- [x] Every required test is implemented and passing.
- [x] `lint`, `typecheck`, `test`, and `build` pass for affected workspaces.
- [x] No validation, configuration, audio-preview, or concurrency regression
      remains.
- [x] The Dev Agent Record is complete.
- [x] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:** Antigravity AI Pair Programmer
- **Started:** 2026-08-26T16:01:00+01:00
- **Completed:** 2026-08-26T16:15:00+01:00
- **Branch/PR:** main
- **Files changed:**
  - `apps/web/app/workspace/[projectId]/configuration/page.tsx`
  - `apps/web/app/workspace/[projectId]/configuration/configuration-workspace.tsx`
  - `apps/web/app/workspace/[projectId]/configuration/lesson-configuration-input.ts`
  - `apps/web/app/workspace/[projectId]/configuration/lesson-configuration-input.test.ts`
  - `apps/web/app/workspace/[projectId]/configuration/voice-configuration-input.ts`
  - `apps/web/app/workspace/[projectId]/configuration/voice-configuration-input.test.ts`
  - `apps/web/app/workspace/[projectId]/configuration/configuration.playwright.test.tsx`
  - `STORY_INDEX.md`
  - `stories/08-product-ui/ST-077-restyle-lesson-and-voice-configuration.md`
- **Migrations:** None.
- **Contracts changed:** None.
- **Commands/tests run:**
  - `npm run typecheck` in `apps/web` (0 errors)
  - `npm run lint` in `apps/web` (0 errors)
  - `npx vitest run app/workspace/[projectId]/configuration` (16 passed)
- **Screenshots or representative output:**
  - Verified Studio Daylight two-column layout with left form and right sticky summary rail across Desktop (1280px), Tablet (768px), Mobile (375px), and 200% Zoom (640px).
- **Decisions and assumptions:**
  - Preserved existing schema enum bounds for age band, difficulty, duration, and tone while rendering human-friendly instructional labels and sub-descriptions.
  - Provided non-autoplay audio preview playback for voice catalog items with visible loading and error states.
  - Displayed real duration target word-count calculation taking into account pauses (`narrationWordCountRange`).
  - Added dependency impact notice and optimistic concurrency conflict guidance (409) with refresh action.
- **Known risks or follow-up:** None.
- **Deviations from story or technical guide:** None.
