---
story_id: ST-038
title: "Let Teachers Rename, Include, Exclude, and Reorder Source Sections"
phase: "03 \u2014 Ingestion and Lesson Configuration"
status: Ready
priority: must-have
epics: ["E5"]
prd_user_stories: ["E5-US2"]
depends_on: ["ST-037", "ST-003"]
---

# ST-038 — Let Teachers Rename, Include, Exclude, and Reorder Source Sections

## Story

As a teacher, I want to exclude references, exercises, or sidebars and correct section labels so AI uses only relevant material.

## Outcome

Project-specific section-selection overlays preserve parser truth while creating an editable source configuration.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E5-US2
- `docs/reference/epic-technical-implementation-guide.md` — E5 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-037
- ST-003

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create project source-section overlay records for included status, display heading, and optional review order.
- [ ] Implement include/exclude, rename, and restore-original operations with optimistic concurrency.
- [ ] Enforce that at least one usable section remains selected.
- [ ] Display clear excluded state and reversible actions.
- [ ] Ensure downstream source-package queries use overlays rather than raw sections.
- [ ] Audit source selection confirmation.

## Technical Implementation Requirements

- Do not mutate normalized parser section headings or hierarchy.
- Section selection is project/version specific.
- Excluded sections are omitted from generation prompts and retrieval.
- Renaming changes teacher-facing/generated context but preserves original text for audit.
- An approved source snapshot later freezes these decisions.

## Contracts and Persistence

- Source section overlay entity.
- Selection revision.
- Effective section projection.

## Interfaces

- `PATCH /projects/:id/source-sections/:sectionId`.
- Bulk selection endpoint if required.
- Review UI controls.

## Acceptance Criteria

- [ ] Teachers can rename and include/exclude sections.
- [ ] At least one section must remain included.
- [ ] Restoring returns the original heading/status.
- [ ] Effective source queries reflect the overlays.
- [ ] Concurrent stale edits are rejected with a conflict state.

## Required Tests

- [ ] Overlay domain tests.
- [ ] At-least-one validation test.
- [ ] Optimistic concurrency API test.
- [ ] Effective projection test.
- [ ] UI include/exclude/restore test.

## Out of Scope

- Editing paragraph text.
- Changing parser hierarchy levels.
- Multiple source documents.

## Story-Specific Notes

- Technical guide references: E5 and immutable overlay principle 2.3.

## Implementation Checklist

- [ ] Inspect the current repository and related completed stories.
- [ ] Write a short implementation plan listing files, contracts, migrations, tests, and risks.
- [ ] Implement only this story's scope.
- [ ] Add or update schemas before changing consumers.
- [ ] Add authorization, validation, error, retry, concurrency, and idempotency behavior where applicable.
- [ ] Add structured logs, correlation, audit, and usage records where applicable.
- [ ] Run the required automated tests and affected workspace quality commands.
- [ ] Self-review the diff for scope creep, insecure access, stale data races, and unbounded provider calls.
- [ ] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [ ] Every acceptance criterion is implemented and verified.
- [ ] Every required test is implemented and passing.
- [ ] `lint`, `typecheck`, `test`, and `build` pass for all affected workspaces.
- [ ] Database migrations and compatibility notes are complete where applicable.
- [ ] Public schemas, events, and endpoints are documented.
- [ ] No unresolved tenant-isolation, security, idempotency, concurrency, data-loss, or cost-control defect remains in this scope.
- [ ] No out-of-scope feature or unrelated refactor was added.
- [ ] The Dev Agent Record is complete.
- [ ] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:**
- **Started:**
- **Completed:**
- **Branch/PR:**
- **Files changed:**
- **Migrations:**
- **Contracts changed:**
- **Commands/tests run:**
- **Screenshots or representative output:**
- **Decisions and assumptions:**
- **Deviations from story/technical guide:**
- **Known risks or follow-up:**
