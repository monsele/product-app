---
story_id: ST-108
title: "Repair Creative Rendering: Complete Identity Tokens, Rendered Imagery, Optional Framing, and Style Names"
phase: "11 — Visual Storytelling"
status: In Review
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

- [x] AC1 Every identity resolves every token; no v2 primitive reads
      `videoTheme.colors`.
- [x] AC2 A bound, resolved image renders as an `<img>` in every v2 slot;
      no glyph placeholder exists in the v2 path.
- [ ] AC3 No v2 scene draws a border unless its composition declares one.
- [x] AC4 Style names appear in configuration, preview and delivery; legacy
      label only when no manifest exists.
- [x] AC5 A v1 manifest renders byte-identical frames before and after.

## Required Tests

- [ ] Identity token and contrast tests for all six identities.
- [ ] Primitive render tests (image, motif, emphasis) and a legacy-colour scan.
- [ ] v1 frame-hash regression.

## Out of Scope

- Composition families and planning (ST-109, ST-110); timed motion (ST-111).

## Dev Agent Record

- **Agent:** Claude Code (Opus 5.5).
- **Started:** 2026-09-29.
- **Completed:** 2026-09-30. Handed off as In Review.
- **Branch/PR:** `feat/st-107-video-brief-budget-self-repair` (commits
  852af5d, af971c7, 10bd3a2; the 2026-09-30 visual fixes are uncommitted). No
  PR.
- **Migrations:** None (ADR-015: v2 is stored in the existing columns).
- **Full detail:** [HANDOFF.md](HANDOFF.md).

### Files changed

- `packages/scene-library/src/cinema/`: `identity.ts` (every token resolved
  per pack; muted text guarded against background and surface), `primitives.tsx`
  (text, surfaces, connectors, `HeroVisual`, `ItemIcon`, authored `Motif`,
  `ShapeDiagram`, `SourceTable`), `content.ts` (picture resolution: pinned
  illustration, then the scene's own slot, then an authored motif).
- Style names, one source (`creativeDesignPackNames`, `creativeDesignStyleLabel`):
  web configuration, preview subtitle, render panel and comparison;
  `renderStatusResponseSchema.styleLabel` and `PostgresRenderService.response()`.

### Commands/tests

- `src/cinema/cinema.test.tsx`: identity contrast for the defaults and 120
  seeded palettes × 6 identities; picture resolution (render refuses a missing
  pinned or bound picture, preview falls back to the motif).
- `node .claude/skills/inspect-render/shoot-cinema.mjs`: 876 pass / 0 fail on
  2026-09-30; it fails on a broken `<img>` or a placeholder glyph.
- API `renders.test.ts` (style label), web vitest.

### Decisions/assumptions

- The v1 renderer is frozen (ADR-015); repairs land in the v2 path only.
- Accent text is held to 3:1 because it is only ever used for large text.

### Deviations

- The v2 manifest envelope the gate needs arrived with ST-109's contract work.
- AC3 (no border unless the composition declares one) was reviewed from
  screenshots, not asserted by a test, so it is left unticked.
- AC5: the three v1 pixel-snapshot tests (`summary-scene-render`,
  `scene-preview-render-smoke`, `full-lesson-render`) fail on this Windows
  machine at the baseline commit and at HEAD with identical hashes. The
  committed hashes were recorded on Linux CI. v1 output is unchanged; do not
  refresh the baselines on Windows.

### Known risks/follow-up

- CI status was not checked (`gh` is not installed locally).
