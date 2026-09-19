# ADR-009 - Bounded creative presentations for demonstration variants

- Status: Accepted
- Date: 2026-09-19
- Story: ST-099 - Compose Creative Styles with Demonstration-Led Explanation
- Extends: ADR-006, ADR-007, ADR-008

## Decision

1. A demonstration presentation is a registered, versioned renderer contract,
   selected only from a finite recipe/style matrix. It can contain named palette,
   font, caption, decorative-asset and presentation-region references, never
   executable code, arbitrary layout coordinates, paths, easing, or events.
2. ST-099 initially supports `essential`, `editorial`, and `everyday` for the
   existing savings and evaporation recipes only. Unsupported pairs return a
   structured capability rejection and never fall back to `mvp-default`.
3. The resolved creative-design snapshot and demonstration presentation are
   immutable inputs to variant and render identity; signed URLs are transient.
4. A controlled comparison freezes the same selected style across standard and
   demonstration variants. No completed comparison, lesson version, or existing
   `mvp-default` variant is rewritten.
5. Preview and worker rendering consume the exact resolved presentation;
   preflight fails actionably and never substitutes a later style.

## Consequences

- Object identity, narration, event anchors, values, captions, scene boundaries
  and holds remain unchanged by a presentation.
- New styles, recipes or semantic scene types need a registered version and
  separately reviewed scope; this pilot does not generalise them.
