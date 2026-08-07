---
story_id: ST-066
title: "Implement the Deterministic Lesson Quality Validation Engine"
phase: "06 \u2014 Audio, Validation, Rendering, and Delivery"
status: Ready
priority: must-have
epics: ["E16", "E19"]
prd_user_stories: ["E16-US1"]
depends_on:
  [
    "ST-011",
    "ST-045",
    "ST-047",
    "ST-053",
    "ST-057",
    "ST-063",
    "ST-064",
    "ST-060",
  ]
---

# ST-066 — Implement the Deterministic Lesson Quality Validation Engine

## Story

As a teacher, I want broken, incomplete, ungrounded, or over-dense lessons identified before rendering.

## Outcome

A version/hash-bound validation engine produces blocking errors and warnings for objective coverage, templates, text/layout, grounding, duration, assets, audio, captions, and frame safety.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E16-US1
- `docs/reference/epic-technical-implementation-guide.md` — E16, E19 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-011
- ST-045
- ST-047
- ST-053
- ST-057
- ST-063
- ST-064
- ST-060

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Define validation result, issue severity, code, entity path, scene ID, and acknowledgment policy.
- [ ] Implement objective-to-outline/scene coverage checks.
- [ ] Run base LessonSpec and template validators including text/item limits and layout measurement.
- [ ] Check total and per-scene duration plus narration/audio fit.
- [ ] Check required assets and supported bindings.
- [ ] Check grounding statuses, citation resolution, and generated-addition labels.
- [ ] Check current audio and caption presence/timing.
- [ ] Bind the result to exact lesson version/content hash, scene library version, and artifact hashes.
- [ ] Cache and incrementally rerun affected rules when possible.

## Technical Implementation Requirements

- Validation is deterministic for a given input set, except explicitly versioned model-assisted grounding results.
- Blocking issues prevent rendering.
- Warnings are acknowledgeable only when the rule permits.
- A stale validation result cannot authorize a changed lesson.
- The engine produces actionable paths, not generic pass/fail.

## Contracts and Persistence

- Validation result/issue.
- Rule interface and registry.
- Validation input hash.

## Interfaces

- Internal validation service.
- `POST /projects/:id/validation` or automatic explicit run command.
- Read endpoint for latest exact/stale result.

## Acceptance Criteria

- [ ] Each required PRD validation category is represented by at least one rule.
- [ ] Known invalid fixtures produce the expected blocking issues.
- [ ] A valid fixture produces no blocking issues.
- [ ] Changing relevant content makes the prior result stale.
- [ ] Issue paths identify the exact scene/property.

## Required Tests

- [ ] Rule unit tests.
- [ ] Known-pass/known-fail integration fixtures.
- [ ] Validation hash/staleness tests.
- [ ] Incremental affected-rule tests.
- [ ] Performance test at maximum scene count.

## Out of Scope

- Teacher issue-resolution UI.
- Final render command.
- Subjective human pedagogy score as a blocking rule unless approved.

## Story-Specific Notes

- Technical guide references: E16 and final architecture checklist.

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
