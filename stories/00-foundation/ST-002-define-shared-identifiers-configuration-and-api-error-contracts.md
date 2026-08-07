---
story_id: ST-002
title: "Define Shared Identifiers, Configuration, and API Error Contracts"
phase: "00 \u2014 Foundation"
status: Done
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

- **Agent:** Codex
- **Started:** 2026-08-07
- **Completed:** 2026-08-07
- **Branch/PR:** `main` (existing worktree contained unrelated ST-001 review-follow-up changes, so no branch switch was made)
- **Files changed:** `packages/config/src/index.ts`, `packages/config/src/index.test.ts`, `apps/api/src/app.ts`, `apps/api/src/app.test.ts`, `apps/api/src/error-filter.ts`, `apps/api/src/error-filter.test.ts`, `apps/api/src/main.ts`, `apps/web/next.config.ts`, `apps/web/package.json`, `apps/pipeline-worker/src/main.ts`, `apps/pipeline-worker/package.json`, `apps/renderer/src/main.ts`, `apps/renderer/package.json`, `pnpm-lock.yaml`, `STORY_INDEX.md`, and this story record.
- **Migrations:** None.
- **Contracts changed:** UUIDv7 identifiers, UTC timestamp serialization, cursor pagination, lowercase API error envelope/code registry, correlation context, exported database/Redis/storage plus application environment schemas/loaders, safe error mapper, API correlation hook, and global exception filter.
- **Commands/tests run:** `pnpm install`; focused config/API/worker tests and typechecks; `pnpm format:check`; `pnpm run ci` (all passed).
- **Screenshots or representative output:** API integration test confirms `x-correlation-id` is returned unchanged when valid and generated as a UUIDv7 when absent.
- **Decisions and assumptions:** API database and Redis configuration is required at startup. Worker configuration validates supplied database, Redis, and storage values without requiring infrastructure unused by the current health-only workers; ST-004 owns concrete storage-provider requirements. Web configuration is parsed in `next.config.ts`. Correlation logging emits only a stable event and correlation ID; Fastify request URLs and sensitive headers are redacted. Framework 5xx errors use the retryable generic internal-error envelope.
- **Deviations from story/technical guide:** None.
- **Known risks or follow-up:** The NestJS/Fastify dependency tree currently contains two compatible Fastify patch versions; the hook uses inferred framework types to avoid cross-package type incompatibility. Consolidate the version when dependency upgrades are scheduled. Job/queue propagation will be added with ST-005.
