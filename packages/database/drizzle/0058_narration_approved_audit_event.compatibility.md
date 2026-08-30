# 0058 narration approved audit event compatibility

This additive migration registers the audit event value `narration.approved` emitted when a teacher approves the current draft narration set, promoting it to the approved set that storyboard generation and lesson versioning bind to.

- Existing audit rows and consumers remain compatible.
- Deploy the migration before API instances that emit this event value.
- Rollback requires first removing rows with this value and rebuilding the PostgreSQL enum; enum-value removal is intentionally not automated.
