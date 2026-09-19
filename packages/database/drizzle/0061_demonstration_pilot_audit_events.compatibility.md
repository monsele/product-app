# 0061 demonstration pilot audit events compatibility

Registers the audit event values emitted by ST-096's demonstration pilot: `demonstration.comparison_created`, `demonstration.variant_requested`, `demonstration.variant_retried`, `demonstration.feedback_saved`, and `demonstration.test_lesson_created`.

- Existing audit rows and consumers remain compatible; the values are additive.
- Deploy this migration before API instances that emit these values.
- Rollback requires first removing rows with these values and rebuilding the PostgreSQL enum; enum-value removal is intentionally not automated.
