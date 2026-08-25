# Migration 0031 — Objective revisions, superseded status, and objective audit events

## Change

- Adds `objectives.edited` and `objectives.approved` to the `audit_event_type` enum
  (inserted before `version.restored` for stable ordering).
- Adds `superseded` to the `learning_objective_set_status` enum. Per the approval
  state machine (technical guide 5.3), an edited approved set becomes a new draft
  revision and the replaced set is marked `superseded`.
- Adds `learning_objective_sets.revision` (integer, default `0`): the optimistic
  concurrency token for the working draft set used by the objective editor.

## Compatibility

- `ALTER TYPE ... ADD VALUE` is append-only: existing `draft`/`approved` rows and
  existing audit rows keep their values, and rollback requires dropping rows that
  use the new values before removing the values.
- `revision` defaults to `0` so every existing set starts with a valid token;
  editor mutations require the client to send the current `revision`.
- No existing consumers are broken: `draft` and `approved` remain valid set
  statuses, and new objective audit events only add surface for ST-045.
