---
story_id: ST-002
title: "Define Shared Identifiers, Configuration, and API Error Contracts"
phase: "00 \u2014 Foundation"
status: Ready
priority: must-have
epics: ["E21"]
prd_user_stories: ["E21-US1", "E21-US3"]
depends_on: ["ST-001"]
---

# ST-002 — Define Shared Identifiers, Configuration, and API Error Contracts

## Story

As a developer, I need common boundary contracts so services return predictable identifiers, timestamps, configuration errors, and API failures.

## Outcome

All TypeScript applications use one package for IDs, time conventions, environment parsing, and public error envelopes.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E21-US1, E21-US3
- `docs/reference/epic-technical-implementation-guide.md` — E21 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-001

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Implement UUID generation and validation using sortable globally unique identifiers.
- [ ] Define UTC timestamp serialization rules.
- [ ] Define stable lowercase enums and shared pagination primitives.
- [ ] Implement the API error envelope and error-code registry.
- [ ] Implement request correlation-ID extraction/generation.
- [ ] Create validated server configuration schemas.
- [ ] Create safe public error mapping that strips stack traces and provider payloads.

## Technical Implementation Requirements

- Use `createdAt`, `updatedAt`, and `revision` conventions in application DTOs; map database column naming consistently.
- Public IDs must never be sequential database IDs.
- Unknown internal errors map to a generic retryable or non-retryable code plus correlation ID.
- Do not expose secrets, signed URLs, SQL errors, or third-party raw payloads.
- Provide helpers usable by NestJS API filters and worker error classifiers.

## Contracts and Persistence

- `ApiErrorEnvelope`.
- `FieldErrorMap`.
- `CursorPage<T>`.
- `CorrelationContext`.
- Environment schemas for API, web, workers, storage, Redis, and database.

## Interfaces

- Global API exception filter.
- Correlation middleware.
- Configuration loader imported by each application.

## Acceptance Criteria

- [ ] Every API error matches the documented envelope.
- [ ] Invalid environment values stop startup with actionable messages.
- [ ] Correlation IDs are returned to clients and available to logs.
- [ ] No internal stack trace appears in production-formatted responses.

## Required Tests

- [ ] Schema unit tests.
- [ ] Exception mapping tests.
- [ ] Correlation propagation integration test.
- [ ] Configuration failure tests.

## Out of Scope

- Domain-specific error codes beyond examples needed by the package.
- Logging backend configuration.

## Story-Specific Notes

- Technical guide references: sections 4.1, 4.5, 6.1, and 13.

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
