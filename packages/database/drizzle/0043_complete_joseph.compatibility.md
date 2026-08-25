# 0043 complete joseph compatibility

This additive migration records the retention deadline and completed-cleanup
marker for soft-deleted project-private assets. Existing active assets remain
unchanged because both columns are nullable. Deploy before API instances that
schedule `project-asset.cleanup` jobs and pipeline workers that execute them.
