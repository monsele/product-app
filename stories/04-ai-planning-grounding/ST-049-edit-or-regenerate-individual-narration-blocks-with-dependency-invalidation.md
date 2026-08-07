---
story_id: ST-049
title: "Edit or Regenerate Individual Narration Blocks with Dependency Invalidation"
phase: "04 \u2014 AI Planning and Grounding"
status: Ready
priority: must-have
epics: ["E9", "E14", "E15", "E16", "E17", "E20"]
prd_user_stories: ["E9-US2"]
depends_on: ["ST-048"]
---

# ST-049 — Edit or Regenerate Individual Narration Blocks with Dependency Invalidation

## Story

As a teacher, I want to directly edit or shorten, simplify, expand, or regenerate one narration block without changing the rest of the lesson.

## Outcome

Block-level editing preserves unaffected content and marks only dependent audio, captions, previews, validation, and renders stale.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E9-US2
- `docs/reference/epic-technical-implementation-guide.md` — E9, E14, E15, E16, E17, E20 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-048

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Implement direct narration block editing with revision control.
- [ ] Implement shorten, simplify, expand, and regenerate-one-block generation actions.
- [ ] Provide neighboring outline/narration context and bounded source package to regeneration.
- [ ] Re-resolve citations and generated additions for regenerated content.
- [ ] Implement dependency invalidation events and stale markers.
- [ ] Preserve all other narration blocks and teacher edits.
- [ ] Provide UI save, generation, conflict, stale, and restore/candidate states.

## Technical Implementation Requirements

- Direct teacher edits retain existing citations unless removed, but grounding recheck can flag unsupported edits.
- Paid regeneration requires explicit action and idempotency.
- Changing narration invalidates that scene/block audio, captions, preview cache, validation hash, and not-yet-started renders.
- Do not automatically regenerate dependent artifacts.
- Approved snapshots remain immutable.

## Contracts and Persistence

- Narration update command.
- Partial generation job.
- Artifact dependency/staleness record or derived hash policy.

## Interfaces

- Block edit endpoint.
- `POST /projects/:id/narration-blocks/:blockId/regenerate` with mode.
- Narration block editor controls.

## Acceptance Criteria

- [ ] Editing one block leaves all other blocks unchanged.
- [ ] Each regeneration mode produces a candidate for only the selected block.
- [ ] Citations are retained or recalculated according to edit type.
- [ ] Only dependent artifacts become stale.
- [ ] Concurrent edits and duplicate regeneration commands are handled safely.

## Required Tests

- [ ] Block isolation test.
- [ ] Mode prompt fixture tests.
- [ ] Dependency invalidation tests.
- [ ] Citation retention/recalculation tests.
- [ ] Idempotency/concurrency tests.
- [ ] Editor Playwright test.

## Out of Scope

- Whole-narration automatic regeneration.
- TTS generation.
- Full version restore.

## Story-Specific Notes

- Technical guide references: E9 and dependency invalidation section 6.3.

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
