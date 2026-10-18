# 0078 - Preparation activity and release metrics

Additive task-state activity and per-draft first-edit/preview milestones. The trigger
stores only identifiers, operation/state, attempts, sanitized failure code and time.
Activity IDs are opaque PostgreSQL-generated UUIDs; public schemas validate UUIDs.
Business entity identifiers retain their UUIDv7 contract.

Activity cascades with recovery tasks/runs and projects. Milestones cascade with
project deletion. Deploy before enabled readiness readers. Rollback readers and
the trigger before dropping the function/tables. No source content or media URLs
are stored in these records.
