---
story_id: ST-109
title: "Add the V2 Creative-Design Manifest, Visual-Plan Contract, and Eight Composition Families"
phase: "11 — Visual Storytelling"
status: Done
priority: must-have
epics: ["E11", "E15"]
prd_user_stories: ["E11-US2", "E15-US2"]
depends_on: ["ST-108"]
---

# ST-109 — V2 Contracts and Composition Families

## Story

As a learner, I want scenes to be laid out differently according to what
they explain — a timeline for a sequence, two objects for a comparison, a
large statement for a key idea — so that the video tells a visual story
instead of repeating one slide shape.

## Outcome

A versioned creative-design manifest v2 and visual-plan contract exist beside
v1. Eight composition families are implemented as versioned native
compositions under the `cinema-1.0.0` release, with registered compatibility
for all ten semantic scene types (at least two genuinely different
arrangements each). A deterministic whole-video selector uses content,
image availability, text density, recent families and a persisted variation
seed. The full-lesson composition renders v2 manifests through the new
compositions; v1 is unchanged.

## Scope

- [ ] `creativeDesignManifestV2Schema`, a union reader, v2 validation and
      canonical hashing; composition catalogue with families, versions,
      eligibility and text budgets.
- [ ] Visual-plan contract (display wording, illustration brief, beats) with
      deterministic display-wording validation against approved content.
- [ ] Eight families: illustrated headline, statement with emphasis, chapter
      card, illustrated sequence/timeline, comparison (split and stacked),
      connected cause-and-effect, annotated hero diagram (annotated and
      indexed), takeaway/closing question.
- [ ] Whole-video selection with seed; no more than two consecutive uses of a
      family when an eligible alternative exists.
- [ ] Every composition renders all validated content of its scene; text is
      fitted, never clipped, and stays out of the caption safe area.

## Acceptance Criteria

- [x] AC1 v1 manifests parse and render unchanged; v2 manifests have a
      distinct canonical hash and render identity.
- [x] AC2 Every scene type has ≥2 compatible compositions that differ in
      placement and hierarchy (asserted structurally, reviewed visually).
- [x] AC3 The selector is deterministic for a seed, differs across seeds, and
      honours the family-run rule.
- [x] AC4 Every semantic type × six identities × each compatible composition
      renders a valid frame with no overflow.
- [x] AC5 Model-proposed display wording with a new word or number is rejected
      in favour of the authored display.

## Required Tests

- [ ] Schema, eligibility, selector and display-validation unit tests.
- [ ] Render matrix (type × identity × composition) with overflow checks.
- [ ] v1 regression.

## Out of Scope

- The visual-planning model call and illustration changes (ST-110).
- Narration-anchored timing (ST-111).

## Dev Agent Record

- **Agent:** Claude Code (Opus 5.5).
- **Started:** 2026-09-29.
- **Completed:** 2026-09-30. Accepted by the user the same day; Done.
- **Branch/PR:** `feat/st-107-video-brief-budget-self-repair` (commits
  852af5d, af971c7, 10bd3a2; the 2026-09-30 visual fixes are uncommitted). No
  PR.
- **Migrations:** None (ADR-015: v2 is stored in the existing columns).
- **Full detail:** [HANDOFF.md](HANDOFF.md).

### Files changed

- `packages/schemas/src/creative-design-v2.ts` (new): the "2.0" manifest, the
  catalogue of 10 compositions in 8 families, eligibility, grounded display
  wording, the seeded whole-video selection, `planCinemaDesign`,
  `validateCreativeDesignManifestV2`, `carryForwardCinemaDesign`,
  `visualPlanProposalSchema`. `index.ts` re-exports it and
  `previewManifestSchema.creativeDesign` accepts either release.
- `packages/scene-library/src/cinema/`: `frame.tsx`, `text-fit.ts`,
  `cinema-scene.tsx` and `compositions/` (headline-led, sequence, comparison,
  connected, hero, takeaway, detail). `full-lesson.tsx` and
  `scene-preview.tsx` render `CinemaScene` for v2.
- API, worker and web support for v2: preview manifest, renders, lesson
  versions, carry-forward (`packages/database/src/creative-design-carry-forward.ts`),
  the design service (`upgrade`, alternatives, apply), the storyboard job flag
  `CREATIVE_DESIGN_V2_DEFAULT`, and the web design panel.

### Commands/tests

- `creative-design-v2.test.ts` (schemas: 452 tests pass in the package).
- `cinema-render.test.ts`: Remotion stills for all six packs.
- `shoot-cinema.mjs`: identity × fixture × eligible composition, 876 pass /
  0 fail, including the 24px phone floor, broken words and (new on
  2026-09-30) content inside the 40px caption margin.
- `creative-design-v2.integration.test.ts` (API, Postgres) and
  `creative-design-carry-forward.test.ts`.

### Decisions/assumptions

- v1 stays frozen and is read through `anyCreativeDesignManifestSchema`.
- The selection never puts three scenes of one family in a row.

### Deviations

- Found and fixed while integrating: carry-forward parsed only v1, so a v2
  design was replanned as v1 on every storyboard edit; and the validator
  refused an untitled scene's authored fallback headline.
- 2026-09-30 visual fixes after the proof lessons (see ST-112).

### Known risks/follow-up

- Presets and "describe a style" are still v1-only.
