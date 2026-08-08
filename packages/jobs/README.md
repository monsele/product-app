# `@avlp/jobs`

`@avlp/jobs` is the shared asynchronous-work boundary. PostgreSQL is authoritative; BullMQ/Redis only transports deliveries.

## Contracts

- `JobEnvelope<T>` is versioned by `schemaVersion` and `payloadVersion` and carries job, project, owner, input-version, idempotency, and correlation identifiers. Consumers register handlers by both job type and payload version.
- `JobState` follows `queued → running → succeeded`, with `retry_wait`, `failed`, and `cancelled` terminal/recovery branches.
- `JobExecutionError` declares `retryable`, `terminal`, or `cancelled` failures. Unknown errors are stored as a redacted retryable error and never persist the original provider payload or stack.
- Queue names are the bounded `ingestion`, `pipeline`, `media`, and `render` set. Worker processes register a job-type handler map for their queue.

Create costly-operation keys with `createIdempotencyKey`. It hashes canonicalized options and returns:

```text
{jobType}:{projectId}:{inputVersion}:{optionsHash}
```

## Transaction and dispatch flow

`PostgresJobRepository.createJob` atomically inserts one `jobs` row and one `outbox_events` row. The owner/project-scoped unique idempotency index makes concurrent duplicate commands return the same logical job without allowing a caller-provided key to collide across tenants. A replay must match the original immutable queue, job, input, payload, and retry fields. Callers can map `created: true` to `202 Accepted`; repeated calls return the existing job without adding another initial outbox event.

Run `OutboxDispatcher` through `runOutboxDispatcher` in a long-lived worker. Events are claimed with `FOR UPDATE SKIP LOCKED`, published with the outbox event ID as BullMQ's delivery ID, and marked dispatched only after publication succeeds. An expired dispatcher claim can be recovered by another process.

Use `defineJobHandler` and `registerJobConsumer` to validate each job type and payload version before invoking side effects. The worker tenant-filters the atomic PostgreSQL claim by job, owner, and project IDs, verifies the remaining delivery identity and queue against that authoritative row, reads payload and tenant context from PostgreSQL, renews an attempt-fenced lease, skips duplicate deliveries, records safe result/error metadata, and throws only a redacted retry signal to BullMQ. Handlers must pass the provided idempotency key to any downstream side-effect boundary.

`requeueStaleJobs` creates a fresh outbox event for an expired running lease while respecting `maxAttempts`. `retryFailedJob` and `cancelJob` are internal administrative command abstractions that require target owner/project, actor, and correlation context; they tenant-filter the state change and write its audit event in the same transaction. Authentication belongs to later account stories.

## Database integration tests

The PostgreSQL race and lease tests create and destroy an isolated database when `TEST_DATABASE_URL` is set to an administrative PostgreSQL URL:

```powershell
$env:TEST_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/postgres"
pnpm --filter @avlp/jobs test
```

Do not point this variable at a database containing application data.
