---
story_id: ST-086
title: "Replace Fixed Diagram Callout Anchors with Automatic Layout"
phase: "01 — Visual Runtime Proof"
status: Ready
priority: must-have
epics: ["E11", "E13"]
prd_user_stories: []
depends_on: ["ST-011", "ST-018"]
---

# ST-086 — Replace Fixed Diagram Callout Anchors with Automatic Layout

## Story

As a teacher, I want diagram labels placed automatically without overlapping, so that a diagram with many labels renders instead of blocking on a manual re-anchoring task I have no good way to solve.

## Outcome

Callout placement is computed from label content and diagram geometry, resolving collisions rather than reporting them. The nine-label ceiling is removed, and `diagram_collision` becomes a rare last-resort error instead of a routine one.

## Required Reading

- `AGENTS.md`
- `docs/reference/mvp-prd.md` — E11, E13
- `docs/reference/epic-technical-implementation-guide.md` — E11, E13 plus applicable cross-cutting sections
- `docs/video-quality-strategy.md`
- `docs/claude_openmontage-final-consolidated.md` — §4.3, §4.4
- `stories/01-visual-runtime-proof/ST-018-implement-the-labelled-diagram-scene-template.md`

## Dependencies

- ST-011
- ST-018

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Problem

A labelled diagram whose callouts overlap is un-renderable today, and the only remedy offered to the teacher is manual re-anchoring.

`packages/scene-library/src/diagram-layout.ts` maps nine named anchors (`top-left`, `top`, `top-right`, `right`, `bottom-right`, `bottom`, `bottom-left`, `left`, `center`) to hardcoded pixel coordinates, with every callout fixed at 420 × 150. `planDiagramCallouts` runs a pairwise overlap test and returns `collisionLabelIds`. It resolves nothing.

`packages/scene-library/src/scene-registry.tsx:665` turns that into a blocking error:

```tsx
if (collisionLabelIds.length > 0)
  return [Object.freeze({
    code: "diagram_collision" as const,
    fieldPath: "visual.labels",
    message: `Diagram callouts overlap: ${collisionLabelIds.join(", ")}.`,
    severity: "error" as const,
    suggestedCorrection: "Choose distinct semantic anchors for the affected labels.",
  })];
```

`severity: "error"`, and `validationIssueSchema` permits acknowledgement only for warnings, so errors always block. Two consequences follow:

- **A hard ceiling of nine labels per diagram.** A tenth label must reuse an anchor, and reused anchors produce identical boxes, which always overlap.
- **A blocking failure whenever the planner emits a duplicate anchor**, with a correction the teacher must apply by hand, one label at a time.

The nine fixed positions are tuned not to collide with one another, so in practice overlap means two labels claimed the same anchor rather than that the diagram is genuinely crowded. That makes this a solvable layout problem, not an inherent limit.

`planDiagramCallouts` is imported by exactly two files — `labelled-diagram-scene.tsx:8` and `scene-registry.tsx:39`. Neither `process-scene.tsx` nor `cause-effect-scene.tsx` uses it, so the blast radius of this change is one template plus its validation.

## Scope

- [ ] Replace the fixed anchor table in `packages/scene-library/src/diagram-layout.ts` with an automatic placement algorithm that resolves overlap rather than reporting it.
- [ ] Size each callout from its label content instead of assuming 420 × 150.
- [ ] Preserve the semantic anchor as a placement *preference* where an author supplies one; never accept raw pixel coordinates from any caller.
- [ ] Keep `diagram_collision` for genuinely unsatisfiable cases, with a message that says why placement failed rather than instructing the teacher to re-anchor.
- [ ] Update `scene-registry.tsx` validation and `labelled-diagram-scene.tsx` rendering to consume the new plan shape.

## Technical Implementation Requirements

- **Determinism is non-negotiable.** Identical input must produce identical placement on every run, or preview and final render will diverge and render-parity tests will fail intermittently. No randomness, no iteration-order dependence on unordered collections, no wall-clock or locale input.
- Placement must respect `videoTheme.safeAreas` and `lowerThirdAvoidance` from `@avlp/design-system/video-theme`. A callout outside the safe area is as broken as one that overlaps.
- Leader lines must continue to connect each callout to its `targetX`/`targetY` on the diagram, and must not cross the diagram's focal area where avoidable.
- The anchor preference stays part of the contract. Authors and the planner keep expressing intent semantically; the layout engine decides pixels.
- Callout measurement should reuse the existing text measurement approach in `packages/scene-library/src/layout.ts` rather than introducing a second, divergent estimate.
- The algorithm should degrade predictably: as label count rises, callouts get smaller or shift outward, and the failure mode at the extreme is one clear error naming the labels that could not be placed.

## Contracts and Persistence

- `DiagramCalloutPlan` gains resolved geometry per callout and a reason when placement fails.
- `DiagramCallout` gains content-derived `width` and `height` rather than the current constants.
- The `DiagramAnchor` field in `@avlp/schemas` remains, reinterpreted as a preference. No schema-breaking change is expected; confirm during implementation and version the contract if one is required.
- No migration is expected. Existing scenes carry anchors that remain valid as preferences.

## Interfaces

- `planDiagramCallouts(labels, diagramGeometry)` in `packages/scene-library/src/diagram-layout.ts`.
- `LabelledDiagramScene` in `packages/scene-library/src/labelled-diagram-scene.tsx`.
- Scene validation in `packages/scene-library/src/scene-registry.tsx`.

## Acceptance Criteria

- [ ] A diagram with more than nine labels lays out without overlap and renders.
- [ ] Two labels requesting the same semantic anchor are both placed without collision, rather than producing a blocking error.
- [ ] Every placed callout lies inside `videoTheme.safeAreas.body` and clears `lowerThirdAvoidance`.
- [ ] Placement is deterministic: the same scene input produces byte-identical output across repeated runs and between preview and render.
- [ ] `diagram_collision` still fires when placement is genuinely impossible, and its message names the labels that could not be placed and why.
- [ ] Every existing labelled-diagram fixture renders without visual regression.
- [ ] A caller supplying pixel coordinates is rejected by the schema.

## Required Tests

- [ ] Unit: determinism — repeated runs over the same input produce identical plans.
- [ ] Unit: collision resolution at label counts spanning the former ceiling, including exactly 9, 10, and a deliberately high count.
- [ ] Unit: duplicate-anchor input places both labels without collision.
- [ ] Unit: every placed callout satisfies the safe-area and lower-third constraints.
- [ ] Unit: the unsatisfiable case produces `diagram_collision` naming the affected labels.
- [ ] Unit: content-derived sizing — a long label and a short label do not receive identical boxes.
- [ ] Render parity: preview and final render agree for representative diagrams.
- [ ] Regression: existing labelled-diagram fixtures in `packages/test-fixtures` render unchanged or with a reviewed, intentional diff.

## Out of Scope

- Any other scene template. `process` and `cause-effect` are ST-087.
- Graph node-and-edge motion. This story places static callouts; ST-087 generalises the primitive.
- Teacher-facing layout controls or manual nudging.
- Changing the diagram asset pipeline or how diagrams are sourced.

## Definition of Done

- [ ] All acceptance criteria pass.
- [ ] Required tests pass.
- [ ] Lint, typecheck, test, and build commands pass for affected workspaces.
- [ ] Determinism is demonstrated by a test, not asserted in review.
- [ ] Any intentional visual diff against existing fixtures is reviewed and recorded in the Dev Agent Record with before and after output.
- [ ] Documentation and any contract version bump are complete.
- [ ] No unresolved security, tenant-isolation, idempotency, or data-loss issue remains.
- [ ] Dev Agent Record is completed.
- [ ] Story status and index are updated to Done.

## Story-Specific Notes

- `epics` is inferred from ST-018, which built this template. `prd_user_stories` is empty and must be confirmed against `docs/reference/mvp-prd.md`.
- The layout primitive built here is generalised by ST-087 to node-and-edge graphs. Building the constrained case first — free placement around a fixed image — is deliberate: it is smaller, it fixes live blocking pain, and it avoids designing two different layout approaches.
- ST-085 also touches `labelled-diagram`, from the opposite direction: it stops the wrong asset filling the diagram slot, while this story stops correct labels from blocking the render. Sequencing them adjacently means one pass over this template's contract and tests.
- Derived from `docs/claude_openmontage-final-consolidated.md` §4.3–4.4.

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
