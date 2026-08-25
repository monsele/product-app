# Migration 0037 compatibility notes

- Adds the `scene_candidates` table for ST-051 scene regeneration.
- A candidate stores the before/after scene JSON for teacher comparison, the
  scene revision it was generated against, and a tenant-unique idempotency key
  per (owner, project, scene) so regeneration retries are idempotent.
- `scene_candidates` references `lesson_specs` and `scenes` with `ON DELETE
CASCADE` and `model_calls` with `ON DELETE RESTRICT`; both project tables
  carry `project_id` + `owner_user_id` (tenant isolation). All reads must
  filter on `owner_user_id` and `project_id`.
- Adds two `audit_event_type` values:
  `storyboard.scene_candidate_accepted` and
  `storyboard.scene_candidate_rejected`.
- Additive migration; no existing rows or indexes change. Deploy before API
  and pipeline-worker binaries that use scene regeneration.
