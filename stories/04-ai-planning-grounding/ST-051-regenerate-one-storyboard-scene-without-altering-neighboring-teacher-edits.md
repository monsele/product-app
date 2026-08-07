---
story_id: ST-051
title: "Regenerate One Storyboard Scene Without Altering Neighboring Teacher Edits"
phase: "04 \u2014 AI Planning and Grounding"
status: Ready
priority: must-have
epics: ["E10"]
prd_user_stories: ["E10-US2"]
depends_on: ["ST-050", "ST-049"]
---

# ST-051 — Regenerate One Storyboard Scene Without Altering Neighboring Teacher Edits

## Story

As a teacher, I want to regenerate one weak scene while preserving every other scene.

## Outcome

A scene-level generation action uses local context, supported templates, source evidence, and optimistic concurrency to create a replacement candidate.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E10-US2
- `docs/reference/epic-technical-implementation-guide.md` — E10 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-050
- ST-049

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Define scene regeneration request options such as improve visual choice, simplify, shorten, or regenerate.
- [ ] Build context from the selected scene, neighboring scenes, objective/outline links, narration, and relevant source package.
- [ ] Generate and validate one SceneSpec only.
- [ ] Resolve citations and generated additions.
- [ ] Create a candidate replacement with before/after comparison.
- [ ] Apply the replacement atomically if the storyboard revision has not changed.
- [ ] Invalidate only that scene's dependent preview/assets/audio when narration or bindings change.

## Technical Implementation Requirements

- Other scenes must remain byte-equivalent except for lesson-level revision/hash metadata.
- The model cannot return a full LessonSpec for this operation.
- Existing teacher edits are never overwritten silently.
- Use scene and storyboard revision in the idempotency/input version.
- Neighbor context is read-only.

## Contracts and Persistence

- Scene regeneration job.
- Scene candidate/replacement command.
- Scene diff metadata.

## Interfaces

- `POST /projects/:id/scenes/:sceneId/regenerate`.
- `POST /projects/:id/scenes/:sceneId/apply-candidate`.
- Scene comparison UI.

## Acceptance Criteria

- [ ] Only the selected scene changes after applying a candidate.
- [ ] The candidate validates against a supported template schema.
- [ ] Neighbor context improves continuity without being modified.
- [ ] A stale storyboard revision blocks candidate application.
- [ ] Citations and dependent stale markers update correctly.

## Required Tests

- [ ] Scene isolation test.
- [ ] Stale apply test.
- [ ] Schema/citation tests.
- [ ] Dependency invalidation test.
- [ ] Job/idempotency test.
- [ ] UI comparison test.

## Out of Scope

- Multi-scene regeneration.
- Automatic application without teacher review.

## Story-Specific Notes

- Technical guide references: E10 and E12.

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
