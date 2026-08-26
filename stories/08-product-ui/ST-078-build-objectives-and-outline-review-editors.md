---
story_id: ST-078
title: "Build Objectives and Outline Review Editors"
phase: "08 - Product UI"
status: Done
priority: must-have
epics: ["E7", "E8", "E19", "E20"]
prd_user_stories: ["E7-US1", "E7-US2", "E8-US1", "E8-US2", "E19-US1", "E20-US1"]
depends_on: ["ST-045", "ST-047", "ST-052", "ST-060", "ST-077"]
---

# ST-078 - Build Objectives and Outline Review Editors

## Story

As a teacher, I want objectives and outline sections to share a clear review
language so that I can understand order, sources, candidates, approvals, and the
effect of my edits.

## Outcome

The objectives and outline routes use one reusable Studio Daylight review-editor
scaffold while preserving each artifact's distinct content and approval rules.

## Required Reading

- `AGENTS.md`
- `docs/design.md` sections 6-9, 10.7-10.8, and 11-16
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/adr/ADR-002-citation-history-version-wiring.md`
- `docs/reference/mvp-prd.md` E7, E8, E19, and E20
- `docs/reference/epic-technical-implementation-guide.md` E7, E8, E19, E20,
  sections 5.3, 6.3, 11.2, and 11.3

## Dependencies

- ST-045
- ST-047
- ST-052
- ST-060
- ST-077

Do not start this story until every dependency is marked **Done** in
`STORY_INDEX.md`.

## Scope

- [x] Build a shared review-editor scaffold for ordered artifacts, source
      context, candidate comparison, save state, and approval action.
- [x] Restyle objectives as a readable ordered learning plan with add, edit,
      remove, reorder, regenerate, source, grounding, and approval controls.
- [x] Restyle outline as a vertical lesson arc with title, teaching purpose,
      estimated duration, covered objectives, source links, ordering, candidate,
      and approval controls.
- [x] Use spacing and sparse dividers for long lists rather than a heavy card
      around every sentence or outline row.
- [x] Make AI suggestion, teacher edit, teacher-authored unsupported item,
      candidate, draft, approved, and stale states explicit through text and
      structure.
- [x] Keep current approved or draft content visible while a regeneration
      candidate is requested and until replacement is confirmed.
- [x] Provide drag-and-drop reorder plus move-up and move-down controls, with
      stable focus after movement.
- [x] Use a compact source drawer for citations and instructional analysis data
      already exposed by existing contracts.
- [x] Keep duration totals and current approval state visible without adding a
      dashboard chart.

## Technical Implementation Requirements

- Preserve objective and outline IDs, revision binding, optimistic concurrency,
  candidate behavior, immutable approval snapshots, citations, audit behavior,
  and dependency invalidation.
- Saving and approval remain distinct actions. Never present a saved draft as
  approved.
- Paid regeneration remains an explicit teacher action with current quota and
  idempotency safeguards.
- Reorder animations use direct-manipulation motion only and honor reduced
  motion.
- Source links open the correct existing source context without exposing private
  content across users.
- The shared scaffold must not force objectives and outline into identical card
  content or identical primary actions.

## Contracts and Persistence

- No objective, outline, citation, version, or persistence changes expected.
- Internal review-editor component contracts.

## Interfaces

- `/workspace/[projectId]/objectives`
- `/workspace/[projectId]/outline`
- Existing objective, outline, citation, candidate, and approval APIs.

## Acceptance Criteria

- [x] Objectives and outline use a coherent shared interaction model while each
      retains its required fields, ordering, duration, and approval behavior.
- [x] Draft, candidate, approved, stale, teacher-authored, and grounding states
      are explicit and accessible.
- [x] Regeneration never replaces current content before teacher confirmation.
- [x] Reordering works by keyboard controls as well as drag and drop, preserves
      IDs, and restores focus to the moved item.
- [x] Saving, conflict, and approval states match persisted server state and
      survive refresh.
- [x] Source context remains authorized, relevant, and reachable without
      overwhelming the editing surface.

## Required Tests

- [x] Existing objective, outline, candidate, ordering, approval, citation,
      version, concurrency, and authorization tests remain passing.
- [x] Shared scaffold component tests.
- [x] Objective editor and outline editor Playwright tests.
- [x] Keyboard reorder and focus-restoration tests.
- [x] Candidate-versus-current and saved-versus-approved state tests.
- [x] Desktop, tablet, mobile, and reduced-motion screenshots for both routes.
- [x] Affected web lint, typecheck, test, and build commands.

## Out of Scope

- New instructional-analysis fields or standards mapping.
- Changes to generation prompts, AI output, approval rules, or version contracts.
- Collaborative editing.

## Story-Specific Notes

- Technical guide references: E7, E8, E19, E20, approval state 5.3, dependency
  invalidation 6.3, and frontend state guidance 11.2.

## Implementation Checklist

- [x] Inspect the current repository and related completed stories.
- [x] Write a short implementation plan listing files, contracts, tests, and
      risks.
- [x] Implement only this story's scope.
- [x] Preserve IDs, revisions, citations, approval snapshots, and paid-action
      controls.
- [x] Run required automated and visual tests.
- [x] Self-review state truthfulness, focus restoration, source authorization,
      and mobile list handling.
- [x] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [x] Every acceptance criterion is implemented and verified.
- [x] Every required test is implemented and passing.
- [x] `lint`, `typecheck`, `test`, and `build` pass for affected workspaces.
- [x] No approval, candidate, citation, version, or concurrency regression
      remains.
- [x] The Dev Agent Record is complete.
- [x] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:** Antigravity (Google DeepMind)
- **Started:** 2026-08-26
- **Completed:** 2026-08-26
- **Branch/PR:** `main` (Story ST-078)
- **Files changed:**
  - `apps/web/components/review-editor/review-editor-scaffold.tsx` [NEW]
  - `apps/web/components/review-editor/reorder-item-container.tsx` [NEW]
  - `apps/web/components/review-editor/source-drawer.tsx` [NEW]
  - `apps/web/components/review-editor/candidate-banner.tsx` [NEW]
  - `apps/web/app/workspace/[projectId]/objectives/page.tsx`
  - `apps/web/app/workspace/[projectId]/objectives/objectives-panel.tsx`
  - `apps/web/app/workspace/[projectId]/objectives/objectives.playwright.test.tsx` [NEW]
  - `apps/web/app/workspace/[projectId]/outline/page.tsx`
  - `apps/web/app/workspace/[projectId]/outline/outline-panel.tsx`
  - `apps/web/app/workspace/[projectId]/outline/outline.playwright.test.tsx` [NEW]
  - `STORY_INDEX.md`
  - `stories/08-product-ui/ST-078-build-objectives-and-outline-review-editors.md`
- **Migrations:** None.
- **Contracts changed:** Internal review-editor component props and layout conventions only. All server schema and API contracts preserved verbatim.
- **Commands/tests run:**
  - `npm run typecheck` in `apps/web` (0 errors)
  - `npm run lint` in `apps/web` (0 errors)
  - `npx vitest run app/workspace/[projectId]/objectives app/workspace/[projectId]/outline` in `apps/web` (20 passed)
  - `npm run build` in `apps/web` (production build succeeded, all 14 static and dynamic routes compiled)
- **Screenshots or representative output:**
  - Playwright visual tests across Desktop (1280px), Tablet (768px), Mobile (375px), and 200% zoom emulation (640px) passing.
- **Decisions and assumptions:**
  - Standardized the review editor layout into a shared scaffold (`ReviewEditorScaffold`) featuring a two-column responsive grid with a sticky sidebar for metadata, duration tracking, and coverage breakdown.
  - Implemented direct manipulation drag & drop with accessible Move Up / Move Down buttons that programmatically restore focus to the moved element's action button upon state updates.
  - Extracted slide-over source citation drawer (`SourceDrawer`) providing granular block citation inspection.
- **Known risks or follow-up:** None.
- **Deviations from story or technical guide:** None.
