import {
  createDefaultStoryboardSceneSpec,
  sceneEditorMetadata,
  sceneSpecSchema,
  type SceneSpec,
  type StoryboardSceneDetailResponse,
} from "@avlp/schemas";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  editorFieldsForScene,
  canAddGraphEdge,
  fieldValue,
  graphFieldErrors,
  GraphEditor,
  type GraphEditorValue,
  isGraphShapeScene,
  normalizeGraphEdgeSelection,
  SceneEditorForm,
  writeAssetSlot,
  writeField,
} from "./scene-editor-form";

const sceneId = "019ffbf1-6151-738a-b087-6775ff97568c";
const suggestedAssetId = "019ffbf1-a001-7000-8000-000000000001";
const teacherAssetId = "019ffbf1-a002-7000-8000-000000000001";

function sceneDetail(scene: SceneSpec): StoryboardSceneDetailResponse {
  return {
    sceneRevision: 0,
    scene: {
      id: scene.id,
      stableSceneId: scene.id,
      order: scene.order,
      template: scene.template,
      durationSeconds: scene.durationSeconds,
      narrationBlockIds: [],
      assetRequirements: [],
      scene,
    },
    status: {
      assets: "none",
      audio: "not_generated",
      captions: "not_generated",
      validation: "ok",
      stale: false,
    },
  };
}

describe("writeAssetSlot", () => {
  it("restores the suggested binding after a teacher replacement", () => {
    const suggested = writeAssetSlot(
      createDefaultStoryboardSceneSpec("definition", {
        id: sceneId,
        order: 1,
        durationSeconds: 30,
      }),
      "diagram",
      suggestedAssetId,
    );
    const replacement = writeAssetSlot(suggested, "diagram", teacherAssetId);
    const restored = writeAssetSlot(replacement, "diagram", suggestedAssetId);

    expect(replacement.assetBindings).toEqual([
      expect.objectContaining({ assetId: teacherAssetId, slot: "diagram" }),
    ]);
    expect(restored.assetBindings).toEqual([
      expect.objectContaining({ assetId: suggestedAssetId, slot: "diagram" }),
    ]);
  });
});

describe("labelled-diagram mode", () => {
  it("removes an unused diagram binding when switching to built-in shapes", () => {
    const assetDiagram = sceneSpecSchema.parse({
      ...createDefaultStoryboardSceneSpec("labelled-diagram", {
        id: sceneId,
        order: 1,
        durationSeconds: 30,
      }),
      template: "labelled-diagram",
      visual: {
        baseAssetSlot: "diagram",
        kind: "asset",
        labels: [{ anchor: "top", id: "pillar", text: "Budgeting" }],
      },
    });
    const diagram = writeAssetSlot(
      assetDiagram,
      "diagram",
      suggestedAssetId,
    );
    const kindField = sceneEditorMetadata("labelled-diagram").fields.find(
      (field) => field.path === "visual.kind",
    );

    expect(kindField).toBeDefined();
    const shapes = writeField(diagram, kindField!, "shapes");

    expect(shapes.assetBindings).toEqual([]);
    expect(shapes.visual).toMatchObject({ kind: "shapes" });
    expect("baseAssetSlot" in shapes.visual).toBe(false);
  });
});

describe("editorFieldsForScene (ST-087 graph shape)", () => {
  const graphProcess = sceneSpecSchema.parse({
    ...createDefaultStoryboardSceneSpec("process", {
      id: sceneId,
      order: 1,
      durationSeconds: 20,
    }),
    visual: {
      nodes: [
        { id: "a", label: "Start" },
        { id: "b", label: "End" },
      ],
      edges: [{ id: "e1", from: "a", to: "b" }],
    },
  }) as SceneSpec;

  it("recognises a graph-shape process scene", () => {
    expect(isGraphShapeScene(graphProcess)).toBe(true);
    expect(
      isGraphShapeScene(
        createDefaultStoryboardSceneSpec("process", {
          id: sceneId,
          order: 1,
          durationSeconds: 20,
        }),
      ),
    ).toBe(false);
  });

  it("hides the legacy `visual.steps` field for a graph-shape scene", () => {
    const legacy = createDefaultStoryboardSceneSpec("process", {
      id: sceneId,
      order: 1,
      durationSeconds: 20,
    });
    expect(editorFieldsForScene(legacy).map((field) => field.path)).toContain(
      "visual.steps",
    );
    const graphPaths = editorFieldsForScene(graphProcess).map(
      (field) => field.path,
    );
    expect(graphPaths).not.toContain("visual.steps");
    expect(graphPaths).toContain("visual.nodes");
    // Narration / title stay editable.
    expect(graphPaths).toContain("narration");
  });

  it("round-trips graph nodes and edges through the editor field helpers", () => {
    const field = sceneEditorMetadata("process").fields.find(
      (candidate) => candidate.control === "graph",
    );
    expect(field).toBeDefined();
    const updated = writeField(graphProcess, field!, {
      nodes: [
        { id: "start", label: "Start", assetSlot: "step-1-icon" },
        { id: "finish", label: "Finish", assetSlot: "step-2-icon" },
      ],
      edges: [{ id: "edge-1", from: "start", to: "finish" }],
    });
    expect(fieldValue(field!, updated)).toEqual({
      nodes: [
        { id: "start", label: "Start", assetSlot: "step-1-icon" },
        { id: "finish", label: "Finish", assetSlot: "step-2-icon" },
      ],
      edges: [{ id: "edge-1", from: "start", to: "finish" }],
    });
  });

  it("renders the graph editor only for graph-shape scenes", () => {
    const legacyProcess = createDefaultStoryboardSceneSpec("process", {
      id: sceneId,
      order: 1,
      durationSeconds: 20,
    });
    const renderForm = (scene: SceneSpec): string =>
      renderToStaticMarkup(
        React.createElement(SceneEditorForm, {
          projectId: "019ffbf1-610e-738a-b087-6775ff97568c",
          detail: sceneDetail(scene),
          revision: 0,
          disabled: false,
          onPersisted: () => undefined,
        }),
      );

    const graphHtml = renderForm(graphProcess);
    expect(graphHtml).toContain("Process graph");
    expect(graphHtml).not.toContain(">Steps<");

    const legacyHtml = renderForm(legacyProcess);
    expect(legacyHtml).toContain(">Steps<");
    expect(legacyHtml).not.toContain("Process graph");
  });

  it("reports an invalid graph edge at its inline field path", () => {
    const invalid = sceneSpecSchema.safeParse({
      ...graphProcess,
      visual: {
        nodes: [
          { id: "start", label: "Start" },
          { id: "finish", label: "Finish" },
        ],
        edges: [{ id: "edge-1", from: "start", to: "missing" }],
      },
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success)
      expect(invalid.error.issues).toContainEqual(
        expect.objectContaining({ path: ["visual", "edges", 0, "to"] }),
      );
    expect(
      graphFieldErrors({
        "scene.visual.edges.0.to": 'Edge references unknown node id "missing".',
      }),
    ).toEqual({
      edgeGroup: [],
      edges: { 0: ['Edge references unknown node id "missing".'] },
      nodeGroup: [],
      nodes: {},
    });

    const field = sceneEditorMetadata("process").fields.find(
      (candidate) => candidate.control === "graph",
    );
    expect(field).toBeDefined();
    const html = renderToStaticMarkup(
      React.createElement(GraphEditor, {
        field: field!,
        value: {
          nodes: [
            { id: "start", label: "Start" },
            { id: "finish", label: "Finish" },
          ],
          edges: [{ id: "edge-1", from: "start", to: "missing" }],
        },
        causeEffect: false,
        disabled: false,
        errors: {
          "scene.visual.edges.0.to":
            'Edge references unknown node id "missing".',
        },
        onChange: () => undefined,
      }),
    );
    expect(html).toContain('aria-describedby="graph-edge-0-error"');
    expect(html).toContain("Edge “edge-1” (start → missing)");
  });

  it("does not allow an edge to a node removed from the graph", () => {
    const value: GraphEditorValue = {
      nodes: [
        { id: "remaining", label: "Remaining" },
        { id: "other", label: "Other" },
      ],
      edges: [],
    };
    expect(canAddGraphEdge(value, "removed", "remaining")).toBe(false);
    expect(canAddGraphEdge(value, "remaining", "other")).toBe(true);
  });

  it("normalizes stale edge selectors after navigating to another graph scene", () => {
    const value: GraphEditorValue = {
      nodes: [
        { id: "new-start", label: "New start" },
        { id: "new-finish", label: "New finish" },
      ],
      edges: [],
    };

    expect(
      normalizeGraphEdgeSelection(value, {
        from: "previous-start",
        to: "previous-finish",
      }),
    ).toEqual({ from: "new-start", to: "new-finish" });
    expect(canAddGraphEdge(value, "new-start", "new-finish")).toBe(true);
  });
});
