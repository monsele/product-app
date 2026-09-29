# ADR-015 — V2 composition planning and pre-approval asset substitution

- Status: Accepted by product-owner instruction, 2026-09-29
- Stories: ST-108 through ST-112 (`docs/cinema-reel.md`)
- Extends: ADR-005, ADR-008, ADR-010, ADR-013
- Related: `docs/controlled-rendering-versioning-contract.md`

## Context

Generated videos in the six registered style identities still look like the
legacy default. A production investigation of a lesson styled **Everyday**
found that:

1. every scene received its `primary` treatment, because the ST-101 planner
   rewards `primary` and penalises only a repeat of the immediately previous
   family, and families are unique per scene type;
2. v1 "treatments" are decorative overlays around one shared semantic scene
   component, so primary and alternate differ in borders, tints and spacing
   rather than content placement;
3. several scene components paint with the legacy dark `mvp-default` theme
   inside a light pack (the hook scene ignores the pack entirely, as does the
   graph diagram used by process and cause-effect scenes);
4. bound IPO, process and cause-effect asset slots render a `●` glyph instead
   of the accepted image, so accepted illustrations are paid for but unseen;
5. every scene carries a compulsory accent border, whatever its content.

ADR-008 requires resolved design snapshots to be immutable and historical
renders reproducible. Correcting the v1 components in place would change the
appearance of approved lesson versions and invalidate their render parity.

## Decision

1. **A second, parallel manifest release.** Add creative-design manifest
   `manifestVersion: "2.0"` beside `1.0`, stored in the same JSONB draft,
   snapshot and lesson-version columns. Readers accept either release through
   one discriminated reader. The v1 schema, planner, treatment catalogue and
   the ten v1 scene components are frozen: a v1 snapshot renders exactly as it
   did, and is never rewritten or backfilled.
2. **Versioned compositions, not palette templates.** A v2 manifest selects,
   per scene, a registered *composition* (`compositionId` + immutable
   `compositionVersion`) implemented under the `cinema-1.0.0` composition
   release. A composition decides content placement and hierarchy; the pack
   (identity) supplies only tokens — the complete resolved palette, typography,
   radius, stroke, emphasis style and image framing. The six identities are
   retained unchanged. Eight composition families are registered, each scene
   type is compatible with at least two genuinely different arrangements, and
   no composition draws a compulsory decorative border.
3. **Native text, generated imagery.** Screen text, diagrams, connectors and
   captions stay native renderer elements. Generated images supply
   illustration only and never carry essential text. A v2 scene may bind a
   *presentation illustration* (`imagery.hero`) in the manifest; it is
   decorative, distinct from source evidence, and never fills a
   grounding-critical slot. Factual diagrams and relationships remain native.
4. **Bounded visual planning.** A visual-planning job may propose, per scene,
   a ranked composition preference, concise display wording, an illustration
   brief and narration-anchored beats. It may not supply code, coordinates,
   CSS, colours, fonts or new factual claims. Display wording is accepted only
   when every content word and every number already appears in the scene's
   approved title, narration, on-screen text or visual fields; otherwise the
   authored display is used. Composition choice remains deterministic:
   a whole-video selection over content eligibility, image availability, text
   density and recent families, seeded by a persisted `variationSeed`, which
   avoids more than two consecutive uses of one family when an eligible
   alternative exists.
5. **Narration-anchored motion.** Beats name a registered element, one of
   four motion families (sequential reveal, path build, emphasis,
   transformation) and a narration anchor (sentence index and optional exact
   phrase). Anchors resolve to frames by a pure function of the pinned caption
   cues and scene duration, so preview, render and lesson version resolve
   identically. Motion never shortens a scene, overlaps scenes, or alters the
   narration and audio timeline; readable holds and the caption safe area are
   preserved.
6. **Automatic asset substitution before approval only.** While a design is a
   draft (before a lesson version or preview approval freezes it), the system
   may automatically replace a missing or failed optional illustration with,
   in order: a suitable approved source figure or existing project asset, a
   compatible library asset, or an authored native motif drawn in the same
   identity. The substitution is recorded in the manifest (`imagery.hero` or
   `imagery.fallback`) and in the run's decision log. After approval the
   manifest is immutable: rendering a saved version never substitutes,
   re-plans or fetches a replacement, and a missing pinned asset fails
   explicitly (CR-01).
7. **Budget.** Visual planning is metered as `ai.creative_design`. Illustration
   generation is deduplicated by concept and treatment and budgeted at eight
   unique generated illustrations per five minutes of target duration, capped
   at twelve per video. The allowance appears in brief estimates and run-budget
   reservations; fallbacks never exceed the approved cap.
8. **Identity and rollout.** A v2 manifest's canonical hash includes the
   composition release, composition versions, seed, art direction and
   imagery, so v2 snapshots have distinct render cache identities. New videos
   use v2 when `CREATIVE_DESIGN_V2_DEFAULT` is enabled; existing lessons move
   to v2 only through an explicit upgrade that writes a new draft and
   snapshot.

## Consequences

- No new storage table or migration: JSONB columns and existing metering are
  reused. Job payloads for illustration generation gain an optional,
  versioned art-direction block.
- Two renderer implementations coexist. v1 is maintenance-only; defects in it
  are fixed only through an explicit decision recorded against this ADR.
- A v2 composition must render every validated content item of its scene;
  shortened display wording is additive presentation, never a substitute for
  the validated visual fields.
- Rendering quality is established by reviewing rendered MP4s at desktop and
  phone sizes; distinct frame hashes alone are not acceptance evidence.

## Alternatives rejected

- **Repair the v1 components in place:** changes approved historical output
  and breaks render parity for saved versions.
- **More palette-only treatments per pack:** multiplies templates without
  changing placement or hierarchy, which is the defect being fixed.
- **Model-generated layout or full-slide images:** violates the bounded
  renderer and makes essential text unreadable, unlocalisable and ungrounded.
- **Substituting assets at render time:** makes a saved version's output
  depend on current project state.
