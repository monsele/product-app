---
story_id: ST-087
title: "Pilot Graph-Based Deterministic Motion for Process and Cause-Effect Scenes"
phase: "01 — Visual Runtime Proof"
status: Ready
priority: must-have
epics: ["E11"]
prd_user_stories: []
depends_on: ["ST-011", "ST-014", "ST-017", "ST-086"]
---

# ST-087 — Pilot Graph-Based Deterministic Motion for Process and Cause-Effect Scenes

## Story

As a teacher, I want process and cause-effect diagrams laid out and animated from their structure, so that an explanation with more than a few steps stays legible and the motion follows what the narration is currently saying.

## Outcome

`process` and `cause-effect` scenes describe nodes and edges rather than fixed structure. Layout is computed by the engine built in ST-086, generalised to graphs. Nodes and edges reveal in step with the narration timeline. No model ever supplies a pixel coordinate.

## Required Reading

- `AGENTS.md`
- `docs/reference/mvp-prd.md` — E11
- `docs/reference/epic-technical-implementation-guide.md` — E11 plus applicable cross-cutting sections
- `docs/video-quality-strategy.md`
- `docs/claude_openmontage-final-consolidated.md` — §1.4 item 7, §5
- `stories/01-visual-runtime-proof/ST-014-implement-the-process-or-sequence-scene-template.md`
- `stories/01-visual-runtime-proof/ST-017-implement-the-cause-and-effect-scene-template.md`
- `stories/01-visual-runtime-proof/ST-086-replace-fixed-diagram-callout-anchors-with-automatic-layout.md`

## Dependencies

- ST-011
- ST-014
- ST-017
- ST-086

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`. ST-086 is a hard prerequisite: this story generalises the layout primitive it builds, and starting here first would mean designing two different layout approaches.

## Problem

The immediate quality gap in AVLP's explainers is motion in explanatory diagrams, not a missing video-generation model. Spring motion, animated paths, and narration-aligned emphasis improve factual learning content directly, stay fully groundable, and cost no per-second provider fee.

`process-scene.tsx` and `cause-effect-scene.tsx` today render fixed structure. `cause-effect-scene.tsx` already carries a `nodes` concept, laid out in fixed columns for causes, mechanism, and effects. Neither imports `planDiagramCallouts`; they are a separate code path from ST-086's template, which is why this is a distinct story rather than the same one.

The consequence is that a process with three steps and a process with nine steps receive the same treatment, and nothing connects a step's appearance to the moment the narration reaches it.

## Scope

- [ ] Extend the `process` and `cause-effect` scene contracts in `@avlp/schemas` from fixed structure to nodes and edges, retaining discriminated scene types.
- [ ] Generalise ST-086's layout primitive from free placement around a fixed image to node-and-edge graph layout.
- [ ] Add animated edges and active-node emphasis in the Remotion scene library, driven by `videoTheme.motion` presets.
- [ ] Bind node and edge reveals to the narration timeline through `packages/scene-library/src/timing.ts`.
- [ ] Preserve backwards compatibility for existing persisted scenes of both templates.

## Technical Implementation Requirements

- **The schema must reject caller-supplied coordinates and animation code.** Nodes and edges express structure; the engine decides geometry. This is the boundary that keeps a model from authoring the visual directly.
- **Determinism is non-negotiable**, for the same reason as ST-086: identical input must produce identical layout and identical frames, or preview and render diverge.
- Motion must use the existing named presets in `videoTheme.motion` (`enter`, `exit`, `emphasize`, `reveal`). Do not introduce ad-hoc easing curves or durations in the scene components.
- Reveal timing derives from `getSceneFrameTiming` and the scene's narration, not from arbitrary per-node delays chosen at authoring time.
- Layout must respect `videoTheme.safeAreas` and `lowerThirdAvoidance`.
- Where a node carries factual meaning, it must remain source-grounded: this story must not create a path by which structure is invented rather than derived from the approved document.
- Existing fixtures for both templates must continue to render. If the contract change is not backwards compatible, ship a migration and say so explicitly.

## Contracts and Persistence

- `process` and `cause-effect` visual contracts gain node and edge collections with stable ids.
- Edge definitions reference node ids; the schema must reject dangling references.
- No pixel, coordinate, transform, or easing field is added to any scene contract.
- A migration is required if existing persisted scenes cannot be read by the new contract; prefer an additive contract that reads old scenes unchanged.

## Interfaces

- `packages/scene-library/src/process-scene.tsx`
- `packages/scene-library/src/cause-effect-scene.tsx`
- The generalised layout module extracted in ST-086
- Scene validation in `packages/scene-library/src/scene-registry.tsx`

## Acceptance Criteria

- [ ] Nodes and edges are validated, and an edge referencing an unknown node id fails validation.
- [ ] The schema rejects coordinate, transform, easing, and animation-code fields on both templates.
- [ ] Nodes and edges reveal in sync with the narration timeline, and the active node is emphasised while its narration is playing.
- [ ] A process with nine steps lays out legibly without overlap and within the safe areas.
- [ ] Layout and animation are deterministic: repeated runs and the preview/render pair produce identical output.
- [ ] Motion uses only `videoTheme.motion` presets; no scene component defines its own easing or duration.
- [ ] Existing `process` and `cause-effect` fixtures render unchanged, or with a reviewed intentional diff.
- [ ] Node content that carries factual meaning remains traceable to approved source material.

## Required Tests

- [ ] Unit: layout determinism at representative node counts, including a deliberately high count.
- [ ] Unit: schema rejects coordinates, transforms, easing, and animation code.
- [ ] Unit: dangling edge reference fails validation.
- [ ] Unit: placement satisfies safe-area and lower-third constraints.
- [ ] Unit: reveal frames derive from `getSceneFrameTiming` and match the narration segmentation.
- [ ] Render parity: preview and final render agree for both templates.
- [ ] Integration: representative documents from `packages/test-fixtures` produce renderable scenes end to end.
- [ ] Regression: existing fixtures for both templates.

## Out of Scope

- 3D scenes or worlds.
- A generalised scene-library redesign. Only `process` and `cause-effect` change.
- Generated video or generated imagery of any kind.
- Other scene templates, including `labelled-diagram`, which ST-086 covers.
- Teacher-facing controls for layout or motion.

## Definition of Done

- [ ] All acceptance criteria pass.
- [ ] Required tests pass.
- [ ] Lint, typecheck, test, and build commands pass for affected workspaces.
- [ ] Determinism is demonstrated by a test.
- [ ] Any intentional visual diff against existing fixtures is reviewed and recorded in the Dev Agent Record with before and after output.
- [ ] Shared contracts are updated and versioned before consumers; any migration is written and applied cleanly.
- [ ] No unresolved security, tenant-isolation, idempotency, or data-loss issue remains.
- [ ] Dev Agent Record is completed.
- [ ] Story status and index are updated to Done.

## Story-Specific Notes

- `epics` is inferred from ST-014 and ST-017, which built these templates. `prd_user_stories` is empty and must be confirmed against `docs/reference/mvp-prd.md`.
- An earlier discovery document cited `packages/scene-library/src/diagram-layout.ts` as evidence for this story. That was the wrong file: `planDiagramCallouts` is imported only by `labelled-diagram-scene.tsx` and `scene-registry.tsx`. These two templates have their own layout, which is why ST-086 and this story are separate.
- This story has the highest pedagogical payoff of the current set. It sits third only because ST-085 closes a live correctness gap and ST-086 unblocks lessons that cannot currently render and builds the primitive this story reuses.
- Derived from `docs/claude_openmontage-final-consolidated.md` §5.

## Dev Agent Record

- **Agent:**
- **Started:**
- **Completed:**
- **Branch/PR:**
- **Files changed:**
- **Migrations:**
- **Commands/tests:**
- **Screenshots/output:**
- **Decisions/assumptions:**
- **Deviations:**
- **Known risks/follow-up:**
