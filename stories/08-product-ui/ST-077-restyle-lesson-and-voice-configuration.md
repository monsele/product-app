---
story_id: ST-077
title: "Restyle Lesson and Voice Configuration"
phase: "08 - Product UI"
status: Ready
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

- [ ] Restyle lesson and voice configuration inside the Studio Daylight project
      shell with a focused form and wide-screen sticky summary.
- [ ] Group fields into learner, lesson, visual, narration, and pronunciation
      sections without wrapping every group in an equal-weight card.
- [ ] Use accessible radio groups or segmented choices for bounded age,
      difficulty, duration, tone, theme, recall, voice, and rate options.
- [ ] Show suggested title or subject values without overriding teacher edits.
- [ ] Display real duration targets, selected-source binding, dependency impact,
      and current saved revision in the summary when contracts provide them.
- [ ] Present voice name, description, preview control, selection state,
      speaking-rate value, preview failure, and loading state.
- [ ] Render pronunciation overrides as repeatable labeled field groups with
      explicit add and remove actions.
- [ ] Design unsaved, saving, saved, invalid, stale, conflict, preview-loading,
      preview-failure, and submission-failure states.
- [ ] Keep `Save setup` as the single primary action unless the existing route
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

- [ ] All required lesson and voice choices are logically grouped, labeled, and
      keyboard usable.
- [ ] Refresh restores persisted values, and recoverable errors preserve valid
      entered values.
- [ ] Suggested values, teacher edits, selected source, and saved revision are
      distinguishable where the current data supports them.
- [ ] Voice preview, selection, rate, and pronunciation controls expose loading,
      selected, failed, and disabled states without autoplay.
- [ ] Invalid and stale saves show field-level or conflict guidance and do not
      imply success.
- [ ] Desktop, tablet, mobile, reduced-motion, and 200 percent zoom layouts keep
      labels, controls, and the primary action usable.

## Required Tests

- [ ] Existing configuration, voice, pronunciation, workflow, concurrency, and
      authorization tests remain passing.
- [ ] Configuration form Playwright test covering validation and persistence.
- [ ] Voice preview and selection interaction tests.
- [ ] Keyboard tests for radio groups, segmented choices, and repeatable fields.
- [ ] Stale and conflict-state browser tests.
- [ ] Desktop, tablet, mobile, and 200 percent zoom screenshots.
- [ ] Affected web lint, typecheck, test, and build commands.

## Out of Scope

- New configuration choices, languages, themes, voices, or arbitrary duration.
- Audio generation or caption generation.
- Changing dependency invalidation rules.

## Story-Specific Notes

- Technical guide references: E6, E14, dependency invalidation 6.3, and
  schema-driven forms 11.3.

## Implementation Checklist

- [ ] Inspect the current repository and related completed stories.
- [ ] Write a short implementation plan listing files, contracts, tests, and
      risks.
- [ ] Implement only this story's scope.
- [ ] Preserve form names, enum values, revision handling, and workflow guards.
- [ ] Run required automated and visual tests.
- [ ] Self-review field contrast, error association, audio control, and mobile
      summary behavior.
- [ ] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [ ] Every acceptance criterion is implemented and verified.
- [ ] Every required test is implemented and passing.
- [ ] `lint`, `typecheck`, `test`, and `build` pass for affected workspaces.
- [ ] No validation, configuration, audio-preview, or concurrency regression
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
