---
story_id: ST-074
title: "Build the Teacher Workspace Project Board"
phase: "08 - Product UI"
status: Ready
priority: must-have
epics: ["E2"]
prd_user_stories: ["E2-US1", "E2-US2", "E2-US3", "E2-US4"]
depends_on: ["ST-028", "ST-029", "ST-073"]
---

# ST-074 - Build the Teacher Workspace Project Board

## Story

As a teacher, I want a clear visual board of my lessons so that I can create,
continue, duplicate, or remove a project without hunting through generic cards.

## Outcome

The teacher workspace becomes the reference Studio Daylight dashboard: a calm
project board with one featured record, a contextual information rail, truthful
workflow status, and safe project actions.

## Required Reading

- `AGENTS.md`
- `docs/design.md` sections 6.1-6.4, 8.1-8.7, 10.3, and 11-16
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` E2
- `docs/reference/epic-technical-implementation-guide.md` E2, sections 5.1, 6,
  and 11

## Dependencies

- ST-028
- ST-029
- ST-073

Do not start this story until every dependency is marked **Done** in
`STORY_INDEX.md`.

## Scope

- [ ] Restyle `/workspace` as the `Your lessons` project board using the shared
      Studio Daylight shell.
- [ ] Use the documented wide-screen board and information-rail composition,
      collapsing cleanly at tablet and mobile widths.
- [ ] Make `Create lesson` the single dominant action and keep title validation
      inline without clearing recoverable input.
- [ ] Feature the most recently updated real project when one exists, with its
      current status, update time, next valid action, failure state, and real
      lesson thumbnail only when available.
- [ ] Present remaining projects as a bounded list or asymmetric grid with title,
      teacher-facing stage, update time, failure recovery, and one open action.
- [ ] Move duplicate and delete into an accessible overflow menu. Keep project
      deletion behind a named confirmation that explains cleanup consequences.
- [ ] Use the information rail for contextual next steps, source requirements,
      or selected project state already supported by current contracts.
- [ ] Preserve cursor pagination and provide a designed empty, loading, refresh,
      failure, populated, and pagination-end state.

## Technical Implementation Requirements

- Preserve project creation, listing, duplication, deletion, authorization,
  redirects, idempotency, pagination, and cleanup behavior.
- Do not display aggregate metrics unless an authoritative API value exists.
  Never count one pagination page and present it as a total.
- Project stage labels map from the domain state machine and failures remain a
  separate status.
- Do not duplicate the featured project in the remaining project collection.
- Semantic pastel surfaces indicate real status. Violet remains the only brand
  accent.
- Workflow connectors may show stages within the featured project only. Do not
  connect unrelated project records.
- All overflow and confirmation actions are keyboard accessible and usable
  without hover.

## Contracts and Persistence

- No persistence changes expected.
- No project API changes unless a missing presentation field is proven necessary
  and approved before implementation.

## Interfaces

- `/workspace`
- Existing project create, duplicate, and delete web actions.

## Acceptance Criteria

- [ ] The workspace clearly prioritizes `Create lesson`, one recent project, and
      the teacher's remaining projects without equal-weight card clutter.
- [ ] Every project displays authoritative stage, updated time, failure state,
      and next available action.
- [ ] Empty, loading, error, populated, and paginated states are visually and
      semantically complete.
- [ ] Duplicate and delete remain functional, and deletion requires an explicit
      named confirmation.
- [ ] The information rail contains useful contract-backed context and does not
      invent activity, metrics, events, or progress.
- [ ] The board becomes a strict single column below `768px`, with no overlap,
      rotation, clipped focus ring, or hidden action.

## Required Tests

- [ ] Existing project create, list, duplicate, delete, and authorization tests
      remain passing.
- [ ] Workspace Playwright tests for empty, featured, failed, populated, and
      paginated states.
- [ ] Overflow-menu and delete-confirmation keyboard tests.
- [ ] Teacher-facing stage-label mapping tests.
- [ ] Desktop, tablet, mobile, and 200 percent zoom screenshots.
- [ ] Affected web lint, typecheck, test, and build commands.

## Out of Scope

- Search, filtering, sorting controls, folders, tags, collaboration, or an
  activity feed.
- Invented aggregate metrics or classroom outcomes.
- New project-domain or deletion behavior.

## Story-Specific Notes

- This screen is the reference implementation for the dashboard-inspired
  Project Board and Information Rail pattern in `docs/design.md`.
- Design direction: `DESIGN_VARIANCE 5`, `MOTION_INTENSITY 4`,
  `VISUAL_DENSITY 6`.

## Implementation Checklist

- [ ] Inspect the current repository and related completed stories.
- [ ] Write a short implementation plan listing files, contracts, tests, and
      risks.
- [ ] Implement only this story's scope.
- [ ] Preserve tenant isolation, current actions, pagination, and selectors.
- [ ] Run required automated and visual tests.
- [ ] Self-review data truthfulness, keyboard access, confirmations, and mobile
      collapse.
- [ ] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [ ] Every acceptance criterion is implemented and verified.
- [ ] Every required test is implemented and passing.
- [ ] `lint`, `typecheck`, `test`, and `build` pass for affected workspaces.
- [ ] No project behavior, authorization, or deletion regression remains.
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
