# 0070 one-shot brief, budget and decisions compatibility

Additive only. No existing row changes and nothing is backfilled.

## `one_shot_runs` (new columns)

- `brief_attempts`, `confirmed_brief_revision`: the brief calls made for the
  run and the revision the user confirmed. Both are 0 or `null` for runs
  started before ST-107. Those runs keep the ST-105 behaviour: lesson intent,
  no reservation and no repair.
- `style_pack_id` and `sound_bed` hold the confirmed choices that the
  configuration step saves.
- `reserved_usd`, `cap_usd`, `reservation_revision` and `budget_proposal_usd`
  form the run budget. The cap is `reserved × ONE_SHOT_BUDGET_TOLERANCE`.
  Accepting a raised estimate bumps `reservation_revision`. The check
  constraint keeps the cap at or above the reservation.
- `repair_state` holds the bounded self-repair bookkeeping: rounds, planned
  fixes and applied fixes.
- `coverage_gaps` lists the confirmed coverage points still unmet after the
  coverage repair round.
- `decision_sequence` is the last decision `seq` handed out. Writers bump it
  in the same transaction as the decision insert, so the row lock serialises
  appends.
- `one_shot_runs_one_active_per_project` is recreated so that it also covers
  `brief_pending` and `brief_ready`. The predicate is now
  `status not in ('completed', 'cancelled')`, which is the same set. It names
  only the two finished statuses, so the new enum values are never used as
  literals in the migration transaction that adds them. A `::text` cast
  would not work, because index predicates must be IMMUTABLE.

## New tables

- `one_shot_run_briefs`: one row per prepared brief revision, unique per
  `(run_id, revision)` and per `(owner, project, idempotency_key)`. Rows are
  never rewritten.
- `one_shot_run_ledger_entries`: one row per paid step, unique per
  `(run_id, step)`, reconciled from usage records by correlation id.
- `one_shot_run_decisions`: the append-only decision log, unique per
  `(run_id, seq)`. A trigger rejects `UPDATE`. `DELETE` is still allowed, so
  project cleanup and retention work the same way as for other project-owned
  tables.

Every new table has the tenant columns `owner_user_id` and `project_id`, and
every API query filters on both. `focus_prompt` and the decision `summary` are
user content: they are never logged and never copied into audit metadata.

## Enum additions

- `usage_operation_type` gains `ai.one-shot-brief`.
- `audit_event_type` gains `one_shot.brief_prepared` and
  `one_shot.budget_accepted`.
- `one_shot_run_status` gains `brief_pending` and `brief_ready`.

Enum values cannot be removed, so a rollback leaves them unused. Rolling back
the tables is `DROP TABLE` for each of the three new tables and
`DROP FUNCTION prevent_one_shot_run_decision_update()`. After that, drop the
new columns and restore the ST-105 index predicate.
