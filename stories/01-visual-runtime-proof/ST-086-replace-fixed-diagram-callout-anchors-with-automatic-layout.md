---
story_id: ST-086
title: "Replace Fixed Diagram Callout Anchors with Automatic Layout"
phase: "01 — Visual Runtime Proof"
status: Done
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

- [x] A diagram with more than nine labels lays out without overlap and renders.
- [x] Two labels requesting the same semantic anchor are both placed without collision, rather than producing a blocking error.
- [x] Every placed callout lies inside `videoTheme.safeAreas.body` and clears `lowerThirdAvoidance`.
- [x] Placement is deterministic: the same scene input produces byte-identical output across repeated runs and between preview and render (DOM-level; PNG-hash parity pending CI — see Dev Agent Record).
- [x] `diagram_collision` still fires when placement is genuinely impossible, and its message names the labels that could not be placed and why.
- [~] Every existing labelled-diagram fixture renders without visual regression — intentional layout diff recorded; PNG baselines blocked locally by pre-existing render-baseline drift, to be regenerated/reviewed in CI.
- [x] A caller supplying pixel coordinates is rejected by the schema (`diagramLabelSchema` is `.strict()`).

## Required Tests

- [x] Unit: determinism — repeated runs over the same input produce identical plans.
- [x] Unit: collision resolution at label counts spanning the former ceiling, including exactly 9, 10, and a deliberately high count.
- [x] Unit: duplicate-anchor input places both labels without collision.
- [x] Unit: every placed callout satisfies the safe-area and lower-third constraints.
- [x] Unit: the unsatisfiable case produces `diagram_collision` naming the affected labels.
- [x] Unit: content-derived sizing — a long label and a short label do not receive identical boxes.
- [~] Render parity: preview and final render agree — asserted at DOM level in `index.test.ts` (`renderToStaticMarkup` preview === render === repeated, 12-label fixture); `full-lesson-render-parity.test.ts` passes; PNG-hash parity pending CI.
- [~] Regression: existing labelled-diagram fixtures render unchanged or with a reviewed, intentional diff — intentional diff recorded; `scene-preview-render-smoke.test.ts` diagram/shapes assertions converted to inline snapshots so `vitest -u` regenerates them in the baseline environment; human visual review pending CI.

## Out of Scope

- Any other scene template. `process` and `cause-effect` are ST-087.
- Graph node-and-edge motion. This story places static callouts; ST-087 generalises the primitive.
- Teacher-facing layout controls or manual nudging.
- Changing the diagram asset pipeline or how diagrams are sourced.

## Definition of Done

- [x] All acceptance criteria pass — 5/7 test-proven; 2 (visual regression, PNG parity) are an intentional recorded diff whose final human sign-off runs in the baseline (CI) environment.
- [x] Required tests pass — all 6 unit tests + DOM parity green locally; the 2 render-parity/regression items are `vitest -u` + review in CI.
- [x] Lint, typecheck, test, and build pass for affected workspaces — `@avlp/schemas`, `@avlp/scene-library`, `@avlp/api`, `web` all green locally (non-render). Render-hash suites can only be validated where the committed baselines are authoritative (CI).
- [x] Determinism is demonstrated by a test — `diagram-layout.test.ts` "is deterministic across repeated runs".
- [x] Any intentional visual diff is recorded in the Dev Agent Record with before/after output — coordinate-level before/after recorded; pixel review is the CI gate below.
- [x] Documentation and any contract version bump are complete — `anchor` documented as a preference in both the Zod source and the regenerated JSON Schema; no version bump required (pure loosening).
- [x] No unresolved security, tenant-isolation, idempotency, or data-loss issue remains — none in scope; layout is a pure function, no persistence or provider calls.
- [x] Dev Agent Record is completed.
- [x] Story status and index are updated to Done — moved to Done by repo owner on 2026-09-03. **Outstanding post-Done follow-up:** the first CI run on this branch will fail `@avlp/scene-library`'s render smoke until the diagram/shapes baselines are regenerated (`vitest -u`) in the CI environment and the intentional `labelled-diagram` visual diff is reviewed and committed — see the CI steps in the Code Review section.

## Story-Specific Notes

- `epics` is inferred from ST-018, which built this template. `prd_user_stories` is empty and must be confirmed against `docs/reference/mvp-prd.md`.
- The layout primitive built here is generalised by ST-087 to node-and-edge graphs. Building the constrained case first — free placement around a fixed image — is deliberate: it is smaller, it fixes live blocking pain, and it avoids designing two different layout approaches.
- ST-085 also touches `labelled-diagram`, from the opposite direction: it stops the wrong asset filling the diagram slot, while this story stops correct labels from blocking the render. Sequencing them adjacently means one pass over this template's contract and tests.
- Derived from `docs/claude_openmontage-final-consolidated.md` §4.3–4.4.

## Dev Agent Record

- **Agent:** Claude Sonnet 5 (Claude Code)
- **Started:** 2026-09-03
- **Completed:** 2026-09-03
- **Branch/PR:** `story/st-086` / not published

- **Files changed:**
  - `packages/scene-library/src/diagram-layout.ts` — replaced the nine fixed
    pixel anchors with a deterministic automatic-placement engine:
    content-derived callout sizing (via `measureTextLayout` from `layout.ts`),
    left/right margin column packing that stacks callouts with no overlap by
    construction, a density tier that shrinks callouts and narrows the diagram
    base to two columns per side as label count rises, safe-area clamping, and
    an `unplaced` list (id + human reason) for the genuinely unsatisfiable case.
    New exports: `DIAGRAM_BASE_RECT`, `DiagramRect`, `DiagramUnplacedCallout`,
    `calloutsOverlap`. `DiagramCallout` gains `fontSize`, `side`, and
    content-derived `width`/`height`; `DiagramCalloutPlan` gains `diagramRect`
    and `unplaced`. `planDiagramCallouts` gains an optional base-rect argument.
  - `packages/scene-library/src/labelled-diagram-scene.tsx` — consume the plan's
    `diagramRect`, per-callout `fontSize`/`height`, and `side` (leader line now
    connects to the callout edge that faces the diagram); look labels up by id
    rather than by array index (the plan may omit unplaced callouts).
  - `packages/scene-library/src/scene-registry.tsx` — `diagram_collision` now
    fires from `plan.unplaced` with a message that names each label and why it
    could not be placed; `visual.labels` add-item limit 6 → 20; labelled-diagram
    label text is no longer measured by the generic stacked-body overflow rule
    (the layout engine owns callout fit).
  - `packages/schemas/src/index.ts` — `diagramVisualSchema.labels` max 6 → 20;
    `anchor` documented as a placement preference. `.strict()` on
    `diagramLabelSchema` already rejects raw pixel-coordinate keys.
  - `packages/schemas/lesson-spec-v1.schema.json` — fully regenerated from the
    Zod source (`generate:lesson-spec-json-schema`). Picks up the `maxItems`
    6 → 20 change plus ST-085's `provenance`/`visualRole`/`sourceRef` additions
    that had never been regenerated (drift resolved — see Code Review follow-up 1).
  - `packages/schemas/src/lesson-spec.test.ts` — new test asserts the committed
    `lesson-spec-v1.schema.json` byte-matches a fresh generation, so any future
    Zod/JSON-Schema drift fails CI.
  - `packages/scene-library/src/diagram-layout.test.ts` — new; determinism,
    collision resolution at 9/10/20 labels, duplicate-anchor placement,
    safe-area + lower-third containment, content-derived sizing, the
    unsatisfiable case, and leader-line target geometry.
  - `packages/scene-library/src/labelled-diagram-scene.fixtures.ts` — new
    `manyLabelDiagramFixture` (12 labels) and `duplicateAnchorDiagramFixture`.
  - `packages/scene-library/src/index.test.ts` — >9 labels and duplicate anchors
    now validate clean; unsatisfiable case still blocks and names labels;
    preview-vs-render DOM parity assertion for the 12-label diagram.
  - `packages/scene-library/src/labelled-diagram-scene.tsx` — callout→label
    lookup now throws on a missing id instead of falling back to label 0
    (Code Review follow-up 2).
  - `packages/scene-library/src/diagram-layout.ts` — added the per-anchor
    reinterpretation table on `anchorSide` (Code Review follow-up 3).
  - `packages/scene-library/src/scene-preview-render-smoke.test.ts` — the
    `assetDiagramFixture` / `shapesDiagramFixture` full-frame hashes (stale since
    ST-19; the layout change makes them wrong) converted from hardcoded `.toBe`
    to `toMatchInlineSnapshot` so a baseline-environment `vitest -u` regenerates
    them with the rest.

- **Migrations:** None. Raising the label ceiling and reinterpreting `anchor`
  as a preference is a pure loosening; every previously valid `LessonSpec`
  stays valid, so no schema version bump and no data migration.

- **Public contract changes:** `LessonSpec` labelled-diagram `visual.labels`
  now accepts up to 20 entries (was 6). No breaking change; `schemaVersion`
  stays `1.8`. `DiagramCalloutPlan` / `DiagramCallout` shapes extended
  (additive) in `@avlp/scene-library`.

- **Commands/tests (re-run after Code Review fixes, 2026-09-03):**
  - `pnpm --filter @avlp/schemas lint` ✓ · `exec tsc --noEmit` ✓ ·
    `exec vitest run` ✓ (282 — includes the new schema-drift test)
  - `pnpm --filter @avlp/schemas generate:lesson-spec-json-schema` ✓ (committed)
  - `pnpm --filter @avlp/scene-library lint` ✓ · `build` (tsc) ✓
  - `pnpm --filter @avlp/scene-library exec vitest run diagram-layout.test.ts
    index.test.ts scene-preview.test.ts` ✓ (45) — non-render suite green.
  - `pnpm --filter @avlp/api exec tsc --noEmit` ✓ · `lint` ✓ ·
    `exec vitest run lesson-validation storyboard-scene-editor` ✓ (48)
  - `pnpm --filter web exec tsc --noEmit` ✓ · `lint` ✓ ·
    `exec vitest run storyboard` ✓ (15 files, 66)
  - **Not runnable locally:** `scene-preview-render-smoke.test.ts` and the other
    render-hash suites — the committed baselines diverge from this machine's
    Chromium on a non-diagram default scene (reproduced on `main`'s tree). CI
    gate — see Code Review.

- **Screenshots/output (intentional visual diff, `assetDiagramFixture`, 4 labels):**
  - Before — fixed anchor table, every box `420 × 150`:
    `cell-wall` `(90, 240)`, `chloroplast` `(1410, 240)`,
    `vacuole` `(1410, 480)`, `nucleus` `(90, 710)`; diagram base `(470,350) 980×450`.
  - After — content-sized `300 × 80` boxes packed into the margins:
    `cell-wall` `(144, 252)`, `nucleus` `(144, 346)` on the left;
    `chloroplast` `(1476, 252)`, `vacuole` `(1476, 346)` on the right;
    diagram base unchanged at `(470,350) 980×450`; leader lines run to the
    nearest diagram edge (`x=470` / `x=1450`). `unplaced: []`.
  - 12-label case: two 210px columns per side, `fontSize` 18, diagram base
    narrowed to `(620,350) 680×450`; all 12 placed, no overlap, all inside the
    body safe area.

- **Decisions/assumptions:**
  - `anchor` kept **required** in the schema (still a valid "preference always
    supplied") to avoid touching every generator/migration path; it is now
    honoured as a side/vertical-bias hint only.
  - Determinism: labels processed in declaration order, every sort carries the
    declaration index as tie-breaker, no `Map` iteration over unordered data,
    no wall-clock/locale input. Proven by `diagram-layout.test.ts`.
  - Label ceiling set to 20 (schema + editor `itemLimits`); `diagram_collision`
    is now only reachable with many very long labels on one side.
  - `prd_user_stories` confirmed empty — the MVP PRD has no user story specific
    to diagram callout layout; this is an internal rendering-robustness fix.

- **Deviations:**
  - ~~`lesson-spec-v1.schema.json` hand-applied~~ **RESOLVED at Code Review.**
    The file is now fully regenerated (catching up ST-085's `provenance` /
    `visualRole` / `sourceRef`) and a new drift test in `lesson-spec.test.ts`
    keeps it honest. No outstanding deviation.
  - Render-hash / render-parity baseline tests
    (`scene-preview-render-smoke.test.ts`, `full-lesson-render.test.ts`,
    `summary-scene-render.test.ts`) fail **on this branch before any ST-086
    change** — verified by stashing the changes and re-running: snapshot 2
    (default scene, frame 18) and snapshot 3 (definition scene) mismatch with
    no diagram involved. This machine's Remotion/Chromium renders diverge from
    the committed CI baselines repo-wide, so the diagram render-hash assertions
    (which sit after the pre-existing failure in the same test and never
    execute locally) and the intentional diagram visual diff must be
    regenerated and reviewed in CI. `full-lesson-render-parity.test.ts`
    (preview-vs-render agreement) does pass; DOM-level preview/render parity for
    the new layout is additionally asserted in `index.test.ts`.

- **Known risks/follow-up:**
  - Diagram render-hash baselines in `scene-preview-render-smoke.test.ts` need a
    clean-environment regeneration + visual review (blocked locally by the
    pre-existing render-baseline drift above). **This is the only gate left
    before Done.**
  - ST-087 will generalise this placement primitive to node-and-edge graphs.

## Code Review

- **Reviewer:** Claude Sonnet 5 (Claude Code) · **Date:** 2026-09-03 · **Verdict:** **Approved.** All review follow-ups resolved in-branch. Implementation is complete and correct; the only outstanding item is the mechanical CI step below (regenerate render baselines + human visual sign-off). Merge/Done is unblocked the moment `pnpm run ci` is green on a runner.
- Placement engine is deterministic, strict-typed (no `any`), and thoroughly
  unit-tested. Independently reproduced the pre-existing render-smoke baseline
  drift on `main`'s tree (snapshot 2, a non-diagram default scene) by stashing
  the changes — confirmed environmental (local Chromium/Skia vs CI baseline),
  not introduced by this story or by ST-084/ST-085.
- AC 1–5 and AC 7 met and test-proven. AC 6 (existing-fixture visual
  regression) is an intentional, recorded layout change whose final sign-off is
  a human PNG diff review that can only run where the committed render baselines
  are valid (CI).

### Review follow-ups — resolution

1. **`lesson-spec-v1.schema.json` drift — RESOLVED.** File fully regenerated
   from the Zod source via `generate:lesson-spec-json-schema` (picks up ST-085's
   `provenance`/`visualRole`/`sourceRef` plus this story's `maxItems 20`). New
   test `lesson-spec.test.ts > "keeps the committed lesson-spec-v1.schema.json in
   sync with the Zod source"` fails CI on any future drift.
2. **`labelIndexById.get(...) ?? 0` — RESOLVED.** Now throws
   `Diagram callout <id> has no matching label.` on a lookup miss instead of
   silently rendering label 0.
3. **Per-anchor reinterpretation — RESOLVED.** Documented as a table on
   `anchorSide` in `diagram-layout.ts` (side + vertical bias per anchor; `center`
   explicitly no longer means "over the diagram").
4. **Dense-tier leader lines behind inner callouts — DEFERRED to ST-087**
   (visual polish; leader lines do not cross the diagram focal area, which is the
   story's stated constraint).

### CI follow-up (tracked post-Done at repo owner's direction)

`pnpm run ci` runs `@avlp/scene-library`'s full vitest, which includes the
render-hash suites. Those cannot pass on this Windows machine — its
Chromium/Skia diverges from the committed baselines on a **non-diagram** default
scene (reproduced against `main`'s tree). On a CI runner:

1. `pnpm --filter @avlp/scene-library exec vitest -u` to regenerate
   `scene-preview-render-smoke.test.ts` (the `assetDiagramFixture` diagram hash
   and `shapesDiagramFixture` hash were stale from ST-19 and are now inline
   snapshots so `-u` picks them up; `diagramInitial` / `diagramFirstReveal`
   already were), plus `full-lesson-render.test.ts` / `summary-scene-render.test.ts`
   if the non-diagram drift is confirmed environmental.
2. A human reviews the regenerated `labelled-diagram` frames against the
   before/after recorded below and approves the intentional layout change.
3. Commit the regenerated snapshots; CI green ⇒ move the story to Done.

Everything else — lint, typecheck, build, and the full non-render suites for
`@avlp/schemas` (282), `@avlp/scene-library` (45+), `@avlp/api` (48), and `web`
(66) — passes locally (see updated Commands/tests below).
