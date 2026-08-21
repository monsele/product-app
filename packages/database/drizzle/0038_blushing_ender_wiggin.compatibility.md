# Migration 0038 compatibility notes

- Adds the `grounding_checks` table for ST-053 grounding rechecks.
- A grounding check stores the segmented claims, per-claim results, the
  lesson-spec revision and content hash it ran against, the approved source
  snapshot id and content hash it resolved against, a scope (`scene` or
  `lesson`), and a tenant-unique idempotency key per (owner, project) so
  recheck retries are idempotent.
- `grounding_checks` references `lesson_specs` (`ON DELETE CASCADE`),
  `source_snapshots` (`ON DELETE RESTRICT`), and `scenes.stable_scene_id`
  (`ON DELETE CASCADE`). `scene_id` deliberately references
  `scenes.stable_scene_id` (the stable public scene identifier), not the
  `scenes` row primary key; a unique index `scenes_stable_scene_id_unique`
  backs that FK. All project tables carry `project_id` + `owner_user_id`
  (tenant isolation). All reads must filter on `owner_user_id` and
  `project_id`.
- `grounding_checks` rows are inserted only on completion; job lifecycle state
  lives in `jobs`, so no `status`/`error_code` columns exist on the table.
- Adds the `citation_history_snapshots` table preserving grounding/citation
  state with lesson versions (ST-053 scope, see ADR-002). The tenant-scoped
  unique index `citation_history_snapshots_tenant_version_unique`
  (owner_user_id, project_id, lesson_version_id) makes snapshot persistence
  idempotent per version. `lesson_version_id` is a plain UUID column for now
  because the `lesson_versions` table ships in ST-060, which will add the
  foreign key and call the snapshot writer. `scene_citations` stores the
  resolved per-scene citations and `grounding_check_id` links the snapshot to
  the grounding check it reflects.
- Additive migration; no existing rows or indexes change. Deploy before API
  and pipeline-worker binaries that use grounding checks.
