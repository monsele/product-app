# 0012 neat cleanup compatibility notes

This forward-only migration adds the nullable project cleanup completion
timestamp. It lets the retained project tombstone distinguish a scheduled
cleanup from one that has completed without deleting audit or billing records.

Deploy this migration before pipeline workers that execute `project.cleanup`
jobs. Rollback is operational: stop those workers and retain the additive
column.
