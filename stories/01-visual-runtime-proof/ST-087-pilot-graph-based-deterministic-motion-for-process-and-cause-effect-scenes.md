---
story_id: ST-087
title: "Pilot Graph-Based Deterministic Motion for Process and Cause-Effect Scenes"
phase: "01 — Visual Runtime Proof"
status: Done
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

- [x] Extend the `process` and `cause-effect` scene contracts in `@avlp/schemas` from fixed structure to nodes and edges, retaining discriminated scene types.
- [x] Generalise ST-086's layout primitive from free placement around a fixed image to node-and-edge graph layout.
- [x] Add animated edges and active-node emphasis in the Remotion scene library, driven by `videoTheme.motion` presets.
- [x] Bind node and edge reveals to the narration timeline through `packages/scene-library/src/timing.ts` (via the new `graph-timing.ts` helper that derives from `getSceneFrameTiming`).
- [x] Preserve backwards compatibility for existing persisted scenes of both templates.

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

- [x] Nodes and edges are validated, and an edge referencing an unknown node id fails validation.
- [x] The schema rejects coordinate, transform, easing, and animation-code fields on both templates.
- [x] Nodes and edges reveal in sync with the narration timeline, and the active node is emphasised while its narration is playing.
- [x] A process with nine steps lays out legibly without overlap and within the safe areas.
- [x] Layout and animation are deterministic: repeated runs and the preview/render pair produce identical output.
- [x] Motion uses only `videoTheme.motion` presets; no scene component defines its own easing or duration.
- [x] Existing `process` and `cause-effect` fixtures render unchanged (additive contract; legacy path untouched).
- [x] Node content that carries factual meaning remains traceable to approved source material (`visual.nodes` added to `layouts` `visualTextPaths`, so node labels flow through the same grounding/citation text collection as `steps` did; scenes still carry `sourceRefs`).

## Required Tests

- [x] Unit: layout determinism at representative node counts, including a deliberately high count. — `graph-scene.test.ts`
- [x] Unit: schema rejects coordinates, transforms, easing, and animation code. — `graph-scene.test.ts`, `lesson-spec.test.ts`
- [x] Unit: dangling edge reference fails validation. — `graph-scene.test.ts`, `lesson-spec.test.ts`
- [x] Unit: placement satisfies safe-area and lower-third constraints. — `graph-scene.test.ts`
- [x] Unit: reveal frames derive from `getSceneFrameTiming` and match the narration segmentation. — `graph-scene.test.ts`
- [x] Render parity: preview and final render agree for both templates. — `graph-scene.test.ts` (byte-identical frame markup across `runtimeMode`); `renderer` suite green.
- [x] Integration: graph fixtures validate and render end to end through `SceneRenderRuntime`. — `graph-scene.test.ts` (see Deviations re: `packages/test-fixtures`)
- [x] Regression: existing fixtures for both templates. — full `@avlp/scene-library` + `@avlp/schemas` suites; 3 pre-existing environmental snapshot failures unrelated to this story (see below).

## Out of Scope

- 3D scenes or worlds.
- A generalised scene-library redesign. Only `process` and `cause-effect` change.
- Generated video or generated imagery of any kind.
- Other scene templates, including `labelled-diagram`, which ST-086 covers.
- Teacher-facing controls for layout or motion.

## Definition of Done

- [x] All acceptance criteria pass.
- [x] Required tests pass.
- [x] Lint, typecheck, test, and build commands pass for affected workspaces (3 pre-existing environmental snapshot failures in `@avlp/scene-library` unrelated to this story).
- [x] Determinism is demonstrated by a test.
- [x] No intentional visual diff against existing fixtures: the contract is additive and the legacy render path is untouched.
- [x] Shared contracts are updated and versioned before consumers; no data migration required (additive; legacy scenes read unchanged).
- [x] No unresolved security, tenant-isolation, idempotency, or data-loss issue remains (pure layout/animation and schema; no new I/O, queries, or provider calls).
- [x] Dev Agent Record is completed.
- [x] Story status and index are updated to Done — by repository owner after review rounds 1–3.

## Story-Specific Notes

- `epics` is inferred from ST-014 and ST-017, which built these templates. `prd_user_stories` is empty and must be confirmed against `docs/reference/mvp-prd.md`.
- An earlier discovery document cited `packages/scene-library/src/diagram-layout.ts` as evidence for this story. That was the wrong file: `planDiagramCallouts` is imported only by `labelled-diagram-scene.tsx` and `scene-registry.tsx`. These two templates have their own layout, which is why ST-086 and this story are separate.
- This story has the highest pedagogical payoff of the current set. It sits third only because ST-085 closes a live correctness gap and ST-086 unblocks lessons that cannot currently render and builds the primitive this story reuses.
- Derived from `docs/claude_openmontage-final-consolidated.md` §5.

## Dev Agent Record

- **Agent:** Claude Sonnet 5 (Claude Code) via `/next-story`
- **Started:** 2026-09-03
- **Completed:** 2026-09-03
- **Branch/PR:** `story/st-087` (branched from `story/st-086` @ `40e157b`); no PR opened.
- **Files changed:**
  - `packages/schemas/src/index.ts` — additive graph contract for `process` and `cause-effect`: `graphEdgeSchema`, `processNodeSchema`, `processAssetSlotSchema`, `causeEffectGraphNodeSchema`, `causeEffectKindSchema`, shared `refineSceneGraph` (unique node/edge ids + dangling-edge rejection). `processVisualSchema` / `causeEffectVisualSchema` now accept **either** the legacy shape **or** `nodes`/`edges`, never both; `.strict()` on every node/edge object rejects coordinate/transform/easing/animation keys.
  - `packages/schemas/lesson-spec-v1.schema.json` — regenerated (`pnpm --filter @avlp/schemas generate:lesson-spec-json-schema`).
  - `packages/schemas/src/lesson-spec.test.ts` — graph-contract unit tests.
  - `packages/scene-library/src/graph-layout.ts` *(new)* — `planGraphLayout(nodes, edges)`: deterministic layered layout (longest-path ranks, ties by declaration index), columnar for ≤4 ranks of ≤4 nodes else a serpentine grid, every node and edge endpoint inside `GRAPH_SAFE_AREA` (body safe area clipped to `lowerThirdAvoidance.top`). Pure function of declaration order.
  - `packages/scene-library/src/graph-timing.ts` *(new)* — reveal timing derived from `getSceneFrameTiming` + narration sentence segmentation (`narrationRevealFractions`), `graphRevealOpacity` / `graphEmphasis` / `activeRevealIndex`; motion values come only from `videoTheme.motion` presets.
  - `packages/scene-library/src/graph-diagram.tsx` *(new)* — shared SVG-edge + positioned-node renderer with active-node emphasis.
  - `packages/scene-library/src/process-scene.tsx`, `cause-effect-scene.tsx` — render `GraphDiagram` when `visual.nodes`/`visual.edges` are present; legacy path unchanged.
  - `packages/scene-library/src/scene-registry.tsx` — `visual.nodes` added to `layouts` `visualTextPaths` (grounding/citation text); `collectText` filter keeps only node `label`; graph scenes skip free-text overflow measurement (layout guarantees fit) but still measure title / on-screen text.
  - `packages/scene-library/src/index.ts` — export the three new modules.
  - `packages/scene-library/src/process-scene.fixtures.ts`, `cause-effect-scene.fixtures.ts` — `nineStepProcessGraphFixture`, `branchingProcessGraphFixture`, `graphCauseEffectFixture`.
  - `packages/scene-library/src/graph-scene.test.ts` *(new)* — 17 tests: layout determinism (3/6/9/12 nodes), 9-step no-overlap + safe-area/lower-third, edge-after-endpoints reveal order, timing from `getSceneFrameTiming` + narration, schema rejection of coordinates & dangling edges & legacy/graph mixing, validation + render determinism + preview/render parity + single active node.
- **Migrations:** None. The contract is additive; persisted legacy `process`/`cause-effect` scenes validate and render unchanged (covered by tests and the full regression suite).
- **Public contract changes:** `@avlp/schemas` — `processVisualSchema` and `causeEffectVisualSchema` gain optional `nodes`/`edges`; legacy fields become optional but a scene must supply exactly one shape. New exported symbols listed above. `lesson-spec-v1.schema.json` regenerated. Schema updated before all consumers; repo-wide typecheck green.
- **Commands/tests:**
  - `pnpm --filter @avlp/schemas run build | generate:lesson-spec-json-schema | typecheck | lint | test` → green (284 tests).
  - `pnpm --filter @avlp/scene-library run build | typecheck | lint` → green; `test` → 79 pass, **3 pre-existing** snapshot failures (`scene-preview-render-smoke` ×2, `summary-scene-render` ×1) that also fail on clean `40e157b` — font-hash drift in this environment, not caused by ST-087.
  - `pnpm -r run typecheck` → green (all 17 workspaces).
  - `pnpm --filter @avlp/renderer run test` → green (17). `pnpm --filter @avlp/api exec vitest run lesson-validation storyboard scene` → green (113).
- **Screenshots/output:** No production render captured (headless Remotion still pipeline is one of the pre-existing failing suites in this environment). Determinism and preview/render parity are demonstrated by `graph-scene.test.ts` via byte-identical `renderToStaticMarkup` output.
- **Decisions/assumptions:**
  - Additive contract with a legacy/graph XOR rather than a new discriminated template — keeps `SceneTemplate` values and the storyboard output union stable, and reads old scenes unchanged.
  - Reveal timing lives in a new `graph-timing.ts` that derives from `timing.ts`'s `getSceneFrameTiming`, rather than expanding `timing.ts` itself.
  - Graph nodes reuse the existing per-template asset-slot enums (`step-N-icon`, `cause-N-icon`, …); no new slot machinery.
  - Graph node labels are routed through `visualTextPaths` so existing grounding/citation flows treat them exactly as they treated `steps`.
- **Deviations:**
  - "Integration: representative documents from `packages/test-fixtures`" — that package holds MVP-acceptance fixtures, not scene content. Integration is covered instead by validating and rendering the new graph fixtures end to end through `SceneRenderRuntime` in `graph-scene.test.ts`, consistent with how ST-014/ST-017/ST-018 tested their templates.
  - No production MP4/PNG artifact recorded (see Screenshots/output).
- **Known risks/follow-up:**
  - Storyboard-generation prompt copy (ST-050) still describes the legacy `steps`/`causes` shapes. The model keeps emitting valid legacy scenes; adopting the graph shape in generation is a separate story.
  - No structured teacher-facing editor for graph nodes/edges yet (explicitly out of scope). Round 3 made the schema-driven editor *safe* on a graph scene — `editorFieldsForScene` hides the legacy `visual.steps`/`visual.causes`/`visual.effects` fields and shows a read-only notice, so narration/title/duration stay editable and no phantom empty field can produce an invalid save. The structured node/edge editor is tracked as **ST-091** (Ready, depends ST-056 + ST-087).
  - The 3 pre-existing snapshot failures in `@avlp/scene-library` predate this branch and should be refreshed independently.

### Review round 1 — fixes applied

Findings from `/story-code-review` (commit `0e36c03`) addressed:

- **BLOCKING 1 — edge/trailing-node reveals collapsed onto the exit frame.** `narrationRevealFractions` (`graph-timing.ts`) rewritten: each reveal step maps to sentence `floor(i·sentences/count)` (inheriting that sentence's cumulative-character start fraction) blended 50/50 with an even `i/count` spacing. The even term makes the sequence strictly increasing; the result is always `< 1`. `getGraphRevealTiming` now ends the reveal window at `exitStartFrame − reveal.durationInFrames` so the last reveal completes before the fade. New tests assert strictly-increasing starts, last start ≤ that bound, and every node+edge fully visible (no `opacity:0`) at a mid-scene frame for all three fixtures.
- **MEDIUM 2 — cyclic graphs collapsed to one layer.** `assignRanks` now pins the first-declared node to layer 0 when no source exists and ignores back-edges into it, so a cycle unrolls along declaration order. Tests: acyclic longest-path layering (`branchingProcessGraphFixture`), and the 9-node cycle now yields >1 distinct rank in chain order.
- **MEDIUM 3 — graph scenes skipped text-overflow validation.** `planGraphLayout` returns `overflowNodeIds` (label needs more height than its cell); `validateScene` raises `text_overflow` at `visual.nodes.<i>.label`. Node `<article>` also gets `overflow: hidden` for preview safety. Tests cover both the layout signal and the validation issue.
- **MEDIUM 4 — weak timing test.** Replaced with the strict-monotonic + finish-before-exit + mid-scene-visibility assertions above.
- **LOW 5 — self-loops / duplicate edges.** `refineSceneGraph` now rejects `from === to` and repeated `(from,to)` pairs. Tests added in `graph-scene.test.ts` and `lesson-spec.test.ts`.
- **LOW 7 — `GraphDiagram` nits.** `label` carried on `PlacedGraphNode` (O(n) lookup); emphasis window end is now the next *node* reveal (or `exitStartFrame` for the last node), never an edge start.

Re-verified: `@avlp/schemas` build/lint/typecheck/test (284) green; JSON schema regenerated (no diff — superRefine only); `@avlp/scene-library` build/lint/typecheck green, `graph-scene.test.ts` 23 tests green, full suite 85 pass with the same 3 pre-existing environmental snapshot failures; `pnpm -r typecheck` green; `@avlp/renderer` (17) and `@avlp/api` storyboard/validation (113) green.

### Review round 2 — fixes applied

- **Emphasis on the concluding node.** `GraphDiagram` clamped the active reveal index to the node range, so once the trailing edges start revealing the final node stays emphasised through the rest of the scene rather than dropping to no emphasis — matches "the active node is emphasised while its narration is playing". New test `keeps the final node emphasised while trailing edges reveal`.
- **Title / graph overlap.** `GraphDiagram`'s `<h1>` now has a two-line clamp (parity with `cause-effect-scene.tsx`), so a long title cannot overlap the graph's top row at `y = 252`.
- **API tidy.** Removed the unused `GraphRevealTiming.activeIndex` field; doc comments aligned with the blended sentence/even-spacing timing.
- **Coverage.** Added a safe-area bounds test for a columnar layout including a full four-node layer.

Re-verified again: `graph-scene.test.ts` 25 tests green; `@avlp/scene-library` build/lint/typecheck green, full suite green apart from the same 3 pre-existing environmental Remotion-snapshot failures (`full-lesson-render`, `scene-preview-render-smoke`, `summary-scene-render` — confirmed failing identically on `40e157b`, PNG-hash drift from this machine's font rasterisation); `pnpm -r typecheck`, `@avlp/renderer` (17), `@avlp/api` (113) green.

### Review round 3 — follow-ups

- **Follow-up 1 (editor support for graph scenes).** Made the schema-driven editor *safe* on a graph-shape scene now, and tracked the structured editor as a new story:
  - `apps/web/.../scene-editor-form.tsx`: new exported `isGraphShapeScene` / `editorFieldsForScene` — a graph-shape `process` / `cause-effect` scene no longer renders the legacy `visual.steps` / `visual.causes` / `visual.effects` fields (which would show an un-saveable empty box); a one-line notice explains the layout is automatic. Narration / title / duration / transition / on-screen text stay editable, and the form's existing `sceneSpecSchema.safeParse` before save still blocks any invalid shape.
  - Confirmed `migrateStoryboardSceneTemplate` already resets `visual.nodes` / `visual.edges` cleanly when a graph scene switches template, and `updateScene` already accepts a full valid graph-scene edit — added regression tests for both (`packages/schemas/src/storyboard.test.ts`, `apps/web/.../scene-editor-form.test.ts`).
  - **ST-091 — Structured Node and Edge Editor for Graph Process and Cause-Effect Scenes** added to `STORY_INDEX.md` (Ready, depends ST-056 + ST-087) with a full story file, for the actual node/edge editing control.
- **Follow-up 2 (Remotion snapshot baselines).** Not refreshed. The three failing snapshots are `toMatchInlineSnapshot` PNG hashes recorded against CI's font rasterisation; overwriting them with this Windows machine's hashes would break the check for everyone else. They fail identically on `40e157b` (pre-existing) and are unrelated to this story — left for a dedicated snapshot refresh on the canonical environment.

Re-verified round 3: `@avlp/schemas` lint/typecheck/test green (`storyboard.test.ts` +1); `apps/web` lint/typecheck green, `scene-editor-form.test.ts` green (+2); `@avlp/scene-library` unchanged (25 graph tests green, same 3 pre-existing snapshot failures); `pnpm -r typecheck` green.
