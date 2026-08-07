---
story_id: ST-053
title: "Recheck Grounding After Teacher Edits and Preserve Citation History"
phase: "04 \u2014 AI Planning and Grounding"
status: Ready
priority: must-have
epics: ["E19", "E20"]
prd_user_stories: ["E19-US2"]
depends_on: ["ST-049", "ST-051", "ST-052", "ST-043"]
---

# ST-053 — Recheck Grounding After Teacher Edits and Preserve Citation History

## Story

As a teacher, I want citation accuracy checked after edits while preserving the history of what supported earlier versions.

## Outcome

A grounding recheck classifies edited claims as supported, unsupported, generated addition, or needs review and stores results with the lesson revision.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E19-US2
- `docs/reference/epic-technical-implementation-guide.md` — E19, E20 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-049
- ST-051
- ST-052
- ST-043

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Define grounding-check input/output schema and prompt/rule version.
- [ ] Segment edited narration/on-screen claims into bounded claim units.
- [ ] Use existing source refs first, then approved-snapshot candidate retrieval.
- [ ] Run deterministic source-ID validation and optional model-assisted entailment classification.
- [ ] Allow teacher edits to retain citations but flag unsupported changed claims.
- [ ] Persist grounding results by content hash and lesson revision.
- [ ] Display grounding status and correction actions.
- [ ] Preserve citation/grounding history in versions.

## Technical Implementation Requirements

- Retrieval candidates are not proof; the checker must classify support.
- Model-assisted checks are advisory/validation and are recorded with provider metadata.
- Teacher-added analogy/example can be labelled generated rather than falsely cited.
- Do not mutate older version citations.
- Blocking policy is enforced later by quality validation.

## Contracts and Persistence

- Grounding result/claim.
- Grounding status enum.
- Citation history snapshot.

## Interfaces

- `POST /projects/:id/scenes/:sceneId/grounding-check` or background trigger.
- Grounding status UI.

## Acceptance Criteria

- [ ] Unchanged cited content retains valid references.
- [ ] Edited unsupported claims are flagged.
- [ ] Generated additions can be explicitly labelled.
- [ ] Grounding results are tied to exact content and source snapshot hashes.
- [ ] Older versions retain their original citation history.

## Required Tests

- [ ] Claim segmentation tests.
- [ ] Deterministic source validation tests.
- [ ] Mock entailment classification tests.
- [ ] Content-hash cache test.
- [ ] Version-history preservation test.
- [ ] UI status test.

## Out of Scope

- Guaranteeing truth beyond the uploaded source.
- Web research or external fact checking.

## Story-Specific Notes

- Technical guide references: E19 and AI pipeline standard.

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
