---
story_id: ST-059
title: "Generate Limited Scene Illustrations with Review and Cost Controls"
phase: "05 \u2014 Storyboard Editing, Assets, and Versions"
status: Done
priority: must-have
epics: ["E13", "E21"]
prd_user_stories: ["E13-US3", "E21-US2"]
depends_on: ["ST-043", "ST-057", "ST-058"]
---

# ST-059 — Generate Limited Scene Illustrations with Review and Cost Controls

## Story

As a teacher, I want a simple supporting illustration generated only when no approved asset is suitable.

## Outcome

An explicit asynchronous action creates a moderated, project-private AI asset candidate that can be accepted, rejected, or regenerated.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E13-US3, E21-US2
- `docs/reference/epic-technical-implementation-guide.md` — E13, E21 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-043
- ST-057
- ST-058

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create image-generation provider interface and at least one adapter or test implementation.
- [ ] Define approved use cases, prompt template, size/style constraints, and moderation checks.
- [ ] Create generation job and project asset candidate records.
- [ ] Bind generation request to one scene and asset slot.
- [ ] Store generated media privately with AI-generated provenance.
- [ ] Implement accept, reject, and bounded regenerate actions.
- [ ] Record provider units/cost and enforce per-user/project regeneration limits.
- [ ] Ensure generation failure does not block other editing.

## Technical Implementation Requirements

- The MVP supports limited simple illustrations, not unrestricted generative video or arbitrary media creation.
- Paid generation requires explicit user action.
- Prompts should use minimal source content and avoid including unnecessary document text.
- Generated assets must pass moderation and technical validation before preview.
- Rejected candidates remain auditable according to retention policy but are not active assets.

## Contracts and Persistence

- Illustration generation request/result.
- AI asset provenance/moderation status.
- Regeneration quota.

## Interfaces

- `POST /projects/:id/scenes/:sceneId/assets/:slot/generate`.
- Accept/reject/regenerate endpoints.
- Candidate review UI.

## Acceptance Criteria

- [ ] A permitted request creates a reviewable candidate associated with the scene slot.
- [ ] The teacher can accept, reject, or regenerate within limits.
- [ ] AI-generated provenance is visible.
- [ ] Moderation/technical failures never create an active binding.
- [ ] Cost and usage records are stored.

## Required Tests

- [ ] Provider adapter tests.
- [ ] Moderation and validation tests.
- [ ] Quota/idempotency tests.
- [ ] Accept/reject state tests.
- [ ] Failure-nonblocking test.
- [ ] UI candidate workflow test.

## Out of Scope

- Photorealistic video generation.
- Character animation.
- Unlimited regeneration.

## Story-Specific Notes

- Technical guide references: E13 and E21.

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

- **Agent:** Codex
- **Started:** 2026-08-23
- **Completed:** 2026-08-23
- **Branch/PR:** `story/st-057` (existing worktree branch)
- **Files changed:** API generation/review endpoints, storyboard acceptance, worker handler, web candidate panel, shared schemas, provider contract/mock, configuration, database schema/migration, and focused tests.
- **Migrations:** `0044_tidy_skrulls.sql` adds immutable illustration-candidate records; forward-only migration, with no rollback because generated candidates are additive.
- **Contracts changed:** versioned illustration generation request/job/candidate decision contracts; `sceneRevision` added to storyboard scene detail; private review-preview endpoint use.
- **Commands/tests run:** API, worker, web, schemas, config, and provider-adapter focused typecheck/lint/test commands; API and worker builds; `git diff --check`.
- **Screenshots or representative output:** Candidate panel renders explicit Generate, AI-generated provenance, review preview, Accept, and Reject actions.
- **Decisions and assumptions:** A project-private candidate remains inactive until moderation passes and the teacher accepts it atomically with its storyboard binding. `MAX_REGENERATIONS_PER_HOUR` defaults to 10 and applies per owner/project.
- **Deviations from story/technical guide:** None.
- **Known risks or follow-up:** Production image provider adapter credentials remain deployment configuration; the included provider is a bounded mock/test adapter.
