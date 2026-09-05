---
story_id: ST-091
title: "Structured Node and Edge Editor for Graph Process and Cause-Effect Scenes"
phase: "08 - Product UI"
status: Done
priority: should-have
epics: ["E11", "E12"]
prd_user_stories: []
depends_on: ["ST-056", "ST-087"]
---

# ST-091 — Structured Node and Edge Editor for Graph Process and Cause-Effect Scenes

## Story

As a teacher, I want to add, rename, connect, and remove the nodes of a graph
`process` or `cause-effect` scene, so that I can correct its structure without
switching the scene back to the flat list form and losing the automatic layout.

## Outcome

The schema-driven scene editor renders a structured control for `visual.nodes`
and `visual.edges` on graph-shape `process` and `cause-effect` scenes: node
label (and, for `cause-effect`, kind) editing, edge creation and deletion
between existing nodes, with the same dangling-reference, self-loop, and
duplicate-edge rules the schema already enforces surfaced inline before save.

## Required Reading

- `AGENTS.md`
- `docs/design.md` — read before proposing any user-facing surface
- `docs/ui-design-brief.md`
- `docs/reference/mvp-prd.md` — E11, E12
- `docs/reference/epic-technical-implementation-guide.md` — E11, E12 plus applicable cross-cutting sections
- `stories/05-editor-assets-versioning/ST-056-implement-schema-driven-scene-editing-and-template-switching.md`
- `stories/01-visual-runtime-proof/ST-087-pilot-graph-based-deterministic-motion-for-process-and-cause-effect-scenes.md`

## Dependencies

- ST-056
- ST-087

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

ST-087 introduced the graph `nodes` / `edges` contract but left the schema-driven
editor legacy-only: on a graph-shape scene the flat `visual.steps` /
`visual.causes` / `visual.effects` fields are hidden and a teacher can edit
narration and titles but not the graph structure. This story closes that gap.

## Problem

`sceneEditorControlValues` in `@avlp/schemas` has only `text`, `textarea`,
`text-list`, and `select`. None can represent an array of `{ id, label, kind? }`
nodes or `{ id, from, to }` edges, and `scene-editor-form.tsx`'s `writeField` /
`listValue` only understand the legacy shapes. As shipped in ST-087,
`editorFieldsForScene` filters the legacy visual fields out for a graph scene and
shows a read-only notice — correct but not editable.

The API already accepts a full valid graph scene through `updateScene`, and
`migrateStoryboardSceneTemplate` already resets `visual.nodes` / `visual.edges`
cleanly on a template switch, so the work is confined to the editor contract and
the web form.

## Scope

- [x] Add a structured editor control (e.g. `graph`) to `sceneEditorControlSchema`
      and describe `visual.nodes` / `visual.edges` for `process` and
      `cause-effect` in `templateEditorFields`.
- [x] Render the control in `apps/web` `scene-editor-form.tsx`: node label / kind
      editing, add / remove node, add / remove edge between existing nodes.
- [x] Surface the schema's graph rules (dangling reference, self-loop, duplicate
      edge, unique ids, ≥1 cause and ≥1 effect for `cause-effect`) inline before
      save; reuse the `@avlp/schemas` refinement, do not re-implement it.
- [x] Keep narration / title / duration / transition / on-screen-text editing
      unchanged for graph scenes.

## Out of Scope

- Free placement, coordinates, or motion controls — layout stays automatic.
- Editing legacy-shape scenes into graph shape (or vice versa) from the editor;
  template switch already resets between shapes.
- Storyboard generation emitting graph scenes — a separate concern.
- Any other scene template.

## Acceptance Criteria

- [x] A graph `process` scene shows an editor for its nodes and edges; a legacy
      `process` scene still shows the `visual.steps` list.
- [x] Adding an edge is limited to pairs of existing nodes; removing a node the
      teacher still references in an edge is prevented or cascades deterministically.
- [x] A save that would violate a schema graph rule is blocked with an inline
      message naming the offending node or edge.
- [x] Narration and title edits on a graph scene continue to save.
- [x] `updateScene` and `switchSceneTemplate` behaviour is unchanged for legacy
      scenes.

## Required Tests

- [x] Unit: the new control round-trips a node/edge collection through
      `writeField` / `fieldValue` without data loss.
- [x] Unit: `editorFieldsForScene` exposes the graph control only for graph-shape
      scenes.
- [x] Component: graph editor renders for a graph scene and not for a legacy one.
- [x] Integration: editing a node label on a graph scene persists through
      `updateScene`; an invalid edge is rejected with a field error.

## Definition of Done

- [x] All acceptance criteria pass.
- [x] Required tests pass.
- [x] Lint, typecheck, test, and build pass for `@avlp/schemas` and `apps/web`.
- [x] Shared contract (`sceneEditorControlSchema`) updated before its consumers.
- [x] Dev Agent Record completed.
- [x] Story status and index updated to Done.

## Story-Specific Notes

- Derived from the ST-087 code review follow-up ("wire schema-driven editor
  support for graph process / cause-effect scenes before storyboard generation
  is allowed to emit them").

## Dev Agent Record

- **Agent:** Codex
- **Started:** 2026-09-05
- **Completed:** 2026-09-05
- **Branch/PR:** `story/st-091`; no PR opened.
- **Files changed:** `packages/schemas/src/index.ts`; `apps/web/app/workspace/[projectId]/storyboard/scene-editor-form.tsx`; focused web/API tests; configuration, narration, and cross-screen Playwright test setup; `STORY_INDEX.md`; this record.
- **Migrations:** None.
- **Commands/tests:** `pnpm --filter @avlp/schemas lint`, `typecheck`, `test` (285 tests), and `build` passed. `pnpm --filter @avlp/api test -- storyboard-scene-editor.test.ts` passed (25 tests), covering graph node-label persistence and the exact dangling-edge field error. The post-fix focused web run passed 33 tests across the graph editor, configuration, narration, and cross-screen suites. `pnpm lint` and `pnpm typecheck` passed across all 16 packages. `pnpm --filter @avlp/web test` passed all 45 files / 216 tests. `pnpm build` passed across all 16 packages. A combined `pnpm run ci` attempt was stopped after workspace-wide concurrency starved existing browser/render tests and caused timeouts; the same timed-out web files passed in the isolated full-web run.
- **Screenshots/output:** Static component rendering test confirms the graph control is rendered; no visual screenshot captured.
- **Decisions/assumptions:** A single `graph` control is attached to `visual.nodes` and owns the related `visual.edges`; this preserves a compact inspector while exposing both collections. Node removal deterministically cascades connected edges. Client validation remains the existing `sceneSpecSchema` refinement; no graph rule is duplicated. Indexed refinement paths are retained and rendered beside the affected row, while collection-level refinements remain at the graph boundary. Edge selectors are normalized against the current scene on every render.
- **Deviations:** The pre-existing configuration/narration router mocks and one invalid cross-screen fixture were repaired because the owner requested all review findings be fixed.
- **Review findings fixed:** The graph component test renders the actual `SceneEditorForm` for graph and legacy scenes; API integration asserts the exact dangling-edge field error; indexed errors now name and describe the affected row; stale selectors normalize after scene navigation; graph controls use the shared button foundation and 36px minimum targets; the full web suite's nine deterministic failures are fixed.
- **Review conclusion:** Approved by the repository owner on 2026-09-05. No blocking, high, medium, or low in-scope findings remain; story marked `Done`.
- **Known risks/follow-up:** The compact control does not expose edge labels because graph edge labels are optional and outside the story's editing requirements. Graph node asset slots are preserved on edit but are not configured by this control.
