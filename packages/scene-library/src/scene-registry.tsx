import { videoTheme } from "@avlp/design-system/video-theme";
import {
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

export type SceneValidationIssue = Readonly<{
  code: "unsupported_template" | "invalid_scene" | "text_overflow";
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

export type SceneComponentProps = Readonly<{ scene: SceneSpec }>;

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

const text = (maximum: number) => z.string().trim().min(1).max(maximum);
const itemList = z.array(text(300)).min(1).max(12);

const visualSchemas = {
  hook: z
    .object({ question: text(500), prompt: text(500).optional() })
    .strict(),
  definition: z.object({ term: text(200), definition: text(1_000) }).strict(),
  process: z.object({ steps: itemList }).strict(),
  "input-process-output": z
    .object({ input: text(500), process: text(500), output: text(500) })
    .strict(),
  comparison: z
    .object({
      leftLabel: text(200),
      rightLabel: text(200),
      similarities: itemList,
      differences: itemList,
    })
    .strict(),
  "cause-effect": z.object({ causes: itemList, effects: itemList }).strict(),
  "labelled-diagram": z
    .object({ diagramDescription: text(1_000), labels: itemList })
    .strict(),
  analogy: z
    .object({
      sourceConcept: text(500),
      analogy: text(1_000),
      mapping: itemList,
    })
    .strict(),
  "worked-example": z
    .object({
      problem: text(1_000),
      steps: itemList,
      answer: text(1_000),
    })
    .strict(),
  summary: z
    .object({
      takeaways: itemList,
      callToAction: text(500).optional(),
    })
    .strict(),
} satisfies Record<SceneTemplate, ZodType<unknown>>;

const defaults = {
  hook: { question: "What will you discover?" },
  definition: { term: "Key term", definition: "A concise explanation." },
  process: { steps: ["First step"] },
  "input-process-output": {
    input: "Input",
    process: "Process",
    output: "Output",
  },
  comparison: {
    leftLabel: "Left",
    rightLabel: "Right",
    similarities: ["Shared feature"],
    differences: ["Key difference"],
  },
  "cause-effect": { causes: ["Cause"], effects: ["Effect"] },
  "labelled-diagram": {
    diagramDescription: "A labelled diagram.",
    labels: ["Label"],
  },
  analogy: {
    sourceConcept: "Concept",
    analogy: "Familiar comparison.",
    mapping: ["Connection"],
  },
  "worked-example": {
    problem: "Example problem",
    steps: ["First step"],
    answer: "Answer",
  },
  summary: { takeaways: ["Key takeaway"] },
} as const;

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

function makeDefault(
  template: SceneTemplate,
): Extract<SceneSpec, { template: SceneTemplate }> {
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
  } as Extract<SceneSpec, { template: SceneTemplate }>;
}

const layouts: Record<SceneTemplate, SceneLayout> = {
  hook: { visualTextPaths: ["visual.question", "visual.prompt"] },
  definition: { visualTextPaths: ["visual.term", "visual.definition"] },
  process: { visualTextPaths: ["visual.steps"] },
  "input-process-output": {
    visualTextPaths: ["visual.input", "visual.process", "visual.output"],
  },
  comparison: {
    visualTextPaths: [
      "visual.leftLabel",
      "visual.rightLabel",
      "visual.similarities",
      "visual.differences",
    ],
  },
  "cause-effect": { visualTextPaths: ["visual.causes", "visual.effects"] },
  "labelled-diagram": {
    visualTextPaths: ["visual.diagramDescription", "visual.labels"],
  },
  analogy: {
    visualTextPaths: [
      "visual.sourceConcept",
      "visual.analogy",
      "visual.mapping",
    ],
  },
  "worked-example": {
    visualTextPaths: ["visual.problem", "visual.steps", "visual.answer"],
  },
  summary: { visualTextPaths: ["visual.takeaways", "visual.callToAction"] },
};

const metadataByTemplate: Record<SceneTemplate, TemplateMetadataBase> = {
  hook: {
    assetSlots: [],
    itemLimits: {},
    migrationBehavior: "none",
    textLimits: {
      narration: 5000,
      onScreenText: 300,
      "visual.question": 500,
      "visual.prompt": 500,
    },
  },
  definition: {
    assetSlots: [],
    itemLimits: {},
    migrationBehavior: "none",
    textLimits: {
      narration: 5000,
      onScreenText: 300,
      "visual.term": 200,
      "visual.definition": 1000,
    },
  },
  process: {
    assetSlots: [],
    itemLimits: { "visual.steps": 12 },
    migrationBehavior: "none",
    textLimits: { narration: 5000, onScreenText: 300 },
  },
  "input-process-output": {
    assetSlots: [],
    itemLimits: {},
    migrationBehavior: "none",
    textLimits: {
      narration: 5000,
      onScreenText: 300,
      "visual.input": 500,
      "visual.process": 500,
      "visual.output": 500,
    },
  },
  comparison: {
    assetSlots: [],
    itemLimits: { "visual.similarities": 12, "visual.differences": 12 },
    migrationBehavior: "none",
    textLimits: {
      narration: 5000,
      onScreenText: 300,
      "visual.leftLabel": 200,
      "visual.rightLabel": 200,
    },
  },
  "cause-effect": {
    assetSlots: [],
    itemLimits: { "visual.causes": 12, "visual.effects": 12 },
    migrationBehavior: "none",
    textLimits: { narration: 5000, onScreenText: 300 },
  },
  "labelled-diagram": {
    assetSlots: ["diagram"],
    itemLimits: { "visual.labels": 12 },
    migrationBehavior: "none",
    textLimits: {
      narration: 5000,
      onScreenText: 300,
      "visual.diagramDescription": 1000,
    },
  },
  analogy: {
    assetSlots: [],
    itemLimits: { "visual.mapping": 12 },
    migrationBehavior: "none",
    textLimits: {
      narration: 5000,
      onScreenText: 300,
      "visual.sourceConcept": 500,
      "visual.analogy": 1000,
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
      "visual.answer": 1000,
    },
  },
  summary: {
    assetSlots: [],
    itemLimits: { "visual.takeaways": 12 },
    migrationBehavior: "none",
    textLimits: {
      narration: 5000,
      onScreenText: 300,
      "visual.callToAction": 500,
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
          required: !path.endsWith("prompt") && !path.endsWith("callToAction"),
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
        component: PlaceholderScene,
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

export function createDefaultScene(
  template: SceneTemplate,
): Extract<SceneSpec, { template: SceneTemplate }> {
  return resolveSceneDefinition({ template }).createDefault();
}

export function validateScene(scene: unknown): readonly SceneValidationIssue[] {
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
  const values: SceneTextBlock[] = [];
  if (parsed.data.title !== undefined)
    values.push({ path: "title", value: parsed.data.title });
  parsed.data.onScreenText.forEach((value, index) =>
    values.push({ path: `onScreenText.${index}`, value }),
  );
  for (const path of definition.layout.visualTextPaths) {
    const key = path.slice("visual.".length) as keyof typeof parsed.data.visual;
    const value: unknown = parsed.data.visual[key];
    if (typeof value === "string") values.push({ path, value });
    else if (Array.isArray(value))
      value.forEach((item: unknown, index: number) => {
        if (typeof item === "string")
          values.push({ path: `${path}.${index}`, value: item });
      });
  }
  const measurement = measureSceneContent(values);
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

export function SceneRuntime({ scene }: SceneComponentProps): JSX.Element {
  return createElement(resolveSceneDefinition(scene).component, { scene });
}

export function ScenePreviewRuntime({
  scene,
}: SceneComponentProps): JSX.Element {
  return createElement(SceneRuntime, { scene });
}

export function SceneRenderRuntime({
  scene,
}: SceneComponentProps): JSX.Element {
  return createElement(SceneRuntime, { scene });
}

export const sceneRegistryPreviewFixture = createDefaultScene("definition");
