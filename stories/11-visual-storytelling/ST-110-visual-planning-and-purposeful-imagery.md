---
story_id: ST-110
title: "Add a Bounded Visual-Planning Job and Consistent, Purposeful Illustration"
phase: "11 — Visual Storytelling"
status: In Review
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

- [x] AC1 A plan never contains code, coordinates, CSS, colours or fonts.
- [x] AC2 Unsupported wording, beats or compositions are dropped, not applied.
- [x] AC3 Visual-plan failure, provider failure or budget exhaustion yields a
      valid authored v2 design without user intervention.
- [x] AC4 No more than the budgeted number of unique illustrations is queued;
      retries are idempotent and metered once.
- [x] AC5 Generated imagery never binds to a grounding-critical slot.

## Required Tests

- [ ] Plan validation, fallback, dedupe, budget, idempotency, tenant isolation
      and usage-accounting tests.

## Dev Agent Record

- **Agent:** Claude Code (Opus 5.5).
- **Started:** 2026-09-30.
- **Completed:** 2026-09-30. Handed off as In Review.
- **Branch/PR:** `feat/st-107-video-brief-budget-self-repair` (commits
  852af5d, af971c7, 10bd3a2; the 2026-09-30 visual fixes are uncommitted). No
  PR.
- **Migrations:** None (ADR-015: v2 is stored in the existing columns).
- **Full detail:** [HANDOFF.md](HANDOFF.md).

### Files changed

- `packages/schemas/src/creative-design-v2.ts`: `groundVisualPlanProposal`,
  `cinemaIllustrationBudget`, `cinemaIllustrationKey`,
  `cinemaIllustrationPrompt`, `planCinemaIllustrations`,
  `cinemaHeroSlotBinding`, `cinemaSceneHasEvidencePicture`.
- `packages/provider-adapters`: prompt `visual-plan@v1`, the job envelopes for
  `creative-design.visual-plan` and `creative-design.interpret`, the cinema
  illustration styles, and the dynamic mock's grounded plan.
- `apps/pipeline-worker/src/visual-plan-job.ts` (new) and
  `illustration-generation-job.ts` (`createCinemaIllustrationJobHandler`,
  payload v2), both registered in `runtime.ts`.
- `apps/api`: `IllustrationGenerationService.queueCinemaIllustrations`.

### Commands/tests

- Schemas: grounding, budget, dedupe key, reuse, budget priority, the AC5
  validator rule and the prompt.
- Worker: `visual-plan-job.test.ts` (5), `visual-plan-job.integration.test.ts`
  (10, Postgres), `cinema-illustration-job.integration.test.ts` (6, Postgres).
- API: `cinema-illustrations.integration.test.ts` (5, Postgres).
- Integration tests need `TEST_DATABASE_URL` and `--hookTimeout=180000`.

### Decisions/assumptions

- Any provider, quota, structured-output or grounding failure keeps or
  re-plans an authored design and the job succeeds.
- A proposed emphasis word in another case or form is accepted in the
  scene's own spelling; with no usable word the authored emphasis stands
  (2026-09-30, after most proof scenes lost their emphasis).

### Deviations

- There is no library of reusable illustrations in the codebase, so the
  "library" rung of the reuse order is not implemented; the fallback goes
  from generated straight to the authored motif.
- The `creative-design.interpret` envelope was missing too, so "describe a
  style" could never run; adding it changes that existing behaviour.

### Known risks/follow-up

- Without a model plan an authored v2 design has no picture briefs, so
  pictures appear only when the plan call succeeds.
