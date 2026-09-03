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
import { ApprovedAssetPicker } from "./approved-asset-picker";
import { TeacherAssetPicker } from "./teacher-asset-picker";

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
    : fields;
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

function writeField(
  scene: SceneSpec,
  field: SceneEditorField,
  raw: string,
): SceneSpec {
  const next = cloneScene(scene);
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

function fieldValue(field: SceneEditorField, scene: SceneSpec): string {
  const value = readPath(scene, field.path);
  if (field.control === "text-list") return listValue(field.path, value);
  return typeof value === "number" || typeof value === "string"
    ? String(value)
    : "";
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
}: {
  projectId: string;
  detail: StoryboardSceneDetailResponse;
  revision: number;
  disabled: boolean;
  onPersisted: (message?: string) => void;
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
  const graphShape = isGraphShapeScene(draft);
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
      const changedMessage = `Template changed. Invalidated: ${result.invalidated.join(", ")}.`;
      onPersisted(changedMessage);
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
        <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: "var(--color-text, #F4F1F8)" }}>
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
        <label style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text-muted, #BDB5C7)" }}>
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

      {graphShape ? (
        <p
          role="status"
          style={{
            margin: 0,
            fontSize: "12px",
            color: "var(--color-text-muted, #BDB5C7)",
          }}
        >
          This scene uses the graph layout. Its nodes and connections are laid
          out automatically; edit narration and titles here.
        </p>
      ) : null}

      {visibleFields.map((field) => (
        <label
          key={field.path}
          style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--color-text-muted, #BDB5C7)" }}
        >
          {field.label}
          {field.control === "select" ? (
            <select
              value={fieldValue(field, draft)}
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
          ) : field.control === "textarea" || field.control === "text-list" ? (
            <textarea
              aria-label={field.label}
              value={fieldValue(field, draft)}
              disabled={disabled || saveState === "saving"}
              onChange={(event) =>
                setDraft((current) =>
                  writeField(current, field, event.target.value),
                )
              }
              rows={3}
              style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
            />
          ) : (
            <input
              aria-label={field.label}
              value={fieldValue(field, draft)}
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
            <small style={{ display: "block", marginTop: "4px", color: "var(--color-text-muted, #BDB5C7)", fontWeight: 400 }}>
              {field.path === "visual.labels"
                ? "One label per line: text | semantic anchor."
                : "One item per line."}
            </small>
          ) : null}
          {fieldErrors[`scene.${field.path}`] !== undefined ? (
            <span role="alert" style={{ display: "block", marginTop: "4px", color: "#FCA5A5", fontSize: "11px" }}>
              {fieldErrors[`scene.${field.path}`]}
            </span>
          ) : null}
        </label>
      ))}

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
            cursor: disabled || saveState === "saving" ? "not-allowed" : "pointer",
            opacity: disabled || saveState === "saving" ? 0.6 : 1,
          }}
        >
          {saveState === "saving" ? "Saving scene…" : "Save scene"}
        </button>
      </div>
    </section>
  );
}
