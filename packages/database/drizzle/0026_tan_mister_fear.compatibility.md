# Migration 0026 compatibility notes

- Adds editable figure inclusion overlays and idempotent source-figure invalidation records.
- Adds two audit event types (`source.figure_updated`, `source.figure_restored`).
- The immutable `extracted_figures` rows remain authoritative; exclusion is an overlay and never deletes the figure or its storage object.
- Existing projects without overlays project every figure as included (revision 0).
- Deploy this migration before API builds that serve the figure inclusion surface.
