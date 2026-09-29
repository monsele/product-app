---
story_id: ST-109
title: "Add the V2 Creative-Design Manifest, Visual-Plan Contract, and Eight Composition Families"
phase: "11 — Visual Storytelling"
status: In Progress
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

- [ ] AC1 v1 manifests parse and render unchanged; v2 manifests have a
      distinct canonical hash and render identity.
- [ ] AC2 Every scene type has ≥2 compatible compositions that differ in
      placement and hierarchy (asserted structurally, reviewed visually).
- [ ] AC3 The selector is deterministic for a seed, differs across seeds, and
      honours the family-run rule.
- [ ] AC4 Every semantic type × six identities × each compatible composition
      renders a valid frame with no overflow.
- [ ] AC5 Model-proposed display wording with a new word or number is rejected
      in favour of the authored display.

## Required Tests

- [ ] Schema, eligibility, selector and display-validation unit tests.
- [ ] Render matrix (type × identity × composition) with overflow checks.
- [ ] v1 regression.

## Out of Scope

- The visual-planning model call and illustration changes (ST-110).
- Narration-anchored timing (ST-111).

## Dev Agent Record

- **Agent:** Claude (Opus 5.5)
- **Started:** 2026-09-29
- **Completed:**
- **Branch/PR:**
- **Files changed:**
- **Migrations:** None
- **Commands/tests:**
- **Screenshots/output:**
- **Decisions/assumptions:**
- **Deviations:**
- **Known risks/follow-up:**
