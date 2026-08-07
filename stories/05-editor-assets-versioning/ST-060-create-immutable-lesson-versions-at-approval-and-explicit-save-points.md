---
story_id: ST-060
title: "Create Immutable Lesson Versions at Approval and Explicit Save Points"
phase: "05 \u2014 Storyboard Editing, Assets, and Versions"
status: Ready
priority: must-have
epics: ["E20"]
prd_user_stories: ["E20-US1"]
depends_on: ["ST-007", "ST-045", "ST-047", "ST-049", "ST-050", "ST-056"]
---

# ST-060 — Create Immutable Lesson Versions at Approval and Explicit Save Points

## Story

As a teacher, I want major lesson states saved so a render or later restoration always refers to exact approved content.

## Outcome

Version creation snapshots approved objectives, outline, narration, storyboard/LessonSpec, citations, configuration, and source snapshot into an immutable record.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E20-US1
- `docs/reference/epic-technical-implementation-guide.md` — E20 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-007
- ST-045
- ST-047
- ST-049
- ST-050
- ST-056

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create lesson and lesson-version persistence with version number, creator, reason, timestamps, schema/library/prompt versions, content hash, and snapshot object.
- [ ] Implement milestone and explicit save-version commands.
- [ ] Snapshot approved planning data and current storyboard according to defined readiness rules.
- [ ] Store portable LessonSpec JSON and queryable metadata.
- [ ] Ensure render requests can reference one immutable lesson version.
- [ ] Display latest modification/version metadata.

## Technical Implementation Requirements

- Old versions are read-only.
- Creating a version does not mutate current drafts.
- Version content includes citations and generated additions.
- Use deterministic canonical serialization for content hashes.
- Do not duplicate large media binaries; reference immutable object IDs/hashes.

## Contracts and Persistence

- Lesson entity/current pointer.
- Lesson version entity/snapshot.
- Version reason enum.

## Interfaces

- `POST /projects/:id/versions`.
- `GET /projects/:id/versions` summary.
- Save-version action and latest modification display.

## Acceptance Criteria

- [ ] A version captures the exact configured/approved lesson state.
- [ ] The same snapshot content has a deterministic hash.
- [ ] Older versions cannot be edited.
- [ ] Renders can later point to a version ID.
- [ ] Creating a version preserves current draft work.

## Required Tests

- [ ] Snapshot completeness tests.
- [ ] Immutability tests.
- [ ] Canonical hash tests.
- [ ] Media reference tests.
- [ ] Authorization/concurrency tests.

## Out of Scope

- Version restoration UI.
- Automatic version on every keystroke.
- Binary media duplication.

## Story-Specific Notes

- Technical guide references: E20 and immutable outputs principle.

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
