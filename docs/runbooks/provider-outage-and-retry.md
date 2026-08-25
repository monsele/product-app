# Runbook: provider outage and retry

## Detect and contain

Use provider error rate, latency, circuit-breaker state, and queued-job age. Pause new paid calls for the affected operation when failure is systemic; keep review, editing, cached preview, export, and unrelated providers available.

## Retry policy

1. Retry only retryable network, timeout, rate-limit, and provider 5xx failures.
2. Use exponential backoff with jitter and the same idempotency key.
3. Respect provider retry-after guidance and project/provider quota checks.
4. Do not automatically retry validation, policy, malformed-output, or unsupported-input failures beyond the bounded repair path.
5. Record every billable attempt and reconcile ambiguous provider outcomes before another call.

## Teacher communication

Show the affected stage, preserve accepted work, and offer retry when safe. Never expose raw provider responses, secrets, or internal prompts.

## Recovery verification

Process a provider-free fixture first, then one canary paid request. Confirm one artifact per content hash, correct usage totals, queue drain, and normal failure rates before resuming full traffic.
