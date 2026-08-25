# 0011 long shaman compatibility notes

This forward-only migration adds project-clone idempotency records. The unique
owner/source/idempotency-key index ensures a retried clone command returns the
original independent draft rather than creating another project.

Deploy this migration before API instances that accept project clone requests.
Rollback is operational: stop those instances and retain the additive table.
