---
story_id: ST-078
title: "Build Objectives and Outline Review Editors"
phase: "08 - Product UI"
status: Ready
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

- [ ] Build a shared review-editor scaffold for ordered artifacts, source
      context, candidate comparison, save state, and approval action.
- [ ] Restyle objectives as a readable ordered learning plan with add, edit,
      remove, reorder, regenerate, source, grounding, and approval controls.
- [ ] Restyle outline as a vertical lesson arc with title, teaching purpose,
      estimated duration, covered objectives, source links, ordering, candidate,
      and approval controls.
- [ ] Use spacing and sparse dividers for long lists rather than a heavy card
      around every sentence or outline row.
- [ ] Make AI suggestion, teacher edit, teacher-authored unsupported item,
      candidate, draft, approved, and stale states explicit through text and
      structure.
- [ ] Keep current approved or draft content visible while a regeneration
      candidate is requested and until replacement is confirmed.
- [ ] Provide drag-and-drop reorder plus move-up and move-down controls, with
      stable focus after movement.
- [ ] Use a compact source drawer for citations and instructional analysis data
      already exposed by existing contracts.
- [ ] Keep duration totals and current approval state visible without adding a
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

- [ ] Objectives and outline use a coherent shared interaction model while each
      retains its required fields, ordering, duration, and approval behavior.
- [ ] Draft, candidate, approved, stale, teacher-authored, and grounding states
      are explicit and accessible.
- [ ] Regeneration never replaces current content before teacher confirmation.
- [ ] Reordering works by keyboard controls as well as drag and drop, preserves
      IDs, and restores focus to the moved item.
- [ ] Saving, conflict, and approval states match persisted server state and
      survive refresh.
- [ ] Source context remains authorized, relevant, and reachable without
      overwhelming the editing surface.

## Required Tests

- [ ] Existing objective, outline, candidate, ordering, approval, citation,
      version, concurrency, and authorization tests remain passing.
- [ ] Shared scaffold component tests.
- [ ] Objective editor and outline editor Playwright tests.
- [ ] Keyboard reorder and focus-restoration tests.
- [ ] Candidate-versus-current and saved-versus-approved state tests.
- [ ] Desktop, tablet, mobile, and reduced-motion screenshots for both routes.
- [ ] Affected web lint, typecheck, test, and build commands.

## Out of Scope

- New instructional-analysis fields or standards mapping.
- Changes to generation prompts, AI output, approval rules, or version contracts.
- Collaborative editing.

## Story-Specific Notes

- Technical guide references: E7, E8, E19, E20, approval state 5.3, dependency
  invalidation 6.3, and frontend state guidance 11.2.

## Implementation Checklist

- [ ] Inspect the current repository and related completed stories.
- [ ] Write a short implementation plan listing files, contracts, tests, and
      risks.
- [ ] Implement only this story's scope.
- [ ] Preserve IDs, revisions, citations, approval snapshots, and paid-action
      controls.
- [ ] Run required automated and visual tests.
- [ ] Self-review state truthfulness, focus restoration, source authorization,
      and mobile list handling.
- [ ] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [ ] Every acceptance criterion is implemented and verified.
- [ ] Every required test is implemented and passing.
- [ ] `lint`, `typecheck`, `test`, and `build` pass for affected workspaces.
- [ ] No approval, candidate, citation, version, or concurrency regression
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
- **Contracts changed:** Internal review-editor contracts only.
- **Commands/tests run:**
- **Screenshots or representative output:**
- **Decisions and assumptions:**
- **Known risks or follow-up:**
- **Deviations from story or technical guide:**
