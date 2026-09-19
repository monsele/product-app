---
story_id: ST-099
title: "Compose Creative Styles with Demonstration-Led Explanation"
phase: "08 — Product UI"
status: Ready
priority: should-have
epics: ["E11", "E15"]
prd_user_stories: ["E11-US2", "E15-US2"]
depends_on: ["ST-094", "ST-095", "ST-096", "ST-097", "ST-098"]
---

# ST-099 — Compose Creative Styles with Demonstration-Led Explanation

> **Scope placeholder.** This file records an identified gap and its boundary. It requires a full authoring pass — technical requirements, contracts, acceptance criteria, and tests — before any implementation is attempted. Do not implement from this stub.

## Story

As a teacher, I want a demonstration-led lesson to be told in my chosen creative style, so that explanatory movement and visual identity are one video rather than two separate product modes.

## Gap This Closes

`docs/video-style-templates-brainstorm.md` illustrates its central proposal with one savings lesson told four ways: Essential divides a coin, Editorial opens with a question and annotates a purchase, Systems flows income through a branching diagram, Everyday moves money between illustrated envelopes. Facts stay constant; visual storytelling changes.

No story in ST-094–ST-098 produces that. ST-095 and ST-096 pin appearance to `mvp-default` to isolate explanatory motion from creative style. ST-097 excludes demonstration work. ST-098 asserts capability *rejection* for style/approach combinations rather than support. The two features therefore ship complete and never compose.

That isolation was correct for the proofs. This story owns the join.

## Boundary and Open Questions

Settle these during authoring, before writing acceptance criteria:

- Does a style pack host a demonstration event plan, or does a recipe declare style-specific presentations? Whichever is chosen, the renderer keeps ownership of paths, coordinates, easing, and appearance per CR-01.
- Which ST-095 recipes and ST-097 treatments form the supported matrix. Unsupported pairs must return a structured capability rejection, not a silent fallback to `mvp-default`.
- Whether object identity and event anchors survive a style change, and what invalidates a resolved plan when a style changes but content does not.
- How an approach comparison stays controlled once style is no longer fixed across the pair (ST-096 currently freezes it).

## Required Reading

- `docs/video-style-templates-brainstorm.md` — proposals 1 and 2, and the per-style savings example.
- `docs/controlled-rendering-versioning-contract.md` — CR-01, CR-02, CR-04, CR-05, CR-06.
- ST-094, ST-095, ST-096, ST-097, ST-098 and their completed Dev Agent Records, evaluation reports, and ADRs.
- `AGENTS.md`, `STORY_INDEX.md`, current ADRs.

## Out of Scope (provisional)

- New recipes, new styles, or new semantic scene types.
- Arbitrary-topic demonstration support.
- Any change to ST-095's verified instructional event semantics.
