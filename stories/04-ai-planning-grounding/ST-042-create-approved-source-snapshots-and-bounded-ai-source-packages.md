---
story_id: ST-042
title: "Create Approved Source Snapshots and Bounded AI Source Packages"
phase: "04 \u2014 AI Planning and Grounding"
status: Ready
priority: must-have
epics: ["E5", "E7", "E8", "E9", "E10", "E19", "E20"]
prd_user_stories: ["E5-US2", "E5-US3", "E7-US1", "E19-US1", "E20-US1"]
depends_on: ["ST-038", "ST-039", "ST-040", "ST-041", "ST-008"]
---

# ST-042 — Create Approved Source Snapshots and Bounded AI Source Packages

## Story

As the AI pipeline, I need an immutable approved source snapshot so every generation can be reproduced and cited against exactly what the teacher confirmed.

## Outcome

Confirming ingestion review creates a versioned source snapshot and reusable bounded source-package builder with stable block, page, section, figure, and table IDs.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E5-US2, E5-US3, E7-US1, E19-US1, E20-US1
- `docs/reference/epic-technical-implementation-guide.md` — E5, E7, E8, E9, E10, E19, E20 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-038
- ST-039
- ST-040
- ST-041
- ST-008

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create source snapshot persistence containing parsed document version, section overlays, block corrections, figure selections, and content hash.
- [ ] Implement confirm-source-review command and approval state.
- [ ] Build deterministic source packages from effective selected content.
- [ ] Support package narrowing by section/objective/outline links while retaining stable IDs.
- [ ] Store snapshot JSON in object storage or JSONB with queryable metadata.
- [ ] Prevent later overlay edits from mutating the approved snapshot.
- [ ] Expose source-block lookup for citation resolution.

## Technical Implementation Requirements

- A snapshot is immutable and versioned.
- Generation jobs reference a snapshot ID and content hash.
- For a maximum 20-page document, use hierarchy-aware selection; embeddings are optional and not proof of support.
- Source packages include explicit machine-readable boundaries.
- A later source correction creates a new draft/snapshot path rather than changing existing generated versions.

## Contracts and Persistence

- Approved source snapshot.
- Source package.
- Source lookup/resolver.
- Source approval state.

## Interfaces

- `POST /projects/:id/source-review/approve`.
- `GET /projects/:id/source-snapshots/:snapshotId` metadata.
- Pipeline package-builder interface.

## Acceptance Criteria

- [ ] Approval captures exactly the effective reviewed source.
- [ ] Changing overlays after approval does not alter the snapshot hash/content.
- [ ] Every packaged block includes stable provenance.
- [ ] The same snapshot and selection parameters produce the same source package.
- [ ] Generation cannot start from an unapproved source draft.

## Required Tests

- [ ] Snapshot immutability test.
- [ ] Deterministic hash/package test.
- [ ] Correction-after-approval test.
- [ ] Source lookup test.
- [ ] Authorization test.

## Out of Scope

- Embedding index implementation unless needed by a later ADR.
- AI generation itself.

## Story-Specific Notes

- Technical guide references: principles 2.2 and 2.3, sections 9.3 and 9.4.

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
