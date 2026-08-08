# LessonSpec compatibility

`LessonSpec` version `1.0` is an immutable, strict contract. Consumers must parse unknown JSON with `parseLessonSpec` before use.

Versions with a different `schemaVersion` are incompatible and rejected. Additive or breaking future changes require a new schema version, migration fixtures, and explicit compatibility handling; no consumer may infer compatibility from an unknown version.
