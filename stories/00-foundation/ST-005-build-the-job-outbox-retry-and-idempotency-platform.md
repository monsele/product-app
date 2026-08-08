---
story_id: ST-005
title: "Build the Job, Outbox, Retry, and Idempotency Platform"
phase: "00 \u2014 Foundation"
status: Done
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

- [x] Create `jobs` and `outbox_events` tables.
- [x] Define the versioned `JobEnvelope<T>` contract.
- [x] Implement queue registration and typed job producers/consumers.
- [x] Implement an outbox dispatcher.
- [x] Implement idempotency-key creation and uniqueness enforcement.
- [x] Implement job state transitions: queued, running, retry_wait, succeeded, failed, cancelled.
- [x] Implement heartbeat/lease updates and a stale-job reaper.
- [x] Implement classified retryable and terminal errors.

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

- [x] Creating the same costly command with the same idempotency key produces one logical job.
- [x] A database commit cannot lose the corresponding queue request.
- [x] Expired running leases can be requeued safely.
- [x] Terminal errors are not retried indefinitely.
- [x] A duplicated queue delivery does not duplicate side effects.

## Required Tests

- [x] Idempotency race test.
- [x] Outbox dispatch/recovery test.
- [x] Duplicate delivery contract test.
- [x] Heartbeat and stale lease test.
- [x] Retry classification test.

## Out of Scope

- Specific ingestion, AI, TTS, and render handlers.
- User-facing job progress screens.

## Story-Specific Notes

- Technical guide references: architecture principles 2.4 and 2.5, sections 4.4, 5.2, 6.1, and 10.1.

## Implementation Checklist

- [x] Inspect the current repository and related completed stories.
- [x] Write a short implementation plan listing files, contracts, migrations, tests, and risks.
- [x] Implement only this story's scope.
- [x] Add or update schemas before changing consumers.
- [x] Add authorization, validation, error, retry, concurrency, and idempotency behavior where applicable.
- [x] Add structured logs, correlation, audit, and usage records where applicable.
- [x] Run the required automated tests and affected workspace quality commands.
- [x] Self-review the diff for scope creep, insecure access, stale data races, and unbounded provider calls.
- [x] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [x] Every acceptance criterion is implemented and verified.
- [x] Every required test is implemented and passing.
- [x] `lint`, `typecheck`, `test`, and `build` pass for all affected workspaces.
- [x] Database migrations and compatibility notes are complete where applicable.
- [x] Public schemas, events, and endpoints are documented.
- [x] No unresolved tenant-isolation, security, idempotency, concurrency, data-loss, or cost-control defect remains in this scope.
- [x] No out-of-scope feature or unrelated refactor was added.
- [x] The Dev Agent Record is complete.
- [x] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:** Codex
- **Started:** 2026-08-08
- **Completed:** 2026-08-08
- **Branch/PR:** `story/st-005-job-platform`; no PR created.
- **Files changed:** `packages/jobs/` contracts, idempotency, repository, dispatcher, BullMQ adapter, worker runtime, tests, package metadata, and README; `packages/database/src/schema.ts`; migration SQL, Drizzle journal/snapshot, compatibility notes, and `MIGRATIONS.md`; `pnpm-lock.yaml`; this story and `STORY_INDEX.md`.
- **Migrations:** Added `0001_woozy_stranger.sql`, creating `job_state` and `job_error_classification` enums plus `jobs` and `outbox_events` with idempotency, lease, pending-dispatch, and project-history indexes. The additive deployment/rollback strategy is in `0001_woozy_stranger.compatibility.md`.
- **Contracts changed:** Added version 1 `JobEnvelope<T>`, `JobState`, `JobErrorClassification`, bounded queue names, safe result/error metadata, retry/delivery policies, deterministic idempotency keys, typed handler registration, publisher/dispatcher interfaces, internal job queries, and administrative retry/cancel abstractions. No HTTP endpoint was added.
- **Commands/tests run:** `pnpm install`; `pnpm --filter @avlp/database db:generate`; repeated `pnpm --filter @avlp/jobs lint`, `typecheck`, and `test`; PostgreSQL-backed job tests on disposable Postgres (16/16); `pnpm lint`; `pnpm typecheck`; `pnpm test`; `pnpm build`; final `pnpm run ci` passed after review remediation. `pnpm ci` was also attempted but pnpm has no built-in `ci` command; the repository script requires `pnpm run ci`.
- **Screenshots or representative output:** Job suite: 6 files and 16 tests passed with PostgreSQL, including an eight-command idempotency race, stale-lease recovery, stale-worker fencing, retry-delay enforcement, authoritative payload use, and tenant-envelope mismatch rejection. Final repository CI: 12/12 lint, typecheck, and build tasks passed; 15/15 test tasks passed (unconfigured pre-existing integration suites remain conditionally skipped in the aggregate run).
- **Decisions and assumptions:** PostgreSQL remains authoritative and job creation writes its outbox event in one transaction. Outbox event IDs are BullMQ delivery IDs for publish idempotency. Workers claim state before side effects; validate queue, identity, job type, and payload version against PostgreSQL; consume canonical payload and tenant context from the claimed row; and fence heartbeat/completion/failure updates by attempt. Retry-wait claims enforce availability time. Handlers are registered by job type plus payload version and must propagate the logical idempotency key to downstream side-effect boundaries. Project job history requires both owner and project identifiers. Observability/audit/usage persistence is deferred to dependent ST-006; no paid provider is called here.
- **Deviations from story/technical guide:** None. Per repository workflow, implementation-complete stories move to **In Review**; only a human reviewer marks the remaining Done checkbox and transitions the story to Done.
- **Known risks or follow-up:** Specific ingestion, AI, TTS, and render handlers must make their own external side-effect boundaries idempotent using the supplied key. ST-006 must attach structured events, metrics, audit records, and usage/cost metering to these lifecycle hooks. The post-remediation code-review pass found no remaining defect in ST-005 scope.
