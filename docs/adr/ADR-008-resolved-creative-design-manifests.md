# ADR-008 — Resolved creative-design manifests for the bounded personalisation pilot

- Status: Accepted
- Date: 2026-09-19
- Story: ST-097 — Add Composition Variety and Progressive Personalisation
- Extends: ADR-004 (measured narration), ADR-005 (style-pack proof), ADR-007 (comparison variants)
- Related: `docs/controlled-rendering-versioning-contract.md`

## Context

ADR-005 proved three style packs but deliberately kept them outside production.
ST-097 introduces a bounded, standard-approach pilot: Essential, Editorial, and
Everyday across hook, definition, process, and comparison scenes. The existing
`LessonSpec` payload is an immutable, versioned semantic contract with many
consumers. Adding mutable design drafts into it would either alter that contract
or make every semantic editor update rewrite presentation history.

## Decision

1. Store a versioned **creative design manifest** in additive tenant-owned
   records. A draft references its current lesson-spec ID and revision; applying
   it creates an immutable resolved manifest snapshot. Lesson versions and render
   manifests copy that snapshot rather than looking up a mutable preset.
2. The manifest contains only registered pack/treatment versions, per-scene
   selections and teacher locks, bounded role-based overrides, immutable asset
   identities, pinned font identities, planner version, and motion-energy
   setting. It never stores CSS, JSX, coordinates, signed URLs, arbitrary font
   names, or provider output.
3. A missing manifest is the explicit legacy `mvp-default` reader path. It is
   never backfilled into historical lesson snapshots. Legacy preview, validation,
   render, restore, and comparison behaviour therefore retain their original
   appearance.
4. Planning happens at explicit draft creation/replan time and is deterministic.
   Rendering and playback consume only the resolved snapshot. A lock that no
   longer fits becomes a conflict; it is never silently replaced.
5. A full-lesson validation runs before atomic application. Its identity includes
   the lesson content hash and canonical resolved-design hash. A design mutation
   invalidates design-sensitive validation and render cache identity while leaving
   unchanged narration, captions, citations, and source artefacts reusable.
6. Presets are append-only versions. Archive prevents new selection but does not
   break a saved snapshot. Provider interpretation returns a validated proposal
   tied to the input draft revision and requires an explicit apply action.
7. The pilot is feature/cohort gated and rejects any unsupported scene sequence
   or demonstration approach. It never applies a partial mixed-style lesson.

## Consequences

- The production scope is now three approved style packs over four scene types,
  with two or more authored treatments per pack/type. The remaining six scene
  types and demonstration/style composition stay out of scope.
- A renderer must include the immutable resolved-design hash and implementation
  release in its identity; signed media URLs remain transient execution details.
- The manifest is intentionally parallel to the semantic `LessonSpec`, not a
  replacement for it. Any future direct LessonSpec integration requires a new
  ADR and compatibility audit.

## Alternatives rejected

- **Put drafts directly in LessonSpec:** couples mutable presentation controls to
  a versioned semantic contract and makes legacy compatibility riskier.
- **Resolve the latest preset at preview/render time:** violates CR-01 through
  CR-03 and makes historical renders non-reproducible.
- **Accept arbitrary styling or model-generated layout instructions:** violates
  the bounded renderer and safe provider boundaries.
