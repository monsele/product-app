---
story_id: ST-066
title: "Implement the Deterministic Lesson Quality Validation Engine"
phase: "06 \u2014 Audio, Validation, Rendering, and Delivery"
status: Done
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

- **Agent:** Codex
- **Started:** 2026-08-25
- **Completed:** 2026-08-25
- **Branch/PR:** `story/st-066` (local; ready for review)
- **Files changed:** `packages/schemas/src/index.ts`, `packages/database/src/schema.ts`, `packages/database/drizzle/0052_validation_runs.sql`, `packages/database/drizzle/meta/_journal.json`, `apps/api/src/lesson-validation.ts`, `apps/api/src/lesson-validation.test.ts`, `apps/api/src/app.ts`, `apps/api/src/runtime.ts`, `apps/api/src/caption-export.ts`, `apps/api/package.json`, and `pnpm-lock.yaml`.
- **Migrations:** `0052_validation_runs.sql` adds version-bound validation runs and deep-linkable validation issues, including tenant-scoped indexes and warning-acknowledgement fields.
- **Contracts changed:** Added versioned validation run, issue, severity, scope, status, issue-code, and explicit-run input schemas. Added `POST /projects/:projectId/validation-runs` and `GET /projects/:projectId/validation-runs/latest`.
- **Commands/tests run:** `pnpm --filter @avlp/api test` (passed); `pnpm --filter @avlp/api test -- lesson-validation.test.ts` (12 passed); `pnpm --filter @avlp/{api,schemas,database} typecheck` (passed); `pnpm --filter @avlp/{api,schemas,database} build` (passed); `pnpm --filter @avlp/{schemas,database} test` (passed; database integration tests skipped without a database); `pnpm --filter @avlp/api lint` and `git diff --check` (passed).
- **Screenshots or representative output:** Five-scene valid fixture has no blocking issues; missing media and objective coverage fixture returns exact paths such as `scenes.2.audio` and `objectiveIds`.
- **Decisions and assumptions:** Reused the pinned scene-library validator for template/schema/text/layout/frame-safety checks. A run is cached by a canonical hash of lesson content, ruleset, scene-library version, derived media, and current source-grounding state. Grounding rechecks are a designated acknowledgeable warning; missing citations, assets, media, invalid schema, and timing are always blocking.
- **Deviations from story/technical guide:** Used the guide's `validation-runs` endpoint name. Teacher issue-resolution UI, warning-acknowledgement endpoint, render-readiness endpoint, and final render command remain intentionally out of scope for later stories.
- **Known risks or follow-up:** Database integration tests remain skipped without a configured database. The migration journal now records the existing `0050`/`0051` audio/caption migrations before `0052`; applying this branch to a database that was advanced manually outside Drizzle requires the standard migration-history reconciliation procedure.
