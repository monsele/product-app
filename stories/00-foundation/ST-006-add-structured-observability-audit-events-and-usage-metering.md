---
story_id: ST-006
title: "Add Structured Observability, Audit Events, and Usage Metering"
phase: "00 \u2014 Foundation"
status: Ready
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

- [ ] Configure structured logging and OpenTelemetry instrumentation for API and workers.
- [ ] Create `audit_events` and `usage_records` tables.
- [ ] Define a safe audit-event writer and usage-meter interface.
- [ ] Propagate correlation IDs from request to outbox, queue, worker, and provider adapter.
- [ ] Record job duration, retries, status, and error classification metrics.
- [ ] Add redaction rules for tokens, signed URLs, document text, passwords, and provider payloads.
- [ ] Create basic internal queries or runbook commands for project/job investigation.

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

- [ ] A request that creates a job can be traced across API, database, queue, and worker logs.
- [ ] Audit records contain actor, action, target, timestamp, and correlation ID.
- [ ] Usage records can aggregate by project/user/operation.
- [ ] Sensitive values are redacted from logs and traces.

## Required Tests

- [ ] Correlation end-to-end test.
- [ ] Audit event persistence test.
- [ ] Usage aggregation test.
- [ ] Sensitive-data redaction test.

## Out of Scope

- Full monitoring dashboards.
- Alert-provider selection.
- Final quota policies, which are completed in ST-071.

## Story-Specific Notes

- Technical guide references: sections 6.4, E21, and 9.1.

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
