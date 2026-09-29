---
story_id: ST-108
title: "Repair Creative Rendering: Complete Identity Tokens, Rendered Imagery, Optional Framing, and Style Names"
phase: "11 — Visual Storytelling"
status: In Progress
priority: must-have
epics: ["E11", "E15"]
prd_user_stories: ["E11-US2", "E15-US2"]
depends_on: ["ST-100", "ST-101", "ST-102", "ST-103"]
---

# ST-108 — Repair Creative Rendering for New Videos

## Story

As a teacher, I want a video in my chosen style to look like that style in
every scene — its colours, type and illustrations — so that it never falls
back to the default look or shows placeholder symbols where pictures belong.

## Outcome

New (v2) videos render through an identity layer that resolves the complete
palette, typography and tokens for all six registered identities; every
supported image slot draws its bound image; no scene carries a compulsory
decorative border; and configuration, preview and delivery show the style's
human-readable name. Historical v1 snapshots render exactly as before.

## Required Reading

- `docs/cinema-reel.md` §2 "Fix the production rendering gaps first"
- `docs/adr/ADR-015-v2-composition-planning-and-pre-approval-asset-substitution.md`
- ADR-005, ADR-008, ADR-010; `docs/controlled-rendering-versioning-contract.md`

## Scope

- [ ] ADR-015 recorded before any v2 snapshot can be approved.
- [ ] Identity resolver: complete palette (background, surface, text, muted
      text, accent, text-on-accent, diagram emphasis, line), display/body/mono
      fonts, radius, stroke, emphasis style, surface style and image framing
      for all six identities, derived from the manifest settings.
- [ ] Native primitives that consume only the resolved identity: headline with
      selective emphasis, bound image (contain/cover by role, never a glyph),
      authored motif fallback, card, connector, numeral badge.
- [ ] No compulsory border: framing is a composition choice.
- [ ] Human-readable style name helper used by configuration, preview and
      delivery; "legacy theme" shown only for lessons without a manifest.

## Technical Implementation Requirements

- v1 components and `CreativeScene` are untouched (ADR-015 §1).
- Identity colours are validated for contrast; derived colours are computed,
  never model-supplied.
- An image that is bound but unresolved blocks a render (CR-01) and is drawn
  as the authored motif in preview only.

## Acceptance Criteria

- [ ] AC1 Every identity resolves every token; no v2 primitive reads
      `videoTheme.colors`.
- [ ] AC2 A bound, resolved image renders as an `<img>` in every v2 slot;
      no glyph placeholder exists in the v2 path.
- [ ] AC3 No v2 scene draws a border unless its composition declares one.
- [ ] AC4 Style names appear in configuration, preview and delivery; legacy
      label only when no manifest exists.
- [ ] AC5 A v1 manifest renders byte-identical frames before and after.

## Required Tests

- [ ] Identity token and contrast tests for all six identities.
- [ ] Primitive render tests (image, motif, emphasis) and a legacy-colour scan.
- [ ] v1 frame-hash regression.

## Out of Scope

- Composition families and planning (ST-109, ST-110); timed motion (ST-111).

## Dev Agent Record

- **Agent:** Claude (Opus 5.5)
- **Started:** 2026-09-29
- **Completed:**
- **Branch/PR:**
- **Files changed:**
- **Migrations:** None
- **Commands/tests:**
- **Screenshots/output:**
- **Decisions/assumptions:** v1 renderer frozen per ADR-015; repairs land in
  the v2 path only.
- **Deviations:** The v2 manifest envelope needed by the gate is introduced
  alongside ST-109's contract work.
- **Known risks/follow-up:**
