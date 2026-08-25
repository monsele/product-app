# Runbook: stuck jobs

## Detect

Alert when a queued or running job exceeds its operation-specific age threshold or stops updating its heartbeat. Start with the correlation ID, job ID, project ID, operation, attempt count, and timestamps. Do not place source text or provider payloads in the incident channel.

## Triage

1. Confirm database, Redis, worker, and object-storage health.
2. Locate the job by correlation ID and inspect status, attempt, lease/heartbeat, idempotency key, provider request ID, and sanitized error code.
3. Check whether a newer successful job already produced the same content hash.
4. Determine whether the job is waiting on a provider, has lost its worker lease, or is blocked by quota.

## Recover

- If an identical artifact already exists, reconcile the job to that artifact without issuing a provider call.
- If the lease is stale and no active worker owns it, use the audited admin retry action.
- Retry only the failed stage or scene. Do not regenerate unaffected stages.
- Cancel only when output is no longer wanted or correctness cannot be established.

## Verify

Confirm exactly one terminal artifact, preserved metering, an audit event for the admin action, and a visible teacher status. Escalate repeated occurrences with job type, sanitized failure class, provider, and deployment version.
