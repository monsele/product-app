---
story_id: ST-036
title: "Generate Ingestion Quality Reports and Recovery States"
phase: "03 \u2014 Ingestion and Lesson Configuration"
status: Ready
priority: must-have
epics: ["E4", "E21"]
prd_user_stories: ["E4-US4", "E21-US1"]
depends_on: ["ST-006", "ST-033", "ST-034", "ST-035"]
---

# ST-036 — Generate Ingestion Quality Reports and Recovery States

## Story

As a teacher, I want to know whether parsing was trustworthy and what I can do when it was not.

## Outcome

The system computes blocking and non-blocking ingestion findings, exposes status, and supports safe retry with a new parser version or configuration.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E4-US4, E21-US1
- `docs/reference/epic-technical-implementation-guide.md` — E4, E21 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-006
- ST-033
- ST-034
- ST-035

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create ingestion warning/severity categories for OCR quality, reading order, missing captions, malformed tables, unknown blocks, and parser failures.
- [ ] Implement deterministic quality scoring/review-status rules.
- [ ] Persist warnings with section/block/figure/table context.
- [ ] Expose project ingestion status and latest job details.
- [ ] Implement authorized retry using idempotency and explicit input/config version.
- [ ] Preserve previous successful versions when retrying.
- [ ] Create UI status, warning summary, retry, and failure states.

## Technical Implementation Requirements

- Severe failures block lesson generation; warnings may proceed to review.
- Do not collapse the entire project to a generic failed state.
- Retries create a new parsed version rather than mutating a prior one.
- User-facing errors remain actionable and non-technical.
- Record parser cost/timing and retries.

## Contracts and Persistence

- Ingestion quality report.
- Warning severity/status enums.
- Retry command.

## Interfaces

- `GET /projects/:id/ingestion`.
- `POST /projects/:id/ingestion/retry`.
- Ingestion processing/status UI.

## Acceptance Criteria

- [ ] Poor-quality fixtures produce the expected warnings.
- [ ] Blocking findings prevent the next workflow stage.
- [ ] Non-blocking findings lead to ingestion review.
- [ ] A retry preserves prior immutable outputs and creates a new version.
- [ ] Job/status screens recover correctly after refresh.

## Required Tests

- [ ] Quality-rule unit tests.
- [ ] Retry/version integration test.
- [ ] Blocking-stage test.
- [ ] UI polling/error-state test.
- [ ] Cross-user test.

## Out of Scope

- Manual parser configuration UI beyond a simple retry choice.
- Full administrator dashboard.

## Story-Specific Notes

- Technical guide references: E4 and project/job state machines.

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
