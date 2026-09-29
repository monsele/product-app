---
story_id: ST-111
title: "Make Motion Follow the Narration with Anchored Visual Beats"
phase: "11 — Visual Storytelling"
status: Ready
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

- [ ] AC1 Anchor resolution is deterministic, monotonic, clamped to the scene
      and falls back to proportional sentence timing without captions.
- [ ] AC2 Seeking to any frame yields the same state as playing to it.
- [ ] AC3 A scene longer than 12 s has at least two focus changes.
- [ ] AC4 No beat starts inside the final readable hold; no element enters the
      caption safe area.
- [ ] AC5 Preview and render resolve identical beat frames for a lesson version.

## Required Tests

- [ ] Resolver unit tests (phrase, sentence, missing captions, clamping).
- [ ] Seek parity and preview/render parity tests.

## Dev Agent Record

- **Agent:**
- **Started:**
- **Completed:**
