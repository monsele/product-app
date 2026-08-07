---
story_id: ST-054
title: "Build Storyboard Scene List, Selection, and Navigation"
phase: "05 \u2014 Storyboard Editing, Assets, and Versions"
status: Ready
priority: must-have
epics: ["E12"]
prd_user_stories: ["E12-US1"]
depends_on: ["ST-050", "ST-022", "ST-052"]
---

# ST-054 — Build Storyboard Scene List, Selection, and Navigation

## Story

As a teacher, I want to see all scenes in order, understand their status, and move quickly between editing and preview.

## Outcome

The storyboard workspace displays a scalable ordered scene list with template, narration summary, duration, citations, validation/stale status, and persistent selection.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E12-US1
- `docs/reference/epic-technical-implementation-guide.md` — E12 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-050
- ST-022
- ST-052

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create storyboard read model optimized for list and selected-scene detail.
- [ ] Build virtualized or otherwise bounded scene list if needed.
- [ ] Display scene number, template, narration summary, duration, asset/audio/validation/stale status.
- [ ] Persist selected scene in route or local state through saves and refreshes.
- [ ] Connect selected scene to preview and citation panels.
- [ ] Provide keyboard navigation and empty/error states.
- [ ] Avoid mounting all Remotion players at once.

## Technical Implementation Requirements

- The UI reads authoritative persisted state from the API.
- Query keys include project and storyboard revision.
- Status must not rely on color alone.
- Large storyboards remain usable within configured maximum scene count.
- No scene mutations are added in this story.

## Contracts and Persistence

- Storyboard list/detail DTOs.
- Scene status projection.

## Interfaces

- `GET /projects/:id/storyboard/scenes` or equivalent.
- Storyboard editor route shell.
- Selected-scene panel integration.

## Acceptance Criteria

- [ ] Scenes appear in persisted order with correct metadata.
- [ ] Selection survives saving/refetching and can be deep linked.
- [ ] Only the selected scene preview is mounted.
- [ ] Keyboard navigation works.
- [ ] Stale/invalid states are visible and accessible.

## Required Tests

- [ ] Read-model tests.
- [ ] Query cache/revision tests.
- [ ] Selection persistence Playwright test.
- [ ] Keyboard accessibility test.
- [ ] Performance test with maximum scene count.

## Out of Scope

- Reorder or CRUD.
- Scene field editing.
- Asset selection.

## Story-Specific Notes

- Technical guide references: E12 and frontend sections 11.1–11.2.

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
