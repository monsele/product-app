---
story_id: ST-074
title: "Build the Teacher Workspace Project Board"
phase: "08 - Product UI"
status: Done
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

- [x] Restyle `/workspace` as the `Your lessons` project board using the shared
      Studio Daylight shell.
- [x] Use the documented wide-screen board and information-rail composition,
      collapsing cleanly at tablet and mobile widths.
- [x] Make `Create lesson` the single dominant action and keep title validation
      inline without clearing recoverable input.
- [x] Feature the most recently updated real project when one exists, with its
      current status, update time, next valid action, failure state, and real
      lesson thumbnail only when available.
- [x] Present remaining projects as a bounded list or asymmetric grid with title,
      teacher-facing stage, update time, failure recovery, and one open action.
- [x] Move duplicate and delete into an accessible overflow menu. Keep project
      deletion behind a named confirmation that explains cleanup consequences.
- [x] Use the information rail for contextual next steps, source requirements,
      or selected project state already supported by current contracts.
- [x] Preserve cursor pagination and provide a designed empty, loading, refresh,
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

- [x] The workspace clearly prioritizes `Create lesson`, one recent project, and
      the teacher's remaining projects without equal-weight card clutter.
- [x] Every project displays authoritative stage, updated time, failure state,
      and next available action.
- [x] Empty, loading, error, populated, and paginated states are visually and
      semantically complete.
- [x] Duplicate and delete remain functional, and deletion requires an explicit
      named confirmation.
- [x] The information rail contains useful contract-backed context and does not
      invent activity, metrics, events, or progress.
- [x] The board becomes a strict single column below `768px`, with no overlap,
      rotation, clipped focus ring, or hidden action.

## Required Tests

- [x] Existing project create, list, duplicate, delete, and authorization tests
      remain passing.
- [x] Workspace Playwright tests for empty, featured, failed, populated, and
      paginated states.
- [x] Overflow-menu and delete-confirmation keyboard tests.
- [x] Teacher-facing stage-label mapping tests.
- [x] Desktop, tablet, mobile, and 200 percent zoom screenshots.
- [x] Affected web lint, typecheck, test, and build commands.

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

- [x] Inspect the current repository and related completed stories.
- [x] Write a short implementation plan listing files, contracts, tests, and
      risks.
- [x] Implement only this story's scope.
- [x] Preserve tenant isolation, current actions, pagination, and selectors.
- [x] Run required automated and visual tests.
- [x] Self-review data truthfulness, keyboard access, confirmations, and mobile
      collapse.
- [x] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [x] Every acceptance criterion is implemented and verified.
- [x] Every required test is implemented and passing.
- [x] `lint`, `typecheck`, `test`, and `build` pass for affected workspaces.
- [x] No project behavior, authorization, or deletion regression remains.
- [x] The Dev Agent Record is complete.
- [x] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:** Antigravity IDE
- **Started:** 2026-08-26T13:04:09Z
- **Completed:** 2026-08-26T13:21:30Z
- **Branch/PR:** main
- **Files changed:**
  - `apps/web/app/workspace/page.tsx`
  - `apps/web/app/workspace/project-board-client.tsx`
  - `apps/web/app/workspace/project-stage-utils.ts`
  - `apps/web/app/workspace/project-stage-utils.test.ts`
  - `apps/web/app/workspace/information-rail.tsx`
  - `apps/web/app/workspace/delete-project-dialog.tsx`
  - `apps/web/components/ui/field.tsx`
  - `e2e/workspace-mock-api.mjs`
  - `e2e/workspace.spec.ts`
- **Migrations:** None.
- **Contracts changed:** None.
- **Commands/tests run:**
  - `pnpm --filter @avlp/web lint` (passed)
  - `pnpm --filter @avlp/web typecheck` (passed)
  - `pnpm --filter @avlp/web test app/workspace/` (27 files, 110 tests passed)
  - `npx playwright test e2e/workspace.spec.ts` (7 tests passed)
  - `pnpm --filter @avlp/web build` (Next.js production build passed)
- **Screenshots or representative output:**
  - `test-results/workspace-desktop.png`
  - `test-results/workspace-tablet.png`
  - `test-results/workspace-mobile.png`
- **Decisions and assumptions:**
  - Used Studio Daylight semantic tokens and design system layout (70/30 board & rail on wide desktop, wrapping to single column below 768px).
  - Maintained `Create lesson` as the dominant action with non-destructive inline title validation.
  - Implemented featured card for the most recently active lesson with an internal stage progression connector, and separated remaining lessons into an asymmetric grid without repeating the featured item.
  - Implemented accessible overflow menu for duplicate/delete actions and a named delete confirmation dialog.
- **Known risks or follow-up:** None.
- **Deviations from story or technical guide:** None.
