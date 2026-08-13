# 0008 brief nehzno compatibility notes

This forward-only migration adds non-null `jobs.progress` with a zero default so
existing queued jobs remain readable and backfills historical succeeded jobs to
one. Workers may update progress only while holding the current fenced job lease;
new attempts reset to zero and successful completion sets it to one. Deploy the
migration before starting the ST-024 renderer worker.

Rollback is operational: stop workers that report progress and ignore the column.
Do not drop it after newer migrations have been applied.
