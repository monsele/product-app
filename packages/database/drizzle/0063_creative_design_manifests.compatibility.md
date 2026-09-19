# 0063 Creative design manifests

This additive migration introduces tenant-scoped creative-design drafts,
immutable snapshots, and versioned personal presets for ST-097. Existing
`lesson_specs`, `lesson_versions`, validation runs, previews, and render jobs
are untouched: their missing manifest continues to mean the legacy
`mvp-default` appearance. No historical payload is rewritten or backfilled.
