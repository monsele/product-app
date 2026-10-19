---
story_id: ST-123
title: Manual design-system authoring and deterministic custom rendering
phase: "13"
status: Ready
depends_on: [ST-122]
epics: [E11, E12, E15, E16, E17]
---

# ST-123 - Manual design-system authoring and deterministic custom rendering

Implement step 2 of docs/bring-your-own-design-system.md under ADR-017 after
ST-122 is Done. Read docs/design.md before UI work. Add My Design Systems in the
workspace and design panel, import/revision editing, exact locks and advisory
principles. Add a new manifest release for independent custom identities with
bounded composition/motion controls, pinned fonts and assets, final-font preflight,
and identical browser/server loading. Keep v1/v2 output unchanged. Block missing
glyphs/assets and unsupported locked requirements with actionable errors.

Acceptance: demonstrate two custom systems with visibly different hierarchy,
composition and motion on the same content, readable desktop/phone output,
keyboard/error states, revision conflict recovery, immutable historical render
parity, tenant isolation, schema/render/visual regression tests and MP4 review.

Out of scope: AI interpretation, conversational refinement, proof generation,
automatic project application, live integrations, arbitrary code/coordinates.

## Dev Agent Record

Not started. ST-122 approved and marked Done by the product owner on 2026-10-19; this story is Ready.
