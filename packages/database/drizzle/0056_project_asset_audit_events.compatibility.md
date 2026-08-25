# 0056 project asset audit events compatibility

This additive migration registers the audit event values already emitted when a teacher requests validation of a replacement asset or tombstones one for retained cleanup.

- Existing audit rows and consumers remain compatible.
- Deploy the migration before API instances that emit these event values.
- Rollback requires first removing rows with these values and rebuilding the PostgreSQL enum; enum-value removal is intentionally not automated.
