"use client";

import React, { useEffect, useMemo, useState, type JSX } from "react";
import {
  sceneEditorMetadata,
  sceneSpecSchema,
  sceneTemplateValues,
  type AssetCatalogEntry,
  type SceneEditorField,
  type SceneSpec,
  type SceneTemplate,
  type StoryboardSceneDetailResponse,
} from "@avlp/schemas";
import {
  SceneMutationError,
  fetchApprovedAssets,
  switchStoryboardSceneTemplate,
  updateStoryboardScene,
} from "./storyboard-scene-query";
import { Button } from "../../../../components/ui/button";
import { ApprovedAssetPicker } from "./approved-asset-picker";
import { TeacherAssetPicker } from "./teacher-asset-picker";
import { SourceVisualPicker } from "./source-visual-picker";

type SaveState = "saved" | "saving" | "conflict" | "failed";

// ST-087: `process` and `cause-effect` scenes come in a legacy shape (`steps` /
// `causes` / `mechanism` / `effects`) or a graph shape (`nodes` / `edges`). The
// flat editor fields describe the legacy shape only, so on a graph scene they
// are hidden — showing an empty "Steps" box that cannot be saved would just
// confuse. A structured node/edge editor is tracked as ST-091.
const legacyOnlyVisualPaths = new Set([
  "visual.steps",
  "visual.causes",
  "visual.effects",
  "visual.mechanism.label",
]);
const graphOnlyVisualPaths = new Set(["visual.nodes"]);

export type GraphEditorValue = {
  nodes: readonly {
    id: string;
    label: string;
    kind?: "cause" | "mechanism" | "effect";
    assetSlot?: string;
  }[];
  edges: readonly { id: string; from: string; to: string; label?: string }[];
};

export function isGraphShapeScene(scene: SceneSpec): boolean {
  return (
    (scene.template === "process" || scene.template === "cause-effect") &&
    typeof scene.visual === "object" &&
    scene.visual !== null &&
    "nodes" in scene.visual &&
    (scene.visual as { nodes?: unknown }).nodes !== undefined
  );
}

/**
 * Editor fields for a scene, minus the legacy-shape visual fields that do not
 * apply when a `process` / `cause-effect` scene is in its graph shape.
 */
export function editorFieldsForScene(
  scene: SceneSpec,
): readonly SceneEditorField[] {
  const fields = sceneEditorMetadata(scene.template).fields;
  return isGraphShapeScene(scene)
    ? fields.filter((field) => !legacyOnlyVisualPaths.has(field.path))
    : fields.filter((field) => !graphOnlyVisualPaths.has(field.path));
}

function readPath(value: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (current, key) =>
        typeof current === "object" && current !== null && key in current
          ? (current as Record<string, unknown>)[key]
          : undefined,
      value,
    );
}

function listValue(path: string, value: unknown): string {
  if (!Array.isArray(value)) return "";
  if (path === "visual.inputs" || path === "visual.outputs")
    return value
      .map((item) =>
        typeof item === "object" &&
        item !== null &&
        typeof item.label === "string"
          ? item.label
          : "",
      )
      .join("\n");
  if (path === "visual.causes" || path === "visual.effects")
    return value
      .map((item) =>
        typeof item === "object" &&
        item !== null &&
        typeof item.label === "string"
          ? item.label
          : "",
      )
      .join("\n");
  if (path === "visual.labels")
    return value
      .map((item) =>
        typeof item === "object" &&
        item !== null &&
        typeof item.text === "string" &&
        typeof item.anchor === "string"
          ? `${item.text} | ${item.anchor}`
          : "",
      )
      .join("\n");
  if (path === "visual.mappings")
    return value
      .map((item) =>
        typeof item === "object" &&
        item !== null &&
        typeof item.concept === "string" &&
        typeof item.analogy === "string"
          ? `${item.concept} -> ${item.analogy}`
          : "",
      )
      .join("\n");
  if (path === "visual.takeaways")
    return value
      .map((item) =>
        typeof item === "object" &&
        item !== null &&
        typeof item.text === "string"
          ? item.text
          : "",
      )
      .join("\n");
  return value
    .filter((item): item is string => typeof item === "string")
    .join("\n");
}

function cloneScene(scene: SceneSpec): Record<string, unknown> {
  return JSON.parse(JSON.stringify(scene)) as Record<string, unknown>;
}

export function writeField(
  scene: SceneSpec,
  field: SceneEditorField,
  raw: string | GraphEditorValue,
): SceneSpec {
  const next = cloneScene(scene);
  if (field.control === "graph") {
    if (typeof raw === "string") return scene;
    const visual = next.visual as Record<string, unknown>;
    visual.nodes = raw.nodes.map((node) => ({ ...node }));
    visual.edges = raw.edges.map((edge) => ({ ...edge }));
    return next as unknown as SceneSpec;
  }
  if (typeof raw !== "string") return scene;
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (field.control === "text-list") {
    const visual = next.visual as Record<string, unknown>;
    if (field.path === "onScreenText") next.onScreenText = lines;
    else if (field.path === "visual.inputs" || field.path === "visual.outputs")
      visual[field.path.endsWith("inputs") ? "inputs" : "outputs"] = lines.map(
        (label) => ({ label }),
      );
    else if (
      field.path === "visual.causes" ||
      field.path === "visual.effects"
    ) {
      const key = field.path.endsWith("causes") ? "causes" : "effects";
      visual[key] = lines.map((label, index) => ({
        id: `${key === "causes" ? "cause" : "effect"}-${index + 1}`,
        label,
        assetSlot: `${key === "causes" ? "cause" : "effect"}-${index + 1}-icon`,
      }));
      const causes = (visual.causes as Array<{ id: string }>) ?? [];
      const effects = (visual.effects as Array<{ id: string }>) ?? [];
      const mechanism = visual.mechanism as { id: string } | undefined;
      visual.connections =
        mechanism === undefined
          ? causes.flatMap((cause) =>
              effects.map((effect) => ({ from: cause.id, to: effect.id })),
            )
          : [
              ...causes.map((cause) => ({ from: cause.id, to: mechanism.id })),
              ...effects.map((effect) => ({
                from: mechanism.id,
                to: effect.id,
              })),
            ];
    } else if (field.path === "visual.labels") {
      const anchors = [
        "top-left",
        "top",
        "top-right",
        "right",
        "bottom-right",
        "bottom",
      ];
      visual.labels = lines.map((line, index) => {
        const [text, anchor] = line
          .split("|", 2)
          .map((part) => part?.trim() ?? "");
        return {
          id: `label-${index + 1}`,
          text,
          anchor: anchor || anchors[index] || "left",
        };
      });
    } else if (field.path === "visual.mappings")
      visual.mappings = lines.map((line) => {
        const [concept, analogy] = line
          .split("->", 2)
          .map((part) => part?.trim() ?? "");
        return { concept, analogy };
      });
    else if (field.path === "visual.takeaways")
      visual.takeaways = lines.map((text) => ({ text }));
    else {
      const key = field.path.replace("visual.", "");
      visual[key] = lines;
    }
    return next as unknown as SceneSpec;
  }
  const parts = field.path.split(".");
  let target: Record<string, unknown> = next;
  for (const part of parts.slice(0, -1)) {
    const existing = target[part];
    if (
      typeof existing !== "object" ||
      existing === null ||
      Array.isArray(existing)
    )
      target[part] = {};
    target = target[part] as Record<string, unknown>;
  }
  const key = parts.at(-1)!;
  const value = field.path === "durationSeconds" ? Number(raw) : raw;
  if (raw.trim() === "" && !field.required) delete target[key];
  else target[key] = value;
  if (field.path === "visual.kind") {
    const visual = next.visual as Record<string, unknown>;
    if (value === "asset") visual.baseAssetSlot = "diagram";
    else delete visual.baseAssetSlot;
  }
  return next as unknown as SceneSpec;
}

export function fieldValue(
  field: SceneEditorField,
  scene: SceneSpec,
): string | GraphEditorValue {
  const value = readPath(scene, field.path);
  if (field.control === "graph") {
    const visual = scene.visual as Record<string, unknown>;
    return {
      nodes: Array.isArray(visual.nodes)
        ? visual.nodes
            .filter(
              (node): node is Record<string, unknown> =>
                typeof node === "object" && node !== null,
            )
            .map((node) => ({
              id: typeof node.id === "string" ? node.id : "",
              label: typeof node.label === "string" ? node.label : "",
              ...(node.kind === "cause" ||
              node.kind === "mechanism" ||
              node.kind === "effect"
                ? { kind: node.kind }
                : {}),
              ...(typeof node.assetSlot === "string"
                ? { assetSlot: node.assetSlot }
                : {}),
            }))
        : [],
      edges: Array.isArray(visual.edges)
        ? visual.edges
            .filter(
              (edge): edge is Record<string, unknown> =>
                typeof edge === "object" && edge !== null,
            )
            .map((edge) => ({
              id: typeof edge.id === "string" ? edge.id : "",
              from: typeof edge.from === "string" ? edge.from : "",
              to: typeof edge.to === "string" ? edge.to : "",
              ...(typeof edge.label === "string" ? { label: edge.label } : {}),
            }))
        : [],
    };
  }
  if (field.control === "text-list") return listValue(field.path, value);
  return typeof value === "number" || typeof value === "string"
    ? String(value)
    : "";
}

function nextGraphId(prefix: string, used: ReadonlySet<string>): string {
  let index = 1;
  while (used.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

export function canAddGraphEdge(
  value: GraphEditorValue,
  from: string,
  to: string,
): boolean {
  const nodeIds = new Set(value.nodes.map((node) => node.id));
  return (
    from !== "" &&
    to !== "" &&
    nodeIds.has(from) &&
    nodeIds.has(to) &&
    from !== to &&
    value.edges.length < 24 &&
    !value.edges.some((edge) => edge.from === from && edge.to === to)
  );
}

export function graphFieldErrors(
  errors: Readonly<Record<string, string>>,
): Readonly<{
  nodes: Readonly<Record<number, readonly string[]>>;
  edges: Readonly<Record<number, readonly string[]>>;
  nodeGroup: readonly string[];
  edgeGroup: readonly string[];
}> {
  const nodes: Record<number, string[]> = {};
  const edges: Record<number, string[]> = {};
  const nodeGroup: string[] = [];
  const edgeGroup: string[] = [];

  for (const [path, message] of Object.entries(errors)) {
    const match = /^scene\.visual\.(nodes|edges)(?:\.(\d+)(?:\.|$))?/.exec(
      path,
    );
    if (match === null) continue;
    const group = match[1] === "nodes" ? nodeGroup : edgeGroup;
    const indexed = match[1] === "nodes" ? nodes : edges;
    const index = match[2];
    if (index === undefined) group.push(message);
    else (indexed[Number(index)] ??= []).push(message);
  }

  return { nodes, edges, nodeGroup, edgeGroup };
}

export function normalizeGraphEdgeSelection(
  value: GraphEditorValue,
  selection: Readonly<{ from: string; to: string }>,
): Readonly<{ from: string; to: string }> {
  const nodeIds = new Set(value.nodes.map((node) => node.id));
  const from = nodeIds.has(selection.from)
    ? selection.from
    : (value.nodes[0]?.id ?? "");
  const to =
    nodeIds.has(selection.to) && selection.to !== from
      ? selection.to
      : (value.nodes.find((node) => node.id !== from)?.id ?? from);
  return { from, to };
}

export function GraphEditor({
  field,
  value,
  causeEffect,
  disabled,
  errors,
  onChange,
}: {
  field: SceneEditorField;
  value: GraphEditorValue;
  causeEffect: boolean;
  disabled: boolean;
  errors: Readonly<Record<string, string>>;
  onChange: (value: GraphEditorValue) => void;
}): JSX.Element {
  const [from, setFrom] = useState(value.nodes[0]?.id ?? "");
  const [to, setTo] = useState(value.nodes[1]?.id ?? "");
  const selection = normalizeGraphEdgeSelection(value, { from, to });
  const graphErrors = graphFieldErrors(errors);
  const updateNode = (
    id: string,
    patch: Partial<GraphEditorValue["nodes"][number]>,
  ): void =>
    onChange({
      ...value,
      nodes: value.nodes.map((node) =>
        node.id === id ? { ...node, ...patch } : node,
      ),
    });
  const removeNode = (id: string): void => {
    const nodes = value.nodes.filter((node) => node.id !== id);
    const fallback = nodes[0]?.id ?? "";
    if (from === id) setFrom(fallback);
    if (to === id)
      setTo(nodes.find((node) => node.id !== fallback)?.id ?? fallback);
    onChange({
      nodes,
      edges: value.edges.filter((edge) => edge.from !== id && edge.to !== id),
    });
  };
  const addNode = (): void => {
    const id = nextGraphId("node", new Set(value.nodes.map((node) => node.id)));
    onChange({
      ...value,
      nodes: [
        ...value.nodes,
        {
          id,
          label: "New node",
          ...(causeEffect ? { kind: "cause" as const } : {}),
        },
      ],
    });
  };
  const addEdge = (): void => {
    if (!canAddGraphEdge(value, selection.from, selection.to)) return;
    const id = nextGraphId("edge", new Set(value.edges.map((edge) => edge.id)));
    onChange({
      ...value,
      edges: [...value.edges, { id, from: selection.from, to: selection.to }],
    });
  };
  const controlStyle: React.CSSProperties = {
    width: "100%",
    minHeight: "36px",
    backgroundColor: "var(--color-surface, #211A2B)",
    border: "1px solid var(--color-border, #3A3046)",
    borderRadius: "6px",
    color: "var(--color-text, #F4F1F8)",
    padding: "7px 8px",
    fontSize: "12px",
    boxSizing: "border-box",
  };
  const compactButtonStyle: React.CSSProperties = {
    minHeight: "36px",
    padding: "6px 10px",
  };
  return (
    <fieldset
      aria-label={field.label}
      style={{
        margin: 0,
        border: "1px solid var(--color-border, #3A3046)",
        borderRadius: "8px",
        padding: "10px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      <legend style={{ padding: "0 4px", fontSize: "12px", fontWeight: 600 }}>
        {field.label}
      </legend>
      <p
        style={{
          margin: 0,
          fontSize: "11px",
          color: "var(--color-text-muted, #BDB5C7)",
        }}
      >
        Layout stays automatic. Removing a node also removes its connections.
      </p>
      {value.nodes.map((node, index) => {
        const nodeErrors = graphErrors.nodes[index] ?? [];
        const errorId = `graph-node-${index}-error`;
        return (
          <div
            key={node.id}
            style={{ display: "flex", flexDirection: "column", gap: "4px" }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: causeEffect
                  ? "1fr 120px auto"
                  : "1fr auto",
                gap: "6px",
                alignItems: "center",
              }}
            >
              <input
                aria-label={`Label for ${node.id}`}
                aria-describedby={nodeErrors.length > 0 ? errorId : undefined}
                value={node.label}
                disabled={disabled}
                onChange={(event) =>
                  updateNode(node.id, { label: event.target.value })
                }
                style={controlStyle}
              />
              {causeEffect ? (
                <select
                  aria-label={`Kind for ${node.id}`}
                  aria-describedby={nodeErrors.length > 0 ? errorId : undefined}
                  value={node.kind ?? "cause"}
                  disabled={disabled}
                  onChange={(event) =>
                    updateNode(node.id, {
                      kind: event.target.value as
                        "cause" | "mechanism" | "effect",
                    })
                  }
                  style={controlStyle}
                >
                  <option value="cause">Cause</option>
                  <option value="mechanism">Mechanism</option>
                  <option value="effect">Effect</option>
                </select>
              ) : null}
              <Button
                type="button"
                variant="destructive"
                size="compact"
                style={compactButtonStyle}
                aria-label={`Remove ${node.id}`}
                disabled={disabled}
                onClick={() => removeNode(node.id)}
              >
                Remove
              </Button>
            </div>
            {nodeErrors.length > 0 ? (
              <span
                id={errorId}
                role="alert"
                style={{ color: "#FCA5A5", fontSize: "11px" }}
              >
                Node “{node.label || node.id}” ({node.id}):{" "}
                {nodeErrors.join(" ")}
              </span>
            ) : null}
          </div>
        );
      })}
      <Button
        type="button"
        variant="secondary"
        size="compact"
        style={compactButtonStyle}
        disabled={disabled || value.nodes.length >= 12}
        onClick={addNode}
      >
        Add node
      </Button>
      <div
        style={{
          borderTop: "1px solid var(--color-border, #3A3046)",
          paddingTop: "8px",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        <strong style={{ fontSize: "12px" }}>Connections</strong>
        {value.edges.map((edge, index) => {
          const edgeErrors = graphErrors.edges[index] ?? [];
          const errorId = `graph-edge-${index}-error`;
          return (
            <div
              key={edge.id}
              style={{ display: "flex", flexDirection: "column", gap: "4px" }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "6px",
                  alignItems: "center",
                  fontSize: "12px",
                }}
              >
                <span>
                  {edge.from} → {edge.to}
                </span>
                <Button
                  type="button"
                  variant="destructive"
                  size="compact"
                  style={compactButtonStyle}
                  aria-describedby={edgeErrors.length > 0 ? errorId : undefined}
                  aria-label={`Remove ${edge.id}`}
                  disabled={disabled}
                  onClick={() =>
                    onChange({
                      ...value,
                      edges: value.edges.filter((item) => item.id !== edge.id),
                    })
                  }
                >
                  Remove
                </Button>
              </div>
              {edgeErrors.length > 0 ? (
                <span
                  id={errorId}
                  role="alert"
                  style={{ color: "#FCA5A5", fontSize: "11px" }}
                >
                  Edge “{edge.id}” ({edge.from} → {edge.to}):{" "}
                  {edgeErrors.join(" ")}
                </span>
              ) : null}
            </div>
          );
        })}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr auto",
            gap: "6px",
          }}
        >
          <select
            aria-label="Connection from"
            value={selection.from}
            disabled={disabled || value.nodes.length < 2}
            onChange={(event) => setFrom(event.target.value)}
            style={controlStyle}
          >
            {value.nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.label || node.id}
              </option>
            ))}
          </select>
          <select
            aria-label="Connection to"
            value={selection.to}
            disabled={disabled || value.nodes.length < 2}
            onChange={(event) => setTo(event.target.value)}
            style={controlStyle}
          >
            {value.nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.label || node.id}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="secondary"
            size="compact"
            style={compactButtonStyle}
            disabled={
              disabled || !canAddGraphEdge(value, selection.from, selection.to)
            }
            onClick={addEdge}
          >
            Add edge
          </Button>
        </div>
      </div>
      {graphErrors.nodeGroup.map((error, index) => (
        <span
          key={`node-group-${index}`}
          role="alert"
          style={{ color: "#FCA5A5", fontSize: "11px" }}
        >
          Nodes: {error}
        </span>
      ))}
      {graphErrors.edgeGroup.map((error, index) => (
        <span
          key={`edge-group-${index}`}
          role="alert"
          style={{ color: "#FCA5A5", fontSize: "11px" }}
        >
          Connections: {error}
        </span>
      ))}
    </fieldset>
  );
}

function assetRole(slot: string): "diagram" | "icon" | "illustration" {
  if (slot === "diagram") return "diagram";
  if (slot.includes("icon")) return "icon";
  return "illustration";
}

function assetIdForSlot(scene: SceneSpec, slot: string): string {
  return (
    scene.assetBindings.find((binding) => binding.slot === slot)?.assetId ?? ""
  );
}

export function writeAssetSlot(
  scene: SceneSpec,
  slot: string,
  assetId: string,
): SceneSpec {
  const next = cloneScene(scene);
  const bindings = (
    next.assetBindings as Array<Record<string, unknown>>
  ).filter((binding) => binding.slot !== slot);
  if (assetId.trim() !== "")
    bindings.push({ assetId: assetId.trim(), role: assetRole(slot), slot });
  next.assetBindings = bindings;
  return next as unknown as SceneSpec;
}


export function SceneEditorForm({
  projectId,
  detail,
  revision,
  disabled,
  onPersisted,
  onTemplateChanged,
}: {
  projectId: string;
  detail: StoryboardSceneDetailResponse;
  revision: number;
  disabled: boolean;
  onPersisted: (message?: string) => void;
  onTemplateChanged?: (requiresNewVisual: boolean) => void;
}): JSX.Element {
  const [draft, setDraft] = useState<SceneSpec>(detail.scene.scene);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Readonly<Record<string, string>>
  >({});
  const [assetsBySlot, setAssetsBySlot] = useState<
    Readonly<Record<string, readonly AssetCatalogEntry[]>>
  >({});
  const [tagFiltersBySlot, setTagFiltersBySlot] = useState<
    Readonly<Record<string, string>>
  >({});
  const metadata = useMemo(
    () => sceneEditorMetadata(draft.template),
    [draft.template],
  );
  const visibleFields = useMemo(() => editorFieldsForScene(draft), [draft]);

  useEffect(() => {
    setDraft(detail.scene.scene);
    setSaveState("saved");
    setMessage(null);
    setFieldErrors({});
  }, [detail.scene.scene]);

  useEffect(() => {
    let active = true;
    const slots = sceneEditorMetadata(draft.template).assetSlots;
    void Promise.all(
      slots.map(
        async (slot) =>
          [
            slot,
            (
              await fetchApprovedAssets(projectId, draft.template, slot, {
                tags: tagFiltersBySlot[slot]?.split(",") ?? [],
              })
            ).assets,
          ] as const,
      ),
    )
      .then((entries) => {
        if (active) setAssetsBySlot(Object.fromEntries(entries));
      })
      .catch(() => {
        if (active) setAssetsBySlot({});
      });
    return () => {
      active = false;
    };
  }, [draft.template, projectId, tagFiltersBySlot]);

  const save = async (): Promise<void> => {
    setSaveState("saving");
    setMessage(null);
    setFieldErrors({});
    const local = sceneSpecSchema.safeParse(draft);
    if (!local.success) {
      setFieldErrors(
        Object.fromEntries(
          local.error.issues.map((issue) => [
            `scene.${issue.path.join(".")}`,
            issue.message,
          ]),
        ),
      );
      setSaveState("failed");
      setMessage("Correct the highlighted fields before saving.");
      return;
    }
    try {
      const result = await updateStoryboardScene(
        projectId,
        detail.scene.stableSceneId,
        local.data,
        revision,
      );
      setDraft(result.scene.scene);
      setSaveState("saved");
      const savedMessage =
        result.warning ??
        `Saved. Invalidated: ${result.invalidated.join(", ")}.`;
      onPersisted(savedMessage);
    } catch (error) {
      const mutation = error instanceof SceneMutationError ? error : null;
      setFieldErrors(mutation?.fields ?? {});
      setSaveState(
        mutation?.message.includes("changed") ? "conflict" : "failed",
      );
      setMessage(mutation?.message ?? "The scene could not be saved.");
    }
  };

  const switchTemplate = async (template: SceneTemplate): Promise<void> => {
    if (template === draft.template) return;
    setSaveState("saving");
    setMessage(null);
    try {
      let result = await switchStoryboardSceneTemplate(
        projectId,
        detail.scene.stableSceneId,
        template,
        revision,
      );
      if (result.requiresConfirmation) {
        const accepted = window.confirm(
          `Switching templates will reset: ${result.resetFields.join(", ")}. Continue?`,
        );
        if (!accepted) {
          setSaveState("saved");
          return;
        }
        result = await switchStoryboardSceneTemplate(
          projectId,
          detail.scene.stableSceneId,
          template,
          revision,
          true,
        );
      }
      setDraft(result.scene.scene);
      setSaveState("saved");
      const requiresNewVisual =
        sceneEditorMetadata(template).assetSlots.length > 0;
      const changedMessage = requiresNewVisual
        ? "Template changed. The previous visual was removed because it does not match this layout. In Visual, generate and review a new template-specific image before previewing."
        : `Template changed. Invalidated: ${result.invalidated.join(", ")}.`;
      onPersisted(changedMessage);
      onTemplateChanged?.(requiresNewVisual);
    } catch (error) {
      setSaveState("failed");
      setMessage(
        error instanceof Error
          ? error.message
          : "The template could not be changed.",
      );
    }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    backgroundColor: "var(--color-surface, #211A2B)",
    border: "1px solid var(--color-border, #3A3046)",
    borderRadius: "6px",
    color: "var(--color-text, #F4F1F8)",
    padding: "8px 10px",
    fontSize: "13px",
    marginTop: "4px",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <section
      aria-label="Scene editor"
      data-testid="scene-editor"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--color-border, #3A3046)",
          paddingBottom: "8px",
        }}
      >
        <h4
          style={{
            margin: 0,
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--color-text, #F4F1F8)",
          }}
        >
          Edit scene
        </h4>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <p
            role="status"
            style={{
              margin: 0,
              fontSize: "12px",
              fontWeight: 500,
              color:
                saveState === "saving"
                  ? "var(--color-brand, #A883FF)"
                  : saveState === "saved"
                    ? "var(--color-success-fg, #176B46)"
                    : saveState === "conflict"
                      ? "var(--color-warning-fg, #8A4B08)"
                      : "var(--color-error-fg, #B42318)",
            }}
          >
            {saveState === "saving"
              ? "Saving…"
              : saveState === "saved"
                ? "Saved"
                : saveState === "conflict"
                  ? "Conflict — refresh and retry."
                  : "Save failed."}
          </p>
        </div>
      </div>

      {message !== null ? (
        <p
          role={
            saveState === "failed" || saveState === "conflict"
              ? "alert"
              : "status"
          }
          style={{
            margin: 0,
            padding: "8px 12px",
            borderRadius: "6px",
            fontSize: "12px",
            backgroundColor:
              saveState === "failed" || saveState === "conflict"
                ? "rgba(180, 35, 24, 0.15)"
                : "rgba(23, 107, 70, 0.15)",
            color:
              saveState === "failed" || saveState === "conflict"
                ? "#FCA5A5"
                : "#86EFAC",
            border: `1px solid ${
              saveState === "failed" || saveState === "conflict"
                ? "rgba(180, 35, 24, 0.3)"
                : "rgba(23, 107, 70, 0.3)"
            }`,
          }}
        >
          {message}
        </p>
      ) : null}

      <div>
        <label
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--color-text-muted, #BDB5C7)",
          }}
        >
          Template{" "}
          <select
            value={draft.template}
            disabled={disabled || saveState === "saving"}
            onChange={(event) =>
              void switchTemplate(event.target.value as SceneTemplate)
            }
            style={inputStyle}
          >
            {sceneTemplateValues.map((template) => (
              <option key={template} value={template}>
                {template}
              </option>
            ))}
          </select>
        </label>
      </div>

      {visibleFields.map((field) =>
        field.control === "graph" ? (
          <GraphEditor
            key={field.path}
            field={field}
            value={fieldValue(field, draft) as GraphEditorValue}
            causeEffect={draft.template === "cause-effect"}
            disabled={disabled || saveState === "saving"}
            errors={fieldErrors}
            onChange={(value) =>
              setDraft((current) => writeField(current, field, value))
            }
          />
        ) : (
          <label
            key={field.path}
            style={{
              display: "block",
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--color-text-muted, #BDB5C7)",
            }}
          >
            {field.label}
            {field.control === "select" ? (
              <select
                value={fieldValue(field, draft) as string}
                disabled={disabled || saveState === "saving"}
                onChange={(event) =>
                  setDraft((current) =>
                    writeField(current, field, event.target.value),
                  )
                }
                style={inputStyle}
              >
                {!field.required ? <option value="">Not set</option> : null}
                {field.options?.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : field.control === "textarea" ||
              field.control === "text-list" ? (
              <textarea
                aria-label={field.label}
                value={fieldValue(field, draft) as string}
                disabled={disabled || saveState === "saving"}
                onChange={(event) =>
                  setDraft((current) =>
                    writeField(current, field, event.target.value),
                  )
                }
                rows={3}
                style={{
                  ...inputStyle,
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
              />
            ) : (
              <input
                aria-label={field.label}
                value={fieldValue(field, draft) as string}
                disabled={disabled || saveState === "saving"}
                onChange={(event) =>
                  setDraft((current) =>
                    writeField(current, field, event.target.value),
                  )
                }
                style={inputStyle}
              />
            )}
            {field.control === "text-list" ? (
              <small
                style={{
                  display: "block",
                  marginTop: "4px",
                  color: "var(--color-text-muted, #BDB5C7)",
                  fontWeight: 400,
                }}
              >
                {field.path === "visual.labels"
                  ? "One label per line: text | semantic anchor."
                  : "One item per line."}
              </small>
            ) : null}
            {fieldErrors[`scene.${field.path}`] !== undefined ? (
              <span
                role="alert"
                style={{
                  display: "block",
                  marginTop: "4px",
                  color: "#FCA5A5",
                  fontSize: "11px",
                }}
              >
                {fieldErrors[`scene.${field.path}`]}
              </span>
            ) : null}
          </label>
        ),
      )}

      {metadata.assetSlots.map((slot) => (
        <div
          key={slot}
          style={{
            border: "1px solid var(--color-border, #3A3046)",
            borderRadius: "8px",
            padding: "12px",
            backgroundColor: "rgba(0,0,0,0.15)",
          }}
        >
          <ApprovedAssetPicker
            assets={assetsBySlot[slot] ?? []}
            disabled={disabled || saveState === "saving"}
            tagFilter={tagFiltersBySlot[slot] ?? ""}
            selectedId={assetIdForSlot(draft, slot)}
            slot={slot}
            onChange={(assetId) =>
              setDraft((current) => writeAssetSlot(current, slot, assetId))
            }
            onTagFilterChange={(tagFilter) =>
              setTagFiltersBySlot((current) => ({
                ...current,
                [slot]: tagFilter,
              }))
            }
          />
          <TeacherAssetPicker
            projectId={projectId}
            disabled={disabled || saveState === "saving"}
            selectedId={assetIdForSlot(draft, slot)}
            slot={slot}
            onChange={(assetId) =>
              setDraft((current) => writeAssetSlot(current, slot, assetId))
            }
          />
          {metadata.assetSlotRequirements.find(
            (requirement) => requirement.slot === slot,
          )?.bindingRole === "diagram" ? (
            <SourceVisualPicker
              projectId={projectId}
              disabled={disabled || saveState === "saving"}
              selectedId={assetIdForSlot(draft, slot)}
              slot={slot}
              onChange={(assetId) =>
                setDraft((current) => writeAssetSlot(current, slot, assetId))
              }
            />
          ) : null}
        </div>
      ))}

      <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
        {saveState === "conflict" ? (
          <button
            type="button"
            onClick={() => onPersisted()}
            style={{
              padding: "8px 14px",
              borderRadius: "6px",
              backgroundColor: "rgba(255, 255, 255, 0.1)",
              border: "1px solid var(--color-border, #3A3046)",
              color: "var(--color-text, #F4F1F8)",
              fontSize: "13px",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload current scene
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void save()}
          disabled={disabled || saveState === "saving"}
          style={{
            flex: 1,
            padding: "8px 16px",
            borderRadius: "6px",
            backgroundColor: "var(--color-brand, #A883FF)",
            border: "none",
            color: "var(--color-on-brand, #1B1027)",
            fontSize: "13px",
            fontWeight: 600,
            cursor:
              disabled || saveState === "saving" ? "not-allowed" : "pointer",
            opacity: disabled || saveState === "saving" ? 0.6 : 1,
          }}
        >
          {saveState === "saving" ? "Saving scene…" : "Save scene"}
        </button>
      </div>
    </section>
  );
}
