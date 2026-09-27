# 0069 one-shot runs compatibility

Additive only. No existing row changes and nothing is backfilled.

## `one_shot_runs` (new table)

- One prompt-to-video run per row (ST-105, ADR-013). Tenant columns
  `owner_user_id` and `project_id`; every API query filters on both.
- `one_shot_runs_request_unique` makes `POST one-shot` idempotent per
  `(owner, project, Idempotency-Key)`; `request_hash` detects a key reused for
  a different request.
- `one_shot_runs_one_active_per_project` is a partial unique index: at most
  one run per project in `queued`, `running`, `awaiting_render_approval`,
  `rendering`, `needs_attention` or `failed`. A second concurrent start fails
  on the index even when two requests race past the application check.
- `focus_prompt` is user content. It is never logged and never copied into
  audit metadata; the check constraint mirrors `lessonFocusPromptSchema`.
- `lesson_version_id` and `render_job_id` reference immutable rows with
  `ON DELETE restrict`, matching `demonstration_variants`.
- Project cleanup keeps these rows, like every other project-owned table
  except `jobs`; they hold no storage keys or signed URLs.

## Enum additions

- `audit_actor_type` gains `one_shot_run`: an automatic approval made by a
  run on its owner's behalf. `actor_user_id` records the run owner.
- `audit_event_type` gains `one_shot.run_started`, `one_shot.stage_approved`,
  `one_shot.render_approved`, `one_shot.run_resumed`, `one_shot.run_cancelled`.
- Enum values cannot be removed, so a rollback leaves them unused and
  harmless. Rolling back the table is `DROP TABLE one_shot_runs` followed by
  `DROP TYPE one_shot_run_status`.
