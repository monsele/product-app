# 0066 lesson configuration creative style pack compatibility

Additive, nullable column. No existing row's semantics change.

## `lesson_configurations.creative_style_pack`

- New nullable `text` column, unconstrained at the database layer; validated
  against `creativeDesignPackIdSchema` (`@avlp/schemas`) at the API boundary,
  the same layer that already owns the pack catalogue (ADR-010 grew it from
  3 to 6 packs with no migration). A `pgEnum` was rejected for the same
  reason: it would need a migration every time the catalogue grows again.
- Every pre-existing row reads back `null`, which is what those lessons
  already were: the legacy `mvp-default` scene-template appearance, with no
  `creative_design_snapshots` row. Nothing to backfill.
- `lesson_versions.snapshot` JSON written before this migration has no
  `creativeStylePack` key; it is not rewritten and is never read for this
  purpose. The immutable render input is, and remains, the resolved
  `creative_design_snapshots` row keyed by `(lessonSpecId, lessonSpecRevision)`
  (CR-01, CR-02), not this configuration column — this column is only read
  once, at storyboard-generation time, to decide whether to create that
  snapshot in the first place.

## Deployment order

- Apply before API and pipeline-worker instances that read or write
  `lesson_configurations.creative_style_pack`.
