# 0076 - Durable preparation notifications

Additive signal table and dependency triggers. Deploy before the API scheduler.
Old processes continue to work; notifications wait durably for an enabled API.
No authorization or additional allowance is created. Signals contain only tenant,
project and change time, and cascade with project deletion. Repeated changes
coalesce. Rollback requires dropping the triggers before the function/table.

The scheduler consumes a signal and writes the existing job/outbox atomically.
Signals arriving during a coordinator lease remain pending. Multiple API instances
serialize on the project advisory lock and the recovery-run row.
