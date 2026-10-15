# ADR-010 — Expand the registered standard-video style-pack catalogue

- Status: Accepted
- Date: 2026-09-20
- Story: ST-101 — Author the Systems, Field Notes, and Prism Style Packs
- Extends: ADR-005, ADR-008, ADR-009

## Context

ADR-008 deliberately limited the creative-design pilot to Essential, Editorial,
and Everyday. ST-100 subsequently completed their treatment catalogue across
the ten existing semantic scene types. The remaining proposed directions —
Systems, Field Notes, and Prism — need to be added without weakening the
bounded, resolved-manifest renderer contract or changing historical outputs.

## Decision

1. Add `systems`, `field-notes`, and `prism`, each at an immutable `1.0.0`
   release, to the registered creative-design catalogue for the existing ten
   semantic scene types. Each pack/type pair has primary and alternate authored
   treatments.
2. The extension applies to the standard approach only. Demonstration
   presentations remain limited to the ADR-009 matrix; an unsupported
   style/approach combination fails explicitly and never falls back.
3. A treatment is an authored presentation family, tokens, deterministic
   frame-driven motion, and declared readable holds. It is not a palette-only
   substitution. Systems emphasizes relationship paths and signals; Field Notes
   emphasizes paper, annotation, and progressive observation; Prism emphasizes
   high-contrast geometric chapter changes.
4. Existing resolved manifests, lesson versions, render manifests, presets,
   previews, and outputs remain immutable. New pack selection creates a new
   resolved creative-design snapshot and changes render identity under the
   existing canonical-hash policy.
5. Pack definitions use pinned bundled fonts and bounded renderer inputs only.
   No arbitrary font name, CSS, coordinates, SVG path, animation code, or
   provider-generated layout instruction is accepted.

## Consequences

- The standard creative-design catalogue becomes six packs across ten existing
  scene types. No new semantic templates, user-created packs, reference-style
  matching, or demonstration-style combinations are introduced.
- The renderer, preview, and preflight must recognize the same registered pack
  versions. Invalid, unavailable, or incompatible selections are actionable
  validation failures.
- Style-specific visual-regression and deterministic-render fixtures are
  required before a release is accepted.

## Amendment: new scene types join existing pack releases (ST-114, 2026-10-15)

ST-114 adds an eleventh semantic scene type, `data-chart`. This amends the
"ten existing scene types" and "no new semantic templates" consequences
above as follows:

- A new scene type may add its primary and alternate treatments to every
  pack's existing release (here `1.0.0`) without a new pack version, provided
  the addition is strictly additive: no existing treatment, token, font,
  motion or hold changes, and every existing lesson, resolved manifest,
  render manifest and output stays byte-identical. ST-114 shows this with the
  unchanged full-lesson render and audio parity tests.
- Each pack also gains a fixed, accessibility-checked chart palette used only
  by `data-chart` scenes. It is not a per-lesson identity token, and teacher
  colour settings do not change it.
- Any change to an existing treatment still requires a new pack version, as
  decided above.

The matching v2 composition note is in ADR-015 ("ST-114 — data-chart
compositions").
