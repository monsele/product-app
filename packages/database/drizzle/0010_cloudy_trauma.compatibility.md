# 0010 cloudy trauma compatibility notes

This forward-only migration adds project-deletion scheduling metadata and audit
event values for project duplication and deletion. Existing projects remain
active because `cleanup_after` is nullable.

Deploy this migration before API instances that use the project duplicate or
delete endpoints. Rollback is operational: stop those instances and leave the
additive schema changes in place.
