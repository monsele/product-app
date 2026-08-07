---
story_id: ST-023
title: "Assemble a Manual Three-Minute LessonSpec and Full Composition"
phase: "01 \u2014 Visual Runtime Proof"
status: Ready
priority: must-have
epics: ["E10", "E11", "E15"]
prd_user_stories: ["E10-US1", "E15-US2"]
depends_on: ["ST-007", "ST-012", "ST-013", "ST-015", "ST-021", "ST-022"]
---

# ST-023 — Assemble a Manual Three-Minute LessonSpec and Full Composition

## Story

As the product team, we need a hand-authored lesson to prove the schema and visual grammar before relying on AI generation.

## Outcome

A three-minute introductory science lesson fixture assembles multiple scenes into a deterministic full composition with transitions and captions.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E10-US1, E15-US2
- `docs/reference/epic-technical-implementation-guide.md` — E10, E11, E15 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-007
- ST-012
- ST-013
- ST-015
- ST-021
- ST-022

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create a licensed or original five-page-equivalent science fixture and a hand-authored LessonSpec.
- [ ] Use at least hook, definition, input-process-output, and summary templates.
- [ ] Implement scene-to-timeline frame calculation.
- [ ] Implement allowed transitions and caption overlay across the full composition.
- [ ] Create placeholder/local narration audio or deterministic silence tracks.
- [ ] Expose a full composition preview in the development gallery.
- [ ] Record known visual and pedagogical review notes.

## Technical Implementation Requirements

- The full timeline derives from scene duration and 30 fps.
- Scene IDs and source references are stable.
- Do not add AI generation in this story.
- This fixture becomes a regression anchor for later editor, audio, validation, and rendering stories.

## Contracts and Persistence

- Full lesson composition props.
- Timeline segment calculation.
- Fixture manifest.

## Interfaces

- Development full-lesson preview route.
- Composition registered for Remotion rendering.

## Acceptance Criteria

- [ ] The lesson duration is approximately three minutes and matches calculated frames.
- [ ] Scene transitions do not introduce audio/caption drift.
- [ ] The fixture validates against LessonSpec v1.
- [ ] The full lesson can be navigated and previewed locally.

## Required Tests

- [ ] Timeline calculation tests.
- [ ] Full composition frame snapshots.
- [ ] Caption continuity test.
- [ ] Schema and source-reference tests.

## Out of Scope

- Document ingestion.
- AI generation.
- Production editor.

## Story-Specific Notes

- Technical guide delivery sequence requires this manual visual pipeline before autonomous generation.

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
