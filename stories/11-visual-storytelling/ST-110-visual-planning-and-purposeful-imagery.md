---
story_id: ST-110
title: "Add a Bounded Visual-Planning Job and Consistent, Purposeful Illustration"
phase: "11 — Visual Storytelling"
status: Ready
priority: must-have
epics: ["E11", "E15"]
prd_user_stories: ["E11-US2", "E15-US2"]
depends_on: ["ST-109"]
---

# ST-110 — Visual Planning and Purposeful Imagery

## Story

As a teacher, I want the video's pictures to show what each scene is about,
drawn in one consistent style, so that illustrations explain rather than
decorate — without extra cost surprises or invented facts.

## Outcome

A metered, idempotent `creative-design.visual-plan` job runs between
storyboard creation and illustration generation. It proposes composition
preferences, concise display wording, illustration briefs and
narration-anchored beats, validated against the catalogue and approved
content, and writes a new v2 draft and snapshot. Illustration requests carry
a shared art direction and one of three registered treatments (flat,
ink/sketch, editorial), are deduplicated by concept and treatment, reuse
source figures and project assets first, and are budgeted (8 per five
minutes, cap 12). Failures fall back to library assets or authored motifs,
recorded before the preview is frozen.

## Scope

- [ ] Prompt `visual-plan/v1`, output schema, deterministic checks and
      authored fallback plan when the call fails or is unavailable.
- [ ] Reuse model-call, quota, `ai.creative_design` metering, job and outbox
      infrastructure; tenant-scoped reads only.
- [ ] Illustration job payload v2 with art direction and treatment; prompt
      built from the brief, never from source text; permits human figures.
- [ ] Concept/treatment deduplication, budget allowance and cap; reuse order
      source figure → project asset → generated → library → authored motif.

## Acceptance Criteria

- [ ] AC1 A plan never contains code, coordinates, CSS, colours or fonts.
- [ ] AC2 Unsupported wording, beats or compositions are dropped, not applied.
- [ ] AC3 Visual-plan failure, provider failure or budget exhaustion yields a
      valid authored v2 design without user intervention.
- [ ] AC4 No more than the budgeted number of unique illustrations is queued;
      retries are idempotent and metered once.
- [ ] AC5 Generated imagery never binds to a grounding-critical slot.

## Required Tests

- [ ] Plan validation, fallback, dedupe, budget, idempotency, tenant isolation
      and usage-accounting tests.

## Dev Agent Record

- **Agent:**
- **Started:**
- **Completed:**
