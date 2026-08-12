import { videoTheme } from "@avlp/design-system/video-theme";
import {
  comparisonVisualSchema,
  analogyVisualSchema,
  causeEffectVisualSchema,
  diagramVisualSchema,
  definitionVisualSchema,
  hookVisualSchema,
  ipoVisualSchema,
  processVisualSchema,
  summaryVisualSchema,
  workedExampleVisualSchema,
  sceneSpecSchema,
  sceneTemplateSchema,
  sceneTemplateValues,
  type SceneSpec,
  type SceneTemplate,
} from "@avlp/schemas";
import { createElement, type CSSProperties, type JSX } from "react";
import { z, type ZodType } from "zod";
import {
  measureSceneContent,
  measureSceneText,
  type LayoutMeasurement,
  type SceneTextBlock,
} from "./layout.js";
import { HookScene } from "./hook-scene.js";
import { DefinitionScene } from "./definition-scene.js";
import { ProcessScene } from "./process-scene.js";
import { IpoScene } from "./ipo-scene.js";
import { ComparisonScene } from "./comparison-scene.js";
import { CauseEffectScene } from "./cause-effect-scene.js";
import { LabelledDiagramScene } from "./labelled-diagram-scene.js";
import { AnalogyScene } from "./analogy-scene.js";
import { WorkedExampleScene } from "./worked-example-scene.js";
import { SummaryScene } from "./summary-scene.js";
import { planDiagramCallouts } from "./diagram-layout.js";

export type SceneValidationIssue = Readonly<{
  code:
    | "unsupported_template"
    | "invalid_scene"
    | "text_overflow"
    | "missing_asset"
    | "diagram_collision";
  fieldPath: string;
  message: string;
  sceneId: string;
  severity: "error" | "warning";
  suggestedCorrection: string;
}>;

export type TemplateFormMetadata = Readonly<{
  assetSlots: readonly string[];
  fields: readonly TemplateFormField[];
  itemLimits: Readonly<Record<string, number>>;
  migrationBehavior: "none";
  textLimits: Readonly<Record<string, number>>;
}>;

export type TemplateFormField = Readonly<{
  control: "text" | "text-list";
  label: string;
  path: string;
  required: boolean;
}>;

type TemplateMetadataBase = Omit<TemplateFormMetadata, "fields">;

type SceneLayout = Readonly<{
  visualTextPaths: readonly string[];
}>;

export const resolvedSceneAssetSourceValues = ["library", "source"] as const;
export type ResolvedSceneAssetSource =
  (typeof resolvedSceneAssetSourceValues)[number];
export type ResolvedSceneAsset = Readonly<{
  altText: string;
  assetId: string;
  source: ResolvedSceneAssetSource;
  src: string;
}>;
export type SceneRuntimeMode = "preview" | "render";
export type SceneComponentProps = Readonly<{
  resolvedAssets?: Readonly<Record<string, ResolvedSceneAsset>>;
  runtimeMode?: SceneRuntimeMode;
  scene: SceneSpec;
}>;

export type SceneDefinition<TVisual extends z.ZodTypeAny> = Readonly<{
  component: (props: SceneComponentProps) => JSX.Element;
  createDefault: () => Extract<SceneSpec, { template: SceneTemplate }>;
  durationGuidance: Readonly<{
    maximumSeconds: number;
    minimumSeconds: number;
  }>;
  metadata: TemplateFormMetadata;
  layout: SceneLayout;
  template: SceneTemplate;
  visualSchema: TVisual;
}>;

export type SceneRegistry = Readonly<
  Record<SceneTemplate, SceneDefinition<z.ZodTypeAny>>
>;

const visualSchemas = {
  hook: hookVisualSchema,
  definition: definitionVisualSchema,
  process: processVisualSchema,
  "input-process-output": ipoVisualSchema,
  comparison: comparisonVisualSchema,
  "cause-effect": causeEffectVisualSchema,
  "labelled-diagram": diagramVisualSchema,
  analogy: analogyVisualSchema,
  "worked-example": workedExampleVisualSchema,
  summary: summaryVisualSchema,
} satisfies Record<SceneTemplate, ZodType<unknown>>;

const defaults = {
  hook: { question: "What will you discover?" },
  definition: {
    term: "Key term",
    definition: "A concise explanation.",
  },
  process: { steps: ["First step", "Second step"] },
  "input-process-output": {
    inputs: [{ label: "Input" }],
    process: { label: "Process" },
    outputs: [{ label: "Output" }],
  },
  comparison: {
    leftSubject: { label: "Left subject" },
    rightSubject: { label: "Right subject" },
    similarities: ["Shared feature"],
    differences: ["Key difference"],
  },
  "cause-effect": {
    causes: [{ id: "cause-1", label: "Cause", assetSlot: "cause-1-icon" }],
    effects: [{ id: "effect-1", label: "Effect", assetSlot: "effect-1-icon" }],
    connections: [{ from: "cause-1", to: "effect-1" }],
  },
  "labelled-diagram": {
    kind: "shapes",
    shape: "system",
    labels: [{ anchor: "top-left", id: "label-1", text: "Label" }],
  },
  analogy: {
    sourceConcept: "Concept",
    familiarSystem: "Familiar system",
    mappings: [{ concept: "Concept part", analogy: "Familiar part" }],
  },
  "worked-example": {
    problem: "Example problem",
    steps: ["First step"],
    answer: "Answer",
  },
  summary: { takeaways: [{ text: "Key takeaway" }] },
} as const;

// Kept as a preview-safe fallback helper for future registered templates.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PlaceholderScene({ scene }: SceneComponentProps): JSX.Element {
  const visual = Object.values(scene.visual)
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .join(" · ");
  const container: CSSProperties = {
    background: videoTheme.colors.background,
    boxSizing: "border-box",
    color: videoTheme.colors.text,
    fontFamily: videoTheme.typography.fontFamily,
    height: "100%",
    padding: `${videoTheme.safeAreas.body.top}px ${videoTheme.safeAreas.body.right}px`,
    width: "100%",
  };
  return createElement("main", { style: container }, [
    createElement(
      "h1",
      {
        key: "title",
        style: { fontSize: videoTheme.typography.titleSize, margin: 0 },
      },
      scene.title ?? scene.template,
    ),
    createElement(
      "p",
      {
        key: "visual",
        style: {
          fontSize: videoTheme.typography.bodySize,
          lineHeight: videoTheme.typography.lineHeight,
        },
      },
      visual,
    ),
  ]);
}

function makeDefault<TTemplate extends SceneTemplate>(
  template: TTemplate,
): Extract<SceneSpec, { template: TTemplate }> {
  return {
    id: "00000000-0000-7000-8000-000000000001",
    order: 1,
    narration: "Default narration.",
    onScreenText: [],
    transition: "cut",
    assetBindings: [],
    sourceRefs: [
      {
        documentId: "00000000-0000-7000-8000-000000000002",
        parsedDocumentVersion: 1,
        pageStart: 1,
        blockIds: ["00000000-0000-7000-8000-000000000003"],
      },
    ],
    generatedAdditions: [],
    durationSeconds: 10,
    template,
    visual: defaults[template],
  } as unknown as Extract<SceneSpec, { template: TTemplate }>;
}

const layouts: Record<SceneTemplate, SceneLayout> = {
  hook: {
    visualTextPaths: [
      "visual.question",
      "visual.prompt",
      "visual.supportingElements",
    ],
  },
  definition: {
    visualTextPaths: [
      "visual.term",
      "visual.definition",
      "visual.exampleLabel",
      "visual.exampleText",
    ],
  },
  process: { visualTextPaths: ["visual.steps"] },
  "input-process-output": {
    visualTextPaths: ["visual.inputs", "visual.process", "visual.outputs"],
  },
  comparison: {
    visualTextPaths: [
      "visual.leftSubject.label",
      "visual.rightSubject.label",
      "visual.similarities",
      "visual.differences",
    ],
  },
  "cause-effect": {
    visualTextPaths: ["visual.causes", "visual.mechanism", "visual.effects"],
  },
  "labelled-diagram": {
    visualTextPaths: ["visual.labels"],
  },
  analogy: {
    visualTextPaths: [
      "visual.sourceConcept",
      "visual.familiarSystem",
      "visual.mappings",
    ],
  },
  "worked-example": {
    visualTextPaths: ["visual.problem", "visual.steps", "visual.answer"],
  },
  summary: {
    visualTextPaths: [
      "visual.takeaways.text",
      "visual.centralModel",
      "visual.callToAction",
    ],
  },
};

const metadataByTemplate: Record<SceneTemplate, TemplateMetadataBase> = {
  hook: {
    assetSlots: ["subject"],
    itemLimits: { "visual.supportingElements": 3 },
    migrationBehavior: "none",
    textLimits: {
      narration: 5000,
      onScreenText: 300,
      "visual.question": 80,
      "visual.prompt": 48,
    },
  },
  definition: {
    assetSlots: ["visual-example"],
    itemLimits: {},
    migrationBehavior: "none",
    textLimits: {
      narration: 5000,
      onScreenText: 300,
      "visual.term": 80,
      "visual.definition": 120,
      "visual.exampleLabel": 48,
      "visual.exampleText": 48,
    },
  },
  process: {
    assetSlots: [
      "step-1-icon",
      "step-2-icon",
      "step-3-icon",
      "step-4-icon",
      "step-5-icon",
      "step-6-icon",
    ],
    itemLimits: { "visual.steps": 6 },
    migrationBehavior: "none",
    textLimits: { narration: 5000, onScreenText: 300, "visual.steps": 80 },
  },
  "input-process-output": {
    assetSlots: [
      "input-1-icon",
      "input-2-icon",
      "input-3-icon",
      "input-4-icon",
      "process-icon",
      "output-1-icon",
      "output-2-icon",
      "output-3-icon",
      "output-4-icon",
    ],
    itemLimits: { "visual.inputs": 4, "visual.outputs": 4 },
    migrationBehavior: "none",
    textLimits: {
      narration: 5000,
      onScreenText: 300,
      "visual.inputs": 80,
      "visual.process.label": 80,
      "visual.outputs": 80,
    },
  },
  comparison: {
    assetSlots: ["left-subject-image", "right-subject-image"],
    itemLimits: { "visual.similarities": 4, "visual.differences": 4 },
    migrationBehavior: "none",
    textLimits: {
      narration: 5000,
      onScreenText: 300,
      "visual.leftSubject.label": 80,
      "visual.rightSubject.label": 80,
      "visual.similarities": 80,
      "visual.differences": 80,
    },
  },
  "cause-effect": {
    assetSlots: [
      "cause-1-icon",
      "cause-2-icon",
      "cause-3-icon",
      "mechanism-icon",
      "effect-1-icon",
      "effect-2-icon",
      "effect-3-icon",
    ],
    itemLimits: {
      "visual.causes": 3,
      "visual.effects": 3,
      "visual.connections": 9,
    },
    migrationBehavior: "none",
    textLimits: {
      narration: 5000,
      onScreenText: 300,
      "visual.causes.label": 80,
      "visual.mechanism.label": 80,
      "visual.effects.label": 80,
    },
  },
  "labelled-diagram": {
    assetSlots: ["diagram"],
    itemLimits: { "visual.labels": 6 },
    migrationBehavior: "none",
    textLimits: {
      narration: 5000,
      onScreenText: 300,
      "visual.labels.text": 80,
    },
  },
  analogy: {
    assetSlots: ["central-visual"],
    itemLimits: { "visual.mappings": 4 },
    migrationBehavior: "none",
    textLimits: {
      narration: 5000,
      onScreenText: 300,
      "visual.sourceConcept": 80,
      "visual.familiarSystem": 80,
      "visual.mappings.concept": 60,
      "visual.mappings.analogy": 60,
    },
  },
  "worked-example": {
    assetSlots: [],
    itemLimits: { "visual.steps": 12 },
    migrationBehavior: "none",
    textLimits: {
      narration: 5000,
      onScreenText: 300,
      "visual.problem": 1000,
      "visual.steps": 300,
      "visual.answer": 1000,
    },
  },
  summary: {
    assetSlots: [],
    itemLimits: { "visual.takeaways.text": 4 },
    migrationBehavior: "none",
    textLimits: {
      narration: 5000,
      onScreenText: 300,
      "visual.takeaways.text": 140,
      "visual.centralModel": 140,
      "visual.callToAction": 120,
    },
  },
};

function metadata(template: SceneTemplate): TemplateFormMetadata {
  const value = metadataByTemplate[template];
  return Object.freeze({
    ...value,
    assetSlots: Object.freeze([...value.assetSlots]),
    fields: Object.freeze(
      layouts[template].visualTextPaths.map((path) =>
        Object.freeze({
          control: value.itemLimits[path] === undefined ? "text" : "text-list",
          label: path.slice("visual.".length),
          path,
          required:
            !path.endsWith("prompt") &&
            !path.endsWith("callToAction") &&
            !path.endsWith("exampleLabel") &&
            !path.endsWith("exampleText"),
        }),
      ),
    ),
    itemLimits: Object.freeze({ ...value.itemLimits }),
    textLimits: Object.freeze({ ...value.textLimits }),
  });
}

export const sceneRegistry: SceneRegistry = Object.freeze(
  Object.fromEntries(
    sceneTemplateValues.map((template) => [
      template,
      Object.freeze({
        component:
          template === "hook"
            ? HookScene
            : template === "definition"
              ? DefinitionScene
              : template === "process"
                ? ProcessScene
                : template === "input-process-output"
                  ? IpoScene
                  : template === "comparison"
                    ? ComparisonScene
                    : template === "cause-effect"
                      ? CauseEffectScene
                      : template === "labelled-diagram"
                        ? LabelledDiagramScene
                        : template === "analogy"
                          ? AnalogyScene
                          : template === "worked-example"
                            ? WorkedExampleScene
                            : SummaryScene,
        createDefault: () => makeDefault(template),
        durationGuidance: Object.freeze({
          maximumSeconds: 60,
          minimumSeconds: 3,
        }),
        layout: layouts[template],
        metadata: metadata(template),
        template,
        visualSchema: visualSchemas[template],
      }),
    ]),
  ),
) as unknown as SceneRegistry;

export function resolveSceneDefinition(
  scene: Pick<SceneSpec, "template"> | { template: string },
): SceneDefinition<z.ZodTypeAny> {
  if (!sceneTemplateSchema.safeParse(scene.template).success)
    throw new Error(`Unsupported scene template: ${scene.template}`);
  return sceneRegistry[scene.template as SceneTemplate];
}

export function createDefaultScene<TTemplate extends SceneTemplate>(
  template: TTemplate,
): Extract<SceneSpec, { template: TTemplate }> {
  return makeDefault(template);
}

function isSafeDiagramImageSource(src: string): boolean {
  return (
    /^\/assets\/[a-z0-9/_-]+\.(png|jpe?g|webp)$/i.test(src) ||
    /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(src)
  );
}

export function resolveSafeDiagramAsset(
  assetId: string | undefined,
  resolvedAssets: SceneComponentProps["resolvedAssets"],
): ResolvedSceneAsset | undefined {
  if (assetId === undefined) return undefined;
  const asset = resolvedAssets?.[assetId];
  if (
    asset === undefined ||
    asset.assetId !== assetId ||
    !resolvedSceneAssetSourceValues.includes(asset.source) ||
    !isSafeDiagramImageSource(asset.src)
  )
    return undefined;
  return asset;
}

export type SceneValidationOptions = Readonly<{
  requireResolvedAssets?: boolean;
  resolvedAssets?: SceneComponentProps["resolvedAssets"];
}>;

export function validateScene(
  scene: unknown,
  options: SceneValidationOptions = {},
): readonly SceneValidationIssue[] {
  const sceneId =
    typeof scene === "object" &&
    scene !== null &&
    "id" in scene &&
    typeof scene.id === "string"
      ? scene.id
      : "unknown";
  const template =
    typeof scene === "object" && scene !== null && "template" in scene
      ? scene.template
      : undefined;
  if (
    typeof template === "string" &&
    !sceneTemplateSchema.safeParse(template).success
  )
    return [
      Object.freeze({
        code: "unsupported_template" as const,
        fieldPath: "template",
        message: `Unsupported scene template: ${template}`,
        sceneId,
        severity: "error" as const,
        suggestedCorrection: "Select one of the registered scene templates.",
      }),
    ];
  const parsed = sceneSpecSchema.safeParse(scene);
  if (!parsed.success)
    return parsed.error.issues.map((issue) =>
      Object.freeze({
        code: "invalid_scene",
        fieldPath: issue.path.join("."),
        message: issue.message,
        sceneId,
        severity: "error",
        suggestedCorrection: "Provide a value accepted by the scene contract.",
      }),
    );
  const definition = resolveSceneDefinition(parsed.data);
  const visualResult = definition.visualSchema.safeParse(parsed.data.visual);
  if (!visualResult.success)
    return visualResult.error.issues.map((issue) =>
      Object.freeze({
        code: "invalid_scene",
        fieldPath: `visual.${issue.path.join(".")}`,
        message: issue.message,
        sceneId: parsed.data.id,
        severity: "error",
        suggestedCorrection: "Correct the template visual input.",
      }),
    );
  if (parsed.data.template === "labelled-diagram") {
    const diagram = parsed.data;
    const diagramAsset = diagram.assetBindings.find(
      (binding) =>
        binding.slot === diagram.visual.baseAssetSlot &&
        binding.role === "diagram",
    );
    if (diagram.visual.kind === "asset" && diagramAsset === undefined)
      return [
        Object.freeze({
          code: "missing_asset" as const,
          fieldPath: "assetBindings.diagram",
          message: "The required diagram asset is missing.",
          sceneId: diagram.id,
          severity: "error" as const,
          suggestedCorrection:
            "Bind an approved source or library diagram to the diagram slot.",
        }),
      ];
    if (
      diagram.visual.kind === "asset" &&
      options.requireResolvedAssets &&
      resolveSafeDiagramAsset(diagramAsset?.assetId, options.resolvedAssets) ===
        undefined
    )
      return [
        Object.freeze({
          code: "missing_asset" as const,
          fieldPath: "resolvedAssets.diagram",
          message: "The required diagram asset could not be resolved safely.",
          sceneId: diagram.id,
          severity: "error" as const,
          suggestedCorrection:
            "Resolve the approved source or library diagram before final rendering.",
        }),
      ];
    const collisionLabelIds = planDiagramCallouts(
      diagram.visual.labels,
    ).collisionLabelIds;
    if (collisionLabelIds.length > 0)
      return [
        Object.freeze({
          code: "diagram_collision" as const,
          fieldPath: "visual.labels",
          message: `Diagram callouts overlap: ${collisionLabelIds.join(", ")}.`,
          sceneId: diagram.id,
          severity: "error" as const,
          suggestedCorrection:
            "Choose distinct semantic anchors for the affected labels.",
        }),
      ];
  }
  if (
    parsed.data.template === "summary" &&
    parsed.data.visual.centralAssetSlot !== undefined
  ) {
    const centralAssetSlot = parsed.data.visual.centralAssetSlot;
    const asset = parsed.data.assetBindings.find(
      (binding) =>
        binding.slot === centralAssetSlot && binding.role === "illustration",
    );
    if (asset === undefined)
      return [
        Object.freeze({
          code: "missing_asset" as const,
          fieldPath: "assetBindings.central-visual",
          message: "The required central summary asset is missing.",
          sceneId: parsed.data.id,
          severity: "error" as const,
          suggestedCorrection:
            "Bind an approved illustration to the central-visual slot.",
        }),
      ];
    if (
      options.requireResolvedAssets &&
      resolveSafeDiagramAsset(asset.assetId, options.resolvedAssets) ===
        undefined
    )
      return [
        Object.freeze({
          code: "missing_asset" as const,
          fieldPath: "resolvedAssets.central-visual",
          message:
            "The required central summary asset could not be resolved safely.",
          sceneId: parsed.data.id,
          severity: "error" as const,
          suggestedCorrection:
            "Resolve the approved summary asset before final rendering.",
        }),
      ];
  }
  const values: SceneTextBlock[] = [];
  if (parsed.data.title !== undefined)
    values.push({ path: "title", value: parsed.data.title });
  parsed.data.onScreenText.forEach((value, index) =>
    values.push({ path: `onScreenText.${index}`, value }),
  );
  const collectText = (value: unknown, path: string): void => {
    if (typeof value === "string") {
      values.push({ path, value });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => collectText(item, `${path}.${index}`));
      return;
    }
    if (typeof value === "object" && value !== null)
      Object.entries(value)
        .filter(
          ([key]) =>
            parsed.data.template !== "labelled-diagram" ||
            !path.startsWith("visual.labels") ||
            key === "text",
        )
        .forEach(([key, nested]) => collectText(nested, `${path}.${key}`));
  };
  for (const path of definition.layout.visualTextPaths) {
    const keys = path.slice("visual.".length).split(".");
    let value: unknown = parsed.data.visual;
    for (const key of keys)
      value =
        typeof value === "object" && value !== null && key in value
          ? (value as Record<string, unknown>)[key]
          : undefined;
    collectText(value, path);
  }
  const measurement =
    parsed.data.template === "input-process-output"
      ? (values
          .map((value) => measureSceneContent([value]))
          .find((item) => !item.fits) ?? measureSceneContent([]))
      : parsed.data.template === "comparison"
        ? ([
            values.filter((value) =>
              value.path.startsWith("visual.leftSubject"),
            ),
            values.filter((value) =>
              value.path.startsWith("visual.rightSubject"),
            ),
            values.filter((value) =>
              value.path.startsWith("visual.similarities"),
            ),
            values.filter((value) =>
              value.path.startsWith("visual.differences"),
            ),
          ]
            .map((group) => measureSceneContent(group))
            .find((item) => !item.fits) ?? measureSceneContent([]))
        : parsed.data.template === "cause-effect"
          ? ([
              values.filter((value) => value.path.startsWith("visual.causes")),
              values.filter((value) =>
                value.path.startsWith("visual.mechanism"),
              ),
              values.filter((value) => value.path.startsWith("visual.effects")),
            ]
              .map((group) => measureSceneContent(group))
              .find((item) => !item.fits) ?? measureSceneContent([]))
          : parsed.data.template === "analogy" ||
              parsed.data.template === "worked-example"
            ? (values
                .map((value) => measureSceneContent([value]))
                .find((item) => !item.fits) ?? measureSceneContent([]))
            : measureSceneContent(values);
  if (measurement.fits) return [];
  return [
    Object.freeze({
      code: "text_overflow" as const,
      fieldPath: measurement.firstOverflowPath ?? "visual",
      message: "Text exceeds the readable layout capacity.",
      sceneId: parsed.data.id,
      severity: "error" as const,
      suggestedCorrection: "Shorten this text or split it into another scene.",
    }),
  ];
}

export function measureSceneLayout(text: string): LayoutMeasurement {
  return measureSceneText(text);
}

export function SceneRuntime({
  resolvedAssets,
  runtimeMode,
  scene,
}: SceneComponentProps): JSX.Element {
  return createElement(resolveSceneDefinition(scene).component, {
    ...(resolvedAssets === undefined ? {} : { resolvedAssets }),
    ...(runtimeMode === undefined ? {} : { runtimeMode }),
    scene,
  });
}

export function ScenePreviewRuntime({
  resolvedAssets,
  scene,
}: SceneComponentProps): JSX.Element {
  return createElement(SceneRuntime, {
    ...(resolvedAssets === undefined ? {} : { resolvedAssets }),
    runtimeMode: "preview",
    scene,
  });
}

export function SceneRenderRuntime({
  resolvedAssets,
  scene,
}: SceneComponentProps): JSX.Element {
  const issues = validateScene(scene, {
    requireResolvedAssets: true,
    ...(resolvedAssets === undefined ? {} : { resolvedAssets }),
  });
  const blockingIssue = issues.find((issue) => issue.severity === "error");
  if (blockingIssue !== undefined)
    throw new Error(
      `Scene render blocked for ${blockingIssue.fieldPath}: ${blockingIssue.message}`,
    );
  return createElement(SceneRuntime, {
    ...(resolvedAssets === undefined ? {} : { resolvedAssets }),
    runtimeMode: "render",
    scene,
  });
}

export const sceneRegistryPreviewFixture = createDefaultScene("hook");
