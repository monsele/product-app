# 0072 lesson edit threads compatibility

Additive only. No existing row changes and nothing is backfilled.

## New tables

- `lesson_edit_threads`: one conversational edit thread per project, unique
  per `(owner_user_id, project_id)`. `message_sequence` is the last message
  `seq` handed out; writers bump it in the same transaction as the message
  insert, so the row lock serialises appends.
- `lesson_edit_messages`: the teacher requests and the plans proposed for
  them, unique per `(thread_id, seq)`. A teacher message is also unique per
  `(owner_user_id, project_id, idempotency_key)`, so a replayed request
  returns the original turn instead of planning (and billing) it twice.
  `plan`, `operation_states`, `applied_operation_ids`, `before_revision`,
  `after_revision` and `undo_snapshot` record what each plan proposed and
  what applying or undoing it did. `role` and `status` are checked text
  columns rather than enums, so later statuses need no `ALTER TYPE`.

Every new table has the tenant columns `owner_user_id` and `project_id`, and
every API and worker query filters on both. `text` is user content, like a
focus prompt: it is never logged and never copied into audit metadata, which
records only its length and operation counts (ADR-013 §3).

## Enum additions

- `usage_operation_type` gains `ai.edit-plan`.
- `audit_event_type` gains `edit_thread.message_posted`,
  `edit_thread.plan_applied`, `edit_thread.plan_dismissed` and
  `edit_thread.plan_undone`.

Enum values cannot be removed, so a rollback leaves them unused. Rolling back
the tables is `DROP TABLE "lesson_edit_messages"` then
`DROP TABLE "lesson_edit_threads"`. Storyboard edits made through a thread
are ordinary storyboard revisions and stay in place.
