---
story_id: ST-100
title: "Extend Composition Variety to the Remaining Semantic Scene Types"
phase: "08 — Product UI"
status: Blocked
priority: should-have
epics: ["E11", "E15"]
prd_user_stories: ["E11-US2"]
depends_on: ["ST-097", "ST-098"]
---

# ST-100 — Extend Composition Variety to the Remaining Semantic Scene Types

> **Scope placeholder.** This file records an identified gap and its boundary. It requires a full authoring pass — technical requirements, contracts, acceptance criteria, and tests — before any implementation is attempted. Do not implement from this stub.

## Story

As a teacher, I want every scene type in my lesson to carry my chosen style, so that a video does not revert to the default appearance partway through.

## Gap This Closes

`docs/video-style-templates-brainstorm.md` proposal 3 keeps all ten semantic scene types and gives each style compatible treatments across them. ST-097 delivers four — `hook`, `definition`, `process`, `comparison` — as a bounded pilot (3 styles × 4 types × 2 treatments = 24 combinations).

Six semantic types are unscheduled: input–process–output, cause-and-effect, labelled diagram, analogy, worked example, and summary. Confirm this list against the registry before authoring. Until they are covered, a styled lesson mixes styled and `mvp-default` scenes, which the brainstorm's evaluation criterion would fail on consistency grounds.

## Boundary and Open Questions

- Per-type treatment count: the brainstorm asks for "several"; ST-097 set a floor of two. Decide whether all six need alternatives immediately or whether one strong treatment per style ships first.
- Labelled diagram and worked example carry the highest information density and the strictest contain-fit and crop constraints. Confirm the ST-097 catalogue contract holds for them before committing to a count.
- Whether mixed styled/unstyled lessons remain valid during rollout, or whether a style becomes selectable only at full coverage.
- Summary and analogy interact with the brainstorm's rhythm guidance — see the open item below.

## Related Gap: Lesson-Level Rhythm

Brainstorm line 79 asks for a rhythm arc across the whole video — energetic opening, quieter explanatory sections, clear pauses for important diagrams, a concise recap. ST-097's planner treats pacing as one ranking component within per-scene interval bounds; there is no arc across the lesson. Decide during authoring whether this story owns that or whether it becomes a separate planner story.

## Required Reading

- `docs/video-style-templates-brainstorm.md` — proposal 3.
- `docs/controlled-rendering-versioning-contract.md` — CR-01, CR-05, CR-07.
- ST-094 and ST-097 with their Dev Agent Records, pack contracts, and ADRs.
- `AGENTS.md`, `STORY_INDEX.md`, current ADRs.

## Out of Scope (provisional)

- New style packs beyond Essential, Editorial, and Everyday.
- Demonstration-led approach work.
- Unrestricted custom layouts or general timeline editing.
