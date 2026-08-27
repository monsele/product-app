# 0057 voice configuration audit event compatibility

This additive migration registers the audit event value `voice.configuration_saved` emitted when a teacher configures or updates the voice settings (voice ID, speaking rate, pronunciation overrides) for a project.

- Existing audit rows and consumers remain compatible.
- Deploy the migration before API instances that emit this event value.
- Rollback requires first removing rows with this value and rebuilding the PostgreSQL enum; enum-value removal is intentionally not automated.
