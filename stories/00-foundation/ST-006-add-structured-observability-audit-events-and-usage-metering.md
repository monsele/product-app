---
story_id: ST-006
title: "Add Structured Observability, Audit Events, and Usage Metering"
phase: "00 \u2014 Foundation"
status: Done
priority: must-have
epics: ["E21"]
prd_user_stories: ["E21-US1", "E21-US2", "E21-US3"]
depends_on: ["ST-002", "ST-003", "ST-005"]
---

# ST-006 — Add Structured Observability, Audit Events, and Usage Metering

## Story

As the product team, we need correlated logs, metrics, audit events, and usage records so failures and costs can be investigated without exposing user secrets.

## Outcome

HTTP requests and jobs share correlation context; sensitive actions and provider usage are stored in queryable records.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E21-US1, E21-US2, E21-US3
- `docs/reference/epic-technical-implementation-guide.md` — E21 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-002
- ST-003
- ST-005

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [x] Configure structured logging and OpenTelemetry instrumentation for API and workers.
- [x] Create `audit_events` and `usage_records` tables.
- [x] Define a safe audit-event writer and usage-meter interface.
- [x] Propagate correlation IDs from request to outbox, queue, worker, and provider adapter.
- [x] Record job duration, retries, status, and error classification metrics.
- [x] Add redaction rules for tokens, signed URLs, document text, passwords, and provider payloads.
- [x] Create basic internal queries or runbook commands for project/job investigation.

## Technical Implementation Requirements

- Audit authentication-sensitive operations, uploads/deletes/shares, approvals, AI generations, version restores, renders, and administrative retries.
- Usage records must support operation type, provider/model, units/tokens, estimated cost, project, user, and correlation ID.
- Logs should reference source/document IDs rather than dumping source text.
- Metrics must have bounded labels to avoid cardinality explosions.

## Contracts and Persistence

- `AuditEventType`.
- `UsageOperationType`.
- `UsageMeter` interface.
- Correlation propagation headers/job fields.

## Interfaces

- Internal job/audit lookup functions.
- Health and telemetry exporters.
- No dedicated admin UI required.

## Acceptance Criteria

- [x] A request that creates a job can be traced across API, database, queue, and worker logs.
- [x] Audit records contain actor, action, target, timestamp, and correlation ID.
- [x] Usage records can aggregate by project/user/operation.
- [x] Sensitive values are redacted from logs and traces.

## Required Tests

- [x] Correlation end-to-end test.
- [x] Audit event persistence test.
- [x] Usage aggregation test.
- [x] Sensitive-data redaction test.

## Out of Scope

- Full monitoring dashboards.
- Alert-provider selection.
- Final quota policies, which are completed in ST-071.

## Story-Specific Notes

- Technical guide references: sections 6.4, E21, and 9.1.

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

- **Agent:** Codex (GPT-5)
- **Started:** 2026-08-08
- **Completed:** 2026-08-08
- **Branch/PR:** Existing local branch `story/st-005-job-platform`; no branch switch or PR because completed ST-005 changes were still uncommitted and had to be preserved.
- **Files changed:** `apps/api` early telemetry startup, injectable test-route configuration, safe request logging, and a persisted API-to-worker correlation test; `apps/pipeline-worker` early telemetry startup, long-lived outbox dispatcher/BullMQ consumer runtime, lifecycle handling, and integration test; `packages/database` schema, journal, migration snapshots, SQL, and compatibility notes; `packages/jobs` worker/outbox telemetry, audited administrative retry and cancellation, tests, package metadata, and documentation; new `packages/observability` contracts, exporter-boundary redaction, non-blocking logging, bounded metrics, correlation, telemetry, repositories, tests, and runbook; workspace lockfile; story/index records.
- **Migrations:** `0002_graceful_scorpion` creates `audit_events`, `usage_records`, bounded enums, and investigation indexes. `0003_light_loki` forward-adds/backfills the required usage idempotency key. `0004_talented_blockbuster` adds the `job.admin_cancelled` audit-event type. Review remediation migration `0005_smooth_flatman` replaces global job/usage idempotency indexes with owner/project-scoped unique indexes. Each has compatibility notes; `drizzle-kit generate` reports no schema drift.
- **Contracts changed:** Added `AuditEventType`, `UsageOperationType`, `UsageMeter`, safe metadata and writer schemas, correlation header/context helpers, `JobTelemetry`, `OutboxTelemetry`, OTLP lifecycle configuration, tenant-scoped audit/usage/investigation functions, and tenant/actor/correlation inputs for `retryFailedJob` and `cancelJob`. Job claims and reads now require `ProjectJobIdentity`; idempotent job replays validate all immutable execution inputs; usage numeric boundaries match PostgreSQL; investigation results are bounded and exclude payload/input/idempotency fields. Added the `@avlp/observability/telemetry` startup subpath so SDK registration precedes application imports.
- **Commands/tests run:** `pnpm install`; repeated `pnpm --filter @avlp/database db:generate` checks (no drift after `0005`); affected-package typechecks, unit tests, and builds; isolated PostgreSQL runs with `@avlp/database` 9/9, `@avlp/jobs` 21/21, `@avlp/observability` 9/9, `@avlp/api` 5/5, and `@avlp/pipeline-worker` 1/1 passing (45 total); final `pnpm run ci` passed lint, typecheck, test, and build across all 12 workspaces; `pnpm format:check` and `git diff --check` passed.
- **Screenshots or representative output:** The integration path creates a job through an injected API route, persists its correlation ID, dispatches the real outbox record, executes the real worker delivery, and asserts correlated API, queue, job-start, and job-completion events plus a succeeded database row. Exporter tests prove sensitive span names, attributes, events, links, status messages, and resource attributes are redacted. No UI screenshot applies.
- **Decisions and assumptions:** PostgreSQL remains authoritative; Redis/BullMQ transports deliveries. API and worker modules load only after OpenTelemetry registration, and worker handlers enter the shared correlation context. Logs, metrics, and telemetry sinks are diagnostic and non-blocking even when redaction or a sink fails. Prompt content is redacted while prompt template IDs/versions remain auditable. Job and usage idempotency are tenant-scoped; same-tenant replays must match their complete immutable inputs. Worker claims, reads, admin retry/cancel, aggregates, and investigations all include the appropriate owner/project boundary. Metric job types are allowlisted from the handler registry, with arbitrary values mapped to `unknown`. No paid provider adapter exists yet, so the metering interface is ready without adding a fictitious call path.
- **Deviations from story/technical guide:** None requiring an ADR. Human review approved the story on 2026-08-08, so the story and index are `Done`. Forward migrations were retained instead of rewriting generated history. The end-to-end test uses the production publisher/consumer contracts with an in-memory broker boundary because Redis is not installed on this host; the production runtime itself constructs BullMQ/Redis. Final quota policies remain in ST-071 as specified.
- **Known risks or follow-up:** OTLP export sanitization is unit-tested with a real readable span but was not exercised against a live collector. A live Redis broker smoke test remains appropriate in CI or deployment infrastructure. Deploy `0005_smooth_flatman` with job/usage producers paused because old and new writers use different conflict targets. Future event/operation enum additions require forward database migrations. The current worktree still contains preserved, uncommitted ST-005 changes and remains on its ST-005 branch; separating stories requires an explicit commit/branch strategy from the repository owner.
