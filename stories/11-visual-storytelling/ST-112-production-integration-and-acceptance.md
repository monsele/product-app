---
story_id: ST-112
title: "Integrate V2 Visual Storytelling into Production and Prove It on Three Lessons"
phase: "11 — Visual Storytelling"
status: Ready
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

- [ ] AC1 The investigated lesson shows ≥6 distinct composition families
      across its eight scenes, with images visible where selected.
- [ ] AC2 No clipped text, unreadable contrast, caption collisions, or
      obstructive framing in any proof MP4.
- [ ] AC3 Old snapshots keep their render behaviour; new snapshots have
      distinct cache identities.
- [ ] AC4 A run completes without intervention when visual planning or an
      optional image fails; fallback frequency, composition distribution,
      image use, latency and cost are recorded.
- [ ] AC5 Reviewed MP4s exist for all three proof lessons.

## Dev Agent Record

- **Agent:**
- **Started:**
- **Completed:**
