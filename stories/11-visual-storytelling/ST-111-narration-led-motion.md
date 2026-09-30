---
story_id: ST-111
title: "Make Motion Follow the Narration with Anchored Visual Beats"
phase: "11 — Visual Storytelling"
status: In Review
priority: must-have
epics: ["E11", "E15"]
prd_user_stories: ["E11-US2", "E15-US2"]
depends_on: ["ST-109"]
---

# ST-111 — Narration-Led Motion

## Story

As a learner, I want the part of the picture the narrator is talking about
to appear or light up as it is mentioned, so that I know where to look.

## Outcome

Four registered motion families (sequential reveal, path/relationship build,
emphasis/highlight, object transformation) drive v2 compositions. Beats are
anchored to narration sentences or exact phrases and resolve to frames by a
pure function of the pinned caption cues and scene duration, so preview and
render agree and seeking is exact. Long scenes change focus across successive
beats; readable holds and caption space are preserved; transitions stay
within scene boundaries and never alter the audio timeline.

## Acceptance Criteria

- [x] AC1 Anchor resolution is deterministic, monotonic, clamped to the scene
      and falls back to proportional sentence timing without captions.
- [x] AC2 Seeking to any frame yields the same state as playing to it.
- [x] AC3 A scene longer than 12 s has at least two focus changes.
- [x] AC4 No beat starts inside the final readable hold; no element enters the
      caption safe area.
- [x] AC5 Preview and render resolve identical beat frames for a lesson version.

## Required Tests

- [ ] Resolver unit tests (phrase, sentence, missing captions, clamping).
- [ ] Seek parity and preview/render parity tests.

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

- `packages/schemas/src/creative-design-v2.ts`: beats,
  `resolveCinemaBeatFrames`, `captionMsToFrame`, `cinemaTimingSchema`,
  `resolveCinemaTiming`.
- `packages/scene-library/src/cinema/beats.tsx`, `cinema-scene.tsx`.
- `apps/api/src/scene-captions.ts` (new), `lesson-versions.ts` (pins
  `cinemaTiming` for a v2 design whose every scene has captions),
  `renders.ts` (`assertPinnedCaptionsUnchanged`), `apps/renderer/src/fixture.ts`.

### Commands/tests

- `cinema.test.tsx`: beat timeline and frame-by-frame versus out-of-order
  seek parity. `timing-parity.test.ts` (4): version, render and scene-preview
  resolve identical frames.
- API: `lesson-versions.test.ts`, `renders.test.ts`,
  `scene-captions.integration.test.ts` (Postgres).

### Decisions/assumptions

- One `captionMsToFrame` with the render's arithmetic, so approved videos
  re-render identically.

### Deviations

- Found and fixed: preview and render converted caption times to frames
  differently, disagreeing by one frame at 137 cue boundaries per 10 minutes.
- Behaviour change: rendering a v2 version after its audio or captions were
  regenerated now fails with a 409 ("Save a new version, then render it").

### Known risks/follow-up

- None beyond ST-112's review.
