---
story_id: ST-112
title: "Integrate V2 Visual Storytelling into Production and Prove It on Three Lessons"
phase: "11 — Visual Storytelling"
status: Done
priority: must-have
epics: ["E11", "E15"]
prd_user_stories: ["E11-US2", "E15-US2"]
depends_on: ["ST-110", "ST-111"]
---

# ST-112 — Production Integration and Acceptance

## Outcome

The prompt-to-video run gains a visual-planning step between storyboard and
illustrations, with its allowance in brief estimates and budget reservations.
Design APIs accept v2; historical lessons get an explicit upgrade path; new
videos use v2 when `CREATIVE_DESIGN_V2_DEFAULT` is on. Three proof lessons —
the investigated lesson (reusing its narration and suitable assets), an
engineering lesson and a financial-literacy lesson — are rendered to MP4 and
reviewed at desktop and phone sizes.

## Acceptance Criteria

- [x] AC1 The investigated lesson shows ≥6 distinct composition families
      across its eight scenes, with images visible where selected.
- [x] AC2 No clipped text, unreadable contrast, caption collisions, or
      obstructive framing in any proof MP4.
- [x] AC3 Old snapshots keep their render behaviour; new snapshots have
      distinct cache identities.
- [x] AC4 A run completes without intervention when visual planning or an
      optional image fails; fallback frequency, composition distribution,
      image use, latency and cost are recorded.
- [x] AC5 Reviewed MP4s exist for all three proof lessons.

## Dev Agent Record

- **Agent:** Claude Code (Opus 5.5).
- **Started:** 2026-09-30.
- **Completed:** 2026-09-30. Accepted by the user the same day; Done.
- **Branch/PR:** `feat/st-107-video-brief-budget-self-repair` (commits
  852af5d, af971c7, 10bd3a2; the 2026-09-30 visual fixes are uncommitted). No
  PR.
- **Migrations:** None (ADR-015: v2 is stored in the existing columns).
- **Full detail:** [HANDOFF.md](HANDOFF.md).

### Files changed

- `apps/api`: `one-shot-runner.ts` (the `visual_plan` step, v2 illustrations
  and one design apply per storyboard), `one-shot-gateway.ts`,
  `creative-design.ts` (`requestVisualPlan`; `apply` takes the current
  storyboard's draft), `one-shot-budget.ts` (`one-shot-estimate-v3`),
  lesson validation (`decorativeAssetsOptional` under a v2 snapshot).
- `packages/config`, `.env.example`: `CREATIVE_DESIGN_V2_DEFAULT`.
- `docs/prompt-to-video-pilot.md`: stage map and budget.
- 2026-09-30 visual fixes, in `packages/scene-library/src/cinema/`:
  - shapes-only labelled diagrams are drawn from their labels: each callout
    runs to its own part of the shape (`shapePartPoints`), a `system` draws
    one node per label around a hub, and indexed markers sit on the parts;
  - annotated-diagram callouts fill the margins at up to 36px, level with
    their parts (was a fixed 24px stack at the top);
  - a comparison side with only a name is a card the size of that name;
  - the statement composition budgets its title line and gaps, so a full
    column no longer reaches the caption band;
  - a secondary headline line is dropped when it only repeats shown content;
  - a definition's connector leaves from the end of its term;
  - digits are estimated at their real width.

### Commands/tests

- `one-shot-runner-st112.test.ts` (15),
  `one-shot-visual-design.integration.test.ts` (7, Postgres), plus gateway,
  validation, budget and web cases.
- `shoot-cinema.mjs`: 876 pass / 0 fail (2026-09-30), with new shape fixtures,
  a full-column hook and a caption-margin check.
- Live run on the mock stack: storyboard → visual plan → pictures → render,
  with no stop.

### Screenshots/output

- Proof MP4s on real providers, total spend $1.75:
  `.runtime-logs/st112-investigated.mp4`, `st112-engineering.mp4`,
  `st112-finance.mp4`, with frames and contact sheets beside them.
- The investigated lesson shows 7 composition families across 8 scenes.

### Decisions/assumptions

- The code default of `CREATIVE_DESIGN_V2_DEFAULT` was false until the proof
  lessons were accepted, and is true since 2026-09-30
  (`packages/config/src/index.ts`, its test and `.env.example`).
- Decisions reuse the existing kinds, because ADR-015 allows no migration.

### Deviations

- The engineering run stopped at `BRIEF_PROMISE_UNMET` (146 s against a 180 s
  brief), which is ST-107's check and unrelated to the visuals; the lesson
  was then rendered directly.

### Known risks/follow-up

- AC2 and AC5 were accepted by the user on 2026-09-30 after the engineering
  lesson was re-rendered with the visual fixes
  (`.runtime-logs/st112-engineering-v2.mp4`, one plan call, $0.035). The
  agent reviewed frames only; the finance and investigated MP4s predate the
  fixes.
- The engineering MP4 still shows white-backed pictures on the dark Systems
  identity; the brief fix (`cinema-illustration-v2`) needs a paid
  re-generation to show.
- New storyboards now get a v2 design unless a deployment sets
  `CREATIVE_DESIGN_V2_DEFAULT=false`.
