---
story_id: ST-118
title: Readiness and recovery foundation
status: Done
depends_on: [ST-063, ST-064, ST-066, ST-067, ST-107]
epics: [E14, E15, E16, E21]
---

# ST-118 — Readiness and recovery foundation

## Implementation plan
Add ADR-016, shared boundary contracts, tenant-owned run/task persistence, issue
classification and authenticated read APIs. Keep render authority in validation.
Test classification, stale readiness, API access and migration compatibility.

## Acceptance criteria
- Independent editing, preview and render capabilities.
- Group related audio/caption/timing findings into one task per scene.
- Persist bounded recovery authority and task identity with tenant isolation.
- Additive migration and compatibility notes; existing version contracts unchanged.
- Public read route uses existing project authorization.

## Out of scope
Job execution, UI and generation integration belong to ST-119 through ST-121.

## Dev Agent Record
Completed 2026-10-17 on story/st-118-recovery-foundation.
- Files: recovery schemas, database tables/migration, API readiness service/route/runtime, tests, ADR-016 and product/technical/design guidance.
- Migration: 0074_lesson_recovery (additive); executed twice on disposable Postgres.
- Contracts: additive readiness/task/estimate/authorization schemas and GET readiness.
- Commands: turbo build --filter=@avlp/api... (11 packages passed); targeted ESLint passed; API readiness tests 5 passed; Postgres persistence test passed.
- Output: screenshot's four findings aggregate into one scene task; stale validation retains edit/preview but denies render; foreign and unauthenticated reads rejected.
- Decisions: separate capabilities; durable project allowance and per-input operation identity.
- Risks: worker execution/UI remain explicitly dependent stories; feature flag defaults off.
- Deviations: none within foundation scope.
