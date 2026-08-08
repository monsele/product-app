# Observability baseline

`@avlp/observability` owns correlation helpers, redacted structured logging,
OpenTelemetry startup, bounded job metrics, audit persistence, usage metering,
and tenant-scoped investigation queries.

Set `OTEL_EXPORTER_OTLP_ENDPOINT` to the base URL of an OTLP/HTTP collector to
enable trace and metric export. With no endpoint, exporters are disabled and
product operations continue normally.

API and worker entry points start telemetry before dynamically importing their
application runtimes so supported libraries are instrumented during module
initialization. Trace data is sanitized again at the exporter boundary,
including span names, attributes, events, links, status messages, and resource
attributes. Structured-log and telemetry sink failures are diagnostic only and
must not change API, dispatcher, or worker outcomes.

Job metric labels accept only the handler registry's bounded job types; unknown
or invalid values are exported as `unknown`. Stable identifiers remain in
redacted logs and traces, never in metric dimensions.

## Investigation runbook

Application code should call `investigateCorrelation(database, { ownerUserId,
projectId, correlationId })`. Every lookup requires both owner and project IDs;
never query a project correlation globally in a user-facing path. Results are
limited to 100 rows per record type and deliberately omit job payloads, input
versions, and job/usage idempotency keys.

Usage idempotency keys are unique within an owner/project boundary. Replays in
that boundary must match the complete immutable measurement; another tenant
may safely use the same caller-provided key.

For direct database investigation, bind all three values rather than placing
private content in logs:

```sql
select id, job_type, state, attempts, started_at, completed_at,
       error_classification
from jobs
where owner_user_id = $1 and project_id = $2 and correlation_id = $3;

select event_type, actor_type, actor_user_id, target_type, target_id, occurred_at
from audit_events
where owner_user_id = $1 and project_id = $2 and correlation_id = $3;

select operation_type, provider, model, quantity, estimated_cost_usd, status,
       occurred_at
from usage_records
where owner_user_id = $1 and project_id = $2 and correlation_id = $3;
```

Do not select payload, source text, prompts, provider payloads, credentials, or
signed URLs during routine support. Correlation IDs, stable entity IDs, bounded
status fields, and error classifications are the normal investigation surface.
