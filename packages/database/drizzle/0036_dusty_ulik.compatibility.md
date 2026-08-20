# Migration 0036 compatibility notes

- Adds the `lesson_spec_status` enum (`draft`, `approved`, `superseded`) and the
  `lesson_specs` + `scenes` tables for the ST-050 storyboard draft.
- `lesson_specs.payload` is the canonical ordered scene collection; `scenes`
  normalizes each scene (order, template, duration, narration-block
  assignment, planned asset requirements, scene JSON) for the review route and
  later editor operations.
- Both tables carry `project_id` + `owner_user_id` (tenant isolation). All
  reads must filter on `owner_user_id` and `project_id`; there is no global
  access path.
- `lesson_specs` references `narration_sets` and `lesson_outline_sets` with
  `ON DELETE RESTRICT` so a storyboard cannot outlive the narration/outline it
  was generated from; `scenes` cascades from `lesson_specs`.
- New tables are additive; no existing rows or indexes change. Deploy this
  migration before API or pipeline-worker binaries that use the storyboard
  generate/status endpoints.
