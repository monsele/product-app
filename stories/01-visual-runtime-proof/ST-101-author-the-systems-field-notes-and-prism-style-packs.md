---
story_id: ST-101
title: "Author the Systems, Field Notes, and Prism Style Packs"
phase: "01 — Visual Runtime Proof"
status: Blocked
priority: should-have
epics: ["E11", "E15"]
prd_user_stories: ["E11-US2"]
depends_on: ["ST-094", "ST-097", "ST-098"]
---

# ST-101 — Author the Systems, Field Notes, and Prism Style Packs

> **Scope placeholder.** This file records an identified gap and its boundary. It requires a full authoring pass — technical requirements, contracts, acceptance criteria, and tests — before any implementation is attempted. Do not implement from this stub.

## Story

As a teacher of a technical, observational, or introductory subject, I want a style whose visual language suits my material, so that a diagram-led or documentary lesson is not forced into an object-led or photographic direction.

## Gap This Closes

`docs/video-style-templates-brainstorm.md` proposes six directions. Its own recommended priority selects Essential, Editorial, and Everyday for the first expansion, which ST-094 and ST-097 deliver. Systems, Field Notes, and Prism are listed out of scope in ST-094, ST-097, and ST-098 and are otherwise unscheduled.

| Direction | Visual identity | Motion signature |
| --- | --- | --- |
| Systems | Deep ink or pale neutral backgrounds; fine connectors; precise diagrams; selective colour gradients | Paths trace relationships, signals move through systems, diagrams reorganise as the explanation develops |
| Field Notes | Paper tones, graphite, rust, olive; documentary images; clean annotations; a readable handwritten accent | Lines draw on, observations attach to objects, diagrams build step by step |
| Prism | Saturated colour fields, oversized type, bold geometric cutouts, strong contrast | Shapes become diagrams, words become labels, rhythmic transitions create chapter changes |

## Architecture Risk This Also Addresses

ST-094 proves reuse across *subjects* (AC8), not across *styles*. All three proven directions are object-, photograph-, or illustration-led. Systems is the structurally different one: traced connector paths, signals moving through a system, and diagrams reorganising mid-explanation are closer to the demonstration runtime's concerns than to a static treatment.

If the `StyleTokens` / `SceneTreatment` split in ST-094's proposed ADR only ever meets three similar directions, the risk that it does not extend surfaces after ST-097 has already committed persistence, migrations, and render identity around it.

Authoring a single Systems treatment early — before or during ST-097 — would test the contract cheaply. Consider promoting that slice ahead of this story.

## Boundary and Open Questions

- Whether Systems needs shared mechanics from ST-095's event runtime, and if so whether that makes it dependent on ST-099 rather than a pure pack-authoring story.
- Field Notes' handwritten accent: pinned font files with checksums per CR-02, not a system or environment-dependent fallback.
- Prism's strong contrast and rhythmic transitions against caption readability and safe areas per CR-07.
- Whether all three ship together or one at a time, given each needs its own asset family and style boards.

## Required Reading

- `docs/video-style-templates-brainstorm.md` — proposal 1 and the creative evaluation criterion.
- `docs/creative-styles-technical-research.md` — style-pack contract and asset/font handling.
- `docs/controlled-rendering-versioning-contract.md` — CR-02, CR-03, CR-05, CR-07.
- ST-094 and ST-097 with their pack contracts, treatment registry, ADRs, and evaluation reports.
- `AGENTS.md`, `STORY_INDEX.md`, current ADRs.

## Out of Scope (provisional)

- New semantic scene types or demonstration recipes.
- Reference-based style creation.
- Any change to the three shipped directions' appearance.
