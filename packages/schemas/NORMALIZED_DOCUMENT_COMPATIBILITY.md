# NormalizedDocument compatibility

`NormalizedDocument` and `SourcePackage` version `1.0` are strict, immutable boundary contracts. Consumers parse unknown input with `parseNormalizedDocument` or `parseSourcePackage` before use.

An unknown `schemaVersion` is incompatible. Any additive or breaking change requires a new version, compatibility fixtures, and explicit consumer migration; Docling response types must remain behind the ingestion adapter.

`ExtractedFigure.sourceLocator` identifies parser evidence only. ST-035 owns private-object storage, asset metadata, and authorized figure previews. ST-042 owns immutable approved snapshots and bounded, selected source-package construction; this structural schema intentionally does not impose prompt-size limits.
