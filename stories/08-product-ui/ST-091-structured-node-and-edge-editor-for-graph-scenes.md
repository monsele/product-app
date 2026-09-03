---
story_id: ST-091
title: "Structured Node and Edge Editor for Graph Process and Cause-Effect Scenes"
phase: "08 - Product UI"
status: Ready
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

- [ ] Add a structured editor control (e.g. `graph`) to `sceneEditorControlSchema`
      and describe `visual.nodes` / `visual.edges` for `process` and
      `cause-effect` in `templateEditorFields`.
- [ ] Render the control in `apps/web` `scene-editor-form.tsx`: node label / kind
      editing, add / remove node, add / remove edge between existing nodes.
- [ ] Surface the schema's graph rules (dangling reference, self-loop, duplicate
      edge, unique ids, ≥1 cause and ≥1 effect for `cause-effect`) inline before
      save; reuse the `@avlp/schemas` refinement, do not re-implement it.
- [ ] Keep narration / title / duration / transition / on-screen-text editing
      unchanged for graph scenes.

## Out of Scope

- Free placement, coordinates, or motion controls — layout stays automatic.
- Editing legacy-shape scenes into graph shape (or vice versa) from the editor;
  template switch already resets between shapes.
- Storyboard generation emitting graph scenes — a separate concern.
- Any other scene template.

## Acceptance Criteria

- [ ] A graph `process` scene shows an editor for its nodes and edges; a legacy
      `process` scene still shows the `visual.steps` list.
- [ ] Adding an edge is limited to pairs of existing nodes; removing a node the
      teacher still references in an edge is prevented or cascades deterministically.
- [ ] A save that would violate a schema graph rule is blocked with an inline
      message naming the offending node or edge.
- [ ] Narration and title edits on a graph scene continue to save.
- [ ] `updateScene` and `switchSceneTemplate` behaviour is unchanged for legacy
      scenes.

## Required Tests

- [ ] Unit: the new control round-trips a node/edge collection through
      `writeField` / `fieldValue` without data loss.
- [ ] Unit: `editorFieldsForScene` exposes the graph control only for graph-shape
      scenes.
- [ ] Component: graph editor renders for a graph scene and not for a legacy one.
- [ ] Integration: editing a node label on a graph scene persists through
      `updateScene`; an invalid edge is rejected with a field error.

## Definition of Done

- [ ] All acceptance criteria pass.
- [ ] Required tests pass.
- [ ] Lint, typecheck, test, and build pass for `@avlp/schemas` and `apps/web`.
- [ ] Shared contract (`sceneEditorControlSchema`) updated before its consumers.
- [ ] Dev Agent Record completed.
- [ ] Story status and index updated to Done.

## Story-Specific Notes

- Derived from the ST-087 code review follow-up ("wire schema-driven editor
  support for graph process / cause-effect scenes before storyboard generation
  is allowed to emit them").

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
