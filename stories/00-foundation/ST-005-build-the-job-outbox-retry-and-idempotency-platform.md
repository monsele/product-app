---
story_id: ST-005
title: "Build the Job, Outbox, Retry, and Idempotency Platform"
phase: "00 \u2014 Foundation"
status: Ready
priority: must-have
epics: ["E21"]
prd_user_stories: ["E21-US1", "E21-US2"]
depends_on: ["ST-001", "ST-002", "ST-003"]
---

# ST-005 — Build the Job, Outbox, Retry, and Idempotency Platform

## Story

As the system, I need reliable asynchronous job orchestration so ingestion, generation, audio, and rendering are resumable and not executed in HTTP handlers.

## Outcome

The API can atomically record a requested operation, dispatch it through BullMQ, and track retries, leases, results, and idempotency.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E21-US1, E21-US2
- `docs/reference/epic-technical-implementation-guide.md` — E21 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-001
- ST-002
- ST-003

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create `jobs` and `outbox_events` tables.
- [ ] Define the versioned `JobEnvelope<T>` contract.
- [ ] Implement queue registration and typed job producers/consumers.
- [ ] Implement an outbox dispatcher.
- [ ] Implement idempotency-key creation and uniqueness enforcement.
- [ ] Implement job state transitions: queued, running, retry_wait, succeeded, failed, cancelled.
- [ ] Implement heartbeat/lease updates and a stale-job reaper.
- [ ] Implement classified retryable and terminal errors.

## Technical Implementation Requirements

- Recommended key: `{jobType}:{projectId}:{inputVersion}:{optionsHash}`.
- HTTP commands enqueue through an outbox transaction and return `202 Accepted`.
- PostgreSQL is the source of truth for job state; Redis is not.
- Workers must be safe when the same message is delivered more than once.
- Store attempts, start/end time, heartbeat, correlation ID, input version, and structured result/error metadata.

## Contracts and Persistence

- `JobEnvelope<T>`.
- `JobState`.
- `JobErrorClassification`.
- Outbox event schema.
- Typed queue names and payload versioning.

## Interfaces

- Internal job query repository.
- Outbox dispatcher process.
- Worker base handler.
- Administrative retry command abstraction; UI is deferred.

## Acceptance Criteria

- [ ] Creating the same costly command with the same idempotency key produces one logical job.
- [ ] A database commit cannot lose the corresponding queue request.
- [ ] Expired running leases can be requeued safely.
- [ ] Terminal errors are not retried indefinitely.
- [ ] A duplicated queue delivery does not duplicate side effects.

## Required Tests

- [ ] Idempotency race test.
- [ ] Outbox dispatch/recovery test.
- [ ] Duplicate delivery contract test.
- [ ] Heartbeat and stale lease test.
- [ ] Retry classification test.

## Out of Scope

- Specific ingestion, AI, TTS, and render handlers.
- User-facing job progress screens.

## Story-Specific Notes

- Technical guide references: architecture principles 2.4 and 2.5, sections 4.4, 5.2, 6.1, and 10.1.

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
