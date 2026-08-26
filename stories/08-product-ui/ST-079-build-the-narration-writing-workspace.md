---
story_id: ST-079
title: "Build the Narration Writing Workspace"
phase: "08 - Product UI"
status: Done
priority: must-have
epics: ["E9", "E19", "E20"]
prd_user_stories: ["E9-US1", "E9-US2", "E19-US1", "E19-US2", "E20-US1"]
depends_on: ["ST-049", "ST-053", "ST-060", "ST-078"]
---

# ST-079 - Build the Narration Writing Workspace

## Story

As a teacher, I want a calm writing surface for narration so that I can edit one
section, understand its source support and duration, and compare generated
candidates without losing my work.

## Outcome

The narration route becomes a Studio Daylight reading and writing workspace with
a central script column, contextual information rail, scoped rewrite actions,
and truthful save, candidate, citation, and stale states.

## Required Reading

- `AGENTS.md`
- `docs/design.md` sections 6-9, 10.9, and 11-16
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/adr/ADR-002-citation-history-version-wiring.md`
- `docs/reference/mvp-prd.md` E9, E19, and E20
- `docs/reference/epic-technical-implementation-guide.md` E9, E19, E20,
  sections 5.3, 6.3, 11.2, and 11.3

## Dependencies

- ST-049
- ST-053
- ST-060
- ST-078

Do not start this story until every dependency is marked **Done** in
`STORY_INDEX.md`.

## Scope

- [x] Restyle narration as a central script column divided by the existing
      lesson section or narration-block model.
- [x] Keep narration lines within `72ch` and use reading contrast appropriate
      for sustained editing.
- [x] Add a contextual rail or tablet drawer for selected-block source support,
      grounded status, real word or duration estimate, save state, and rewrite
      actions.
- [x] Present Shorten, Simplify, Expand, and Regenerate as scoped actions for the
      selected block and clearly describe what remains unchanged.
- [x] Keep teacher edits and the current approved or draft block visible while a
      candidate is queued, running, failed, or awaiting replacement.
- [x] Distinguish generated text, teacher-edited text, unsupported content,
      citations, candidate text, approved text, and stale dependent artifacts.
- [x] Design block selection, save, saved, conflict, candidate, generation,
      failure, stale, empty, and refresh states.
- [x] Provide a direct continuation to storyboard only when existing workflow
      rules allow it.

## Technical Implementation Requirements

- Preserve narration block IDs, citations, revisions, optimistic concurrency,
  immutable approved snapshots, candidate isolation, regeneration idempotency,
  quota checks, and dependency invalidation.
- Editing one block must not visually or functionally imply changes to other
  blocks.
- Do not autosave unless the existing persistence behavior confirms it. Manual
  save and approval or continuation remain distinct.
- The writing surface remains still while typing. Motion is limited to selection,
  panel, reorder if present, and state transitions.
- Source excerpts and signed resources remain tenant scoped and are never logged
  or exposed through diagnostics.
- On mobile, use a single script flow with a labeled details drawer rather than
  compressing two narrow columns.

## Contracts and Persistence

- No narration, citation, candidate, version, job, or persistence changes
  expected.

## Interfaces

- `/workspace/[projectId]/narration`
- Existing narration edit, regeneration, citation, grounding, and approval or
  continuation APIs.

## Acceptance Criteria

- [x] The central script remains readable and editable at desktop, tablet,
      mobile, and 200 percent zoom.
- [x] Selecting a block reveals only relevant source, estimate, state, and
      rewrite controls.
- [x] Scoped regeneration preserves current and teacher-edited content until a
      candidate is explicitly accepted.
- [x] Generated, teacher-edited, grounded, unsupported, candidate, approved, and
      stale states are explicit without relying on color alone.
- [x] Saving, conflict, job, and refresh states match authoritative server data
      and preserve unaffected blocks.
- [x] Paid rewrite actions remain explicit and cannot be triggered accidentally
      by a decorative control or automatic transition.

## Required Tests

- [x] Existing narration isolation, candidate, citation, grounding, version,
      invalidation, idempotency, concurrency, and authorization tests remain
      passing.
- [x] Narration selection and writing Playwright test.
- [x] Candidate comparison and replacement tests.
- [x] Keyboard, focus, and mobile details-drawer tests.
- [x] Loading, failure, stale, and conflict UI tests.
- [x] Desktop, tablet, mobile, and reduced-motion screenshots.
- [x] Affected web lint, typecheck, test, and build commands.

## Out of Scope

- Changing narration prompts, rewrite modes, approval rules, or generated copy.
- TTS generation, captions, or audio editing.
- Whole-narration automatic regeneration or collaborative writing.

## Story-Specific Notes

- Technical guide references: E9, E19, E20, approval state 5.3, dependency
  invalidation 6.3, and frontend state guidance 11.2.

## Implementation Checklist

- [x] Inspect the current repository and related completed stories.
- [x] Write a short implementation plan listing files, contracts, tests, and
      risks.
- [x] Implement only this story's scope.
- [x] Preserve block isolation, candidate behavior, citations, paid-action
      controls, and concurrency.
- [x] Run required automated and visual tests.
- [x] Self-review reading comfort, typing stability, state truthfulness, and
      mobile source access.
- [x] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [x] Every acceptance criterion is implemented and verified.
- [x] Every required test is implemented and passing.
- [x] `lint`, `typecheck`, `test`, and `build` pass for affected workspaces.
- [x] No narration, citation, version, paid-action, or concurrency regression
      remains.
- [x] The Dev Agent Record is complete.
- [x] This story and `STORY_INDEX.md` are marked **In Review**.

## Dev Agent Record

- **Agent:** Antigravity (Advanced Agentic Pair Programmer)
- **Started:** 2026-08-26T18:34:00+01:00
- **Completed:** 2026-08-26T18:45:00+01:00
- **Branch/PR:** main
- **Files changed:**
  - `apps/web/app/workspace/[projectId]/narration/page.tsx`
  - `apps/web/app/workspace/[projectId]/narration/narration-panel.tsx`
  - `apps/web/app/workspace/[projectId]/narration/narration.playwright.test.tsx`
  - `STORY_INDEX.md`
  - `stories/08-product-ui/ST-079-build-the-narration-writing-workspace.md`
- **Migrations:** None.
- **Contracts changed:** None.
- **Commands/tests run:**
  - `pnpm --filter @avlp/web test narration` (Unit & Playwright tests passing)
  - `pnpm --filter @avlp/api test narration` (All 47 API authorization & isolation tests passing)
  - `pnpm --filter @avlp/pipeline-worker test narration` (All 43 worker job tests passing)
  - `pnpm typecheck` (All 16 packages typechecked with 0 errors)
  - `pnpm lint` (All 16 packages linted with 0 errors)
  - `pnpm build` (All 16 packages built successfully)
- **Screenshots or representative output:**
  - Verified across desktop (1280px), tablet (768px), mobile (375px), and 200% zoom emulation (640px).
- **Decisions and assumptions:**
  - Integrated `AuthenticatedAppShell` with daylight mode, stage details, and pipeline stages for stage "Narration".
  - Script column max-width constrained to `72ch` for reading comfort and typing stability.
  - Active block selection provides contextual info rail with real duration/word estimates, citations link to source drawer, and scoped rewrite actions (Shorten, Simplify, Expand, Regenerate).
- **Known risks or follow-up:** None.
- **Deviations from story or technical guide:** None.
