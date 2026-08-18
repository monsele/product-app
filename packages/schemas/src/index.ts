import { identifierSchema } from "@avlp/config/identifiers";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const lessonSpecVersion = "1.8" as const;
export const previousLessonSpecVersion = "1.7" as const;
const lessonSpecV1_5Version = "1.5" as const;
export const previousPreviousLessonSpecVersion = "1.4" as const;
export const legacyPreviousLessonSpecVersion = "1.3" as const;
export const legacyLessonSpecVersion = "1.2" as const;
export const initialLessonSpecVersion = "1.0" as const;
export const packageBoundary = "schemas" as const;
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

export const sourceRefSchema = z
  .object({
    documentId: identifierSchema,
    parsedDocumentVersion: z.number().int().positive(),
    pageStart: z.number().int().positive(),
    pageEnd: z.number().int().positive().optional(),
    sectionId: identifierSchema.optional(),
    blockIds: z.array(identifierSchema).min(1).max(100),
    figureIds: z.array(identifierSchema).max(100).optional(),
    tableIds: z.array(identifierSchema).max(100).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.pageEnd !== undefined && value.pageEnd < value.pageStart)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pageEnd"],
        message: "pageEnd must not precede pageStart.",
      });
  });
export type SourceRef = z.infer<typeof sourceRefSchema>;

export const generatedAdditionSchema = z
  .object({
    kind: z.enum(["analogy", "example", "illustration", "clarification"]),
    content: boundedText(2_000),
    rationale: boundedText(500),
  })
  .strict();
export type GeneratedAddition = z.infer<typeof generatedAdditionSchema>;
export const sceneAssetBindingSchema = z
  .object({
    assetId: identifierSchema,
    role: z.enum([
      "background",
      "diagram",
      "icon",
      "illustration",
      "photo",
      "supporting",
    ]),
    altText: boundedText(500).optional(),
    slot: boundedText(64).optional(),
  })
  .strict();
export type SceneAssetBinding = z.infer<typeof sceneAssetBindingSchema>;

export const sceneTemplateValues = [
  "hook",
  "definition",
  "process",
  "input-process-output",
  "comparison",
  "cause-effect",
  "labelled-diagram",
  "analogy",
  "worked-example",
  "summary",
] as const;
export const sceneTemplateSchema = z.enum(sceneTemplateValues);
export type SceneTemplate = z.infer<typeof sceneTemplateSchema>;
const sceneBaseShape = {
  id: identifierSchema,
  order: z.number().int().positive(),
  title: boundedText(160).optional(),
  narration: boundedText(5_000),
  durationSeconds: z.number().int().min(1).max(300),
  onScreenText: z.array(boundedText(300)).max(12),
  transition: z.enum(["cut", "fade", "slide"]),
  assetBindings: z.array(sceneAssetBindingSchema).max(20),
  sourceRefs: z.array(sourceRefSchema).min(1).max(100),
  generatedAdditions: z.array(generatedAdditionSchema).max(20),
} as const;
export const sceneBaseSchema = z.object(sceneBaseShape).strict();
const labelledItems = z.array(boundedText(300)).min(1).max(12);
export const hookVisualSchema = z
  .object({
    question: boundedText(80),
    prompt: boundedText(48).optional(),
    supportingElements: z.array(boundedText(12)).max(3).optional(),
  })
  .strict();
export type HookVisual = z.infer<typeof hookVisualSchema>;
export const definitionVisualSchema = z
  .object({
    term: boundedText(80),
    definition: boundedText(120),
    exampleLabel: boundedText(48).optional(),
    exampleText: boundedText(48).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.exampleLabel === undefined) !==
      (value.exampleText === undefined)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [
          value.exampleLabel === undefined ? "exampleLabel" : "exampleText",
        ],
        message: "exampleLabel and exampleText must be provided together.",
      });
  });
export type DefinitionVisual = z.infer<typeof definitionVisualSchema>;
export const processVisualSchema = z
  .object({
    steps: z.array(boundedText(80)).min(2).max(6),
  })
  .strict();
export type ProcessVisual = z.infer<typeof processVisualSchema>;
export const ipoAssetSlotSchema = z.enum([
  "input-1-icon",
  "input-2-icon",
  "input-3-icon",
  "input-4-icon",
  "process-icon",
  "output-1-icon",
  "output-2-icon",
  "output-3-icon",
  "output-4-icon",
]);
export const ipoItemSchema = z
  .object({
    label: boundedText(80),
    assetSlot: ipoAssetSlotSchema.optional(),
  })
  .strict();
export type IpoItem = z.infer<typeof ipoItemSchema>;
export const ipoVisualSchema = z
  .object({
    inputs: z.array(ipoItemSchema).min(1).max(4),
    process: ipoItemSchema,
    outputs: z.array(ipoItemSchema).min(1).max(4),
  })
  .strict();
export type IpoVisual = z.infer<typeof ipoVisualSchema>;
export const comparisonAssetSlotSchema = z.enum([
  "left-subject-image",
  "right-subject-image",
]);
export const comparisonSubjectSchema = z
  .object({
    label: boundedText(80),
    assetSlot: comparisonAssetSlotSchema.optional(),
  })
  .strict();
export type ComparisonSubject = z.infer<typeof comparisonSubjectSchema>;
export const comparisonVisualSchema = z
  .object({
    leftSubject: comparisonSubjectSchema,
    rightSubject: comparisonSubjectSchema,
    similarities: z.array(boundedText(80)).min(1).max(4),
    differences: z.array(boundedText(80)).min(1).max(4),
  })
  .strict();
export type ComparisonVisual = z.infer<typeof comparisonVisualSchema>;
export const causeEffectAssetSlotSchema = z.enum([
  "cause-1-icon",
  "cause-2-icon",
  "cause-3-icon",
  "mechanism-icon",
  "effect-1-icon",
  "effect-2-icon",
  "effect-3-icon",
]);
export const causeEffectNodeSchema = z
  .object({
    id: boundedText(40).regex(/^[a-z][a-z0-9-]*$/),
    label: boundedText(80),
    assetSlot: causeEffectAssetSlotSchema.optional(),
  })
  .strict();
export type CauseEffectNode = z.infer<typeof causeEffectNodeSchema>;
export const causeEffectConnectionSchema = z
  .object({ from: boundedText(40), to: boundedText(40) })
  .strict();
export type CauseEffectConnection = z.infer<typeof causeEffectConnectionSchema>;
export const causeEffectVisualSchema = z
  .object({
    causes: z.array(causeEffectNodeSchema).min(1).max(3),
    mechanism: causeEffectNodeSchema.optional(),
    effects: z.array(causeEffectNodeSchema).min(1).max(3),
    connections: z.array(causeEffectConnectionSchema).min(1).max(9),
  })
  .strict()
  .superRefine((value, context) => {
    const nodes = [
      ...value.causes,
      ...(value.mechanism === undefined ? [] : [value.mechanism]),
      ...value.effects,
    ];
    const ids = new Set<string>();
    nodes.forEach((node, index) => {
      if (ids.has(node.id))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [
            index < value.causes.length
              ? "causes"
              : index === value.causes.length
                ? "mechanism"
                : "effects",
            "id",
          ],
          message: "Causal node IDs must be unique.",
        });
      ids.add(node.id);
    });
    const expected = new Set<string>();
    if (value.mechanism === undefined)
      value.causes.forEach((cause) =>
        value.effects.forEach((effect) =>
          expected.add(`${cause.id}:${effect.id}`),
        ),
      );
    else {
      value.causes.forEach((cause) =>
        expected.add(`${cause.id}:${value.mechanism?.id}`),
      );
      value.effects.forEach((effect) =>
        expected.add(`${value.mechanism?.id}:${effect.id}`),
      );
    }
    const actual = value.connections.map(
      (connection) => `${connection.from}:${connection.to}`,
    );
    if (
      new Set(actual).size !== actual.length ||
      actual.length !== expected.size ||
      actual.some((connection) => !expected.has(connection))
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["connections"],
        message:
          "Connections must define the complete directed cause-to-mechanism-to-effect chain.",
      });
  });
export type CauseEffectVisual = z.infer<typeof causeEffectVisualSchema>;
export const diagramAnchorSchema = z.enum([
  "top-left",
  "top",
  "top-right",
  "right",
  "bottom-right",
  "bottom",
  "bottom-left",
  "left",
  "center",
]);
export type DiagramAnchor = z.infer<typeof diagramAnchorSchema>;
export const diagramLabelSchema = z
  .object({
    anchor: diagramAnchorSchema,
    id: boundedText(40).regex(/^[a-z][a-z0-9-]*$/),
    text: boundedText(80),
  })
  .strict();
export type DiagramLabel = z.infer<typeof diagramLabelSchema>;
export const diagramVisualSchema = z
  .object({
    baseAssetSlot: z.literal("diagram").optional(),
    kind: z.enum(["asset", "shapes"]),
    labels: z.array(diagramLabelSchema).min(1).max(6),
    shape: z.enum(["cell", "cycle", "plant", "system"]).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === "asset" && value.baseAssetSlot === undefined)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["baseAssetSlot"],
        message: "Asset diagrams require the diagram asset slot.",
      });
    if (value.kind === "shapes" && value.shape === undefined)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shape"],
        message: "Shapes-only diagrams require an approved shape.",
      });
    const ids = new Set<string>();
    value.labels.forEach((label, index) => {
      if (ids.has(label.id))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["labels", index, "id"],
          message: "Diagram label IDs must be unique.",
        });
      ids.add(label.id);
    });
  });
export type DiagramVisual = z.infer<typeof diagramVisualSchema>;
export const analogyMappingPairSchema = z
  .object({ analogy: boundedText(60), concept: boundedText(60) })
  .strict();
export type AnalogyMappingPair = z.infer<typeof analogyMappingPairSchema>;
export const analogyVisualSchema = z
  .object({
    familiarSystem: boundedText(80),
    mappings: z.array(analogyMappingPairSchema).min(1).max(4),
    sourceConcept: boundedText(80),
  })
  .strict()
  .superRefine((value, context) => {
    const concepts = new Set<string>();
    const analogies = new Set<string>();
    value.mappings.forEach((mapping, index) => {
      const concept = mapping.concept.toLocaleLowerCase();
      const analogy = mapping.analogy.toLocaleLowerCase();
      if (concepts.has(concept) || analogies.has(analogy))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["mappings", index],
          message:
            "Each analogy mapping must use distinct concept and familiar-system terms.",
        });
      concepts.add(concept);
      analogies.add(analogy);
    });
  });
export type AnalogyVisual = z.infer<typeof analogyVisualSchema>;
export const workedExampleStepSchema = boundedText(300);
export type WorkedExampleStep = z.infer<typeof workedExampleStepSchema>;
export const workedExampleVisualSchema = z
  .object({
    answer: boundedText(1_000),
    problem: boundedText(1_000),
    steps: z.array(workedExampleStepSchema).min(1).max(12),
  })
  .strict();
export type WorkedExampleVisual = z.infer<typeof workedExampleVisualSchema>;
export const summaryTakeawaySchema = z
  .object({
    text: boundedText(140),
    objectiveId: identifierSchema.optional(),
  })
  .strict();
export const summaryVisualSchema = z
  .object({
    takeaways: z.array(summaryTakeawaySchema).min(1).max(4),
    centralModel: boundedText(140).optional(),
    centralAssetSlot: z.literal("central-visual").optional(),
    callToAction: boundedText(120).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.centralModel !== undefined &&
      value.centralAssetSlot !== undefined
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["centralAssetSlot"],
        message: "Choose either a central model or a central asset.",
      });
  });
export type SummaryVisual = z.infer<typeof summaryVisualSchema>;
const visual = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();

export const sceneSpecSchema = z.discriminatedUnion("template", [
  z
    .object({
      ...sceneBaseShape,
      template: z.literal("hook"),
      visual: hookVisualSchema,
    })
    .strict(),
  z
    .object({
      ...sceneBaseShape,
      template: z.literal("definition"),
      visual: definitionVisualSchema,
    })
    .strict(),
  z
    .object({
      ...sceneBaseShape,
      template: z.literal("process"),
      visual: processVisualSchema,
    })
    .strict(),
  z
    .object({
      ...sceneBaseShape,
      template: z.literal("input-process-output"),
      visual: ipoVisualSchema,
    })
    .strict(),
  z
    .object({
      ...sceneBaseShape,
      template: z.literal("comparison"),
      visual: comparisonVisualSchema,
    })
    .strict(),
  z
    .object({
      ...sceneBaseShape,
      template: z.literal("cause-effect"),
      visual: causeEffectVisualSchema,
    })
    .strict(),
  z
    .object({
      ...sceneBaseShape,
      template: z.literal("labelled-diagram"),
      visual: diagramVisualSchema,
    })
    .strict(),
  z
    .object({
      ...sceneBaseShape,
      template: z.literal("analogy"),
      visual: analogyVisualSchema,
    })
    .strict(),
  z
    .object({
      ...sceneBaseShape,
      template: z.literal("worked-example"),
      visual: workedExampleVisualSchema,
    })
    .strict(),
  z
    .object({
      ...sceneBaseShape,
      template: z.literal("summary"),
      visual: summaryVisualSchema,
    })
    .strict(),
]);
export type SceneBase = Omit<
  z.infer<typeof sceneSpecSchema>,
  "template" | "visual"
>;
export type SceneSpec = z.infer<typeof sceneSpecSchema>;
const previousIpoSceneSpecSchema = z
  .object({
    ...sceneBaseShape,
    template: z.literal("input-process-output"),
    visual: visual({
      input: boundedText(500),
      process: boundedText(500),
      output: boundedText(500),
    }),
  })
  .strict();
const previousComparisonSceneSpecSchema = z
  .object({
    ...sceneBaseShape,
    template: z.literal("comparison"),
    visual: visual({
      leftLabel: boundedText(200),
      rightLabel: boundedText(200),
      similarities: labelledItems,
      differences: labelledItems,
    }),
  })
  .strict();
const previousCauseEffectSceneSpecSchema = z
  .object({
    ...sceneBaseShape,
    template: z.literal("cause-effect"),
    visual: visual({ causes: labelledItems, effects: labelledItems }),
  })
  .strict();
const previousSceneSpecSchema = z.union([
  sceneSpecSchema,
  previousIpoSceneSpecSchema,
  previousComparisonSceneSpecSchema,
  previousCauseEffectSceneSpecSchema,
]);
const previousProcessSceneSpecSchema = z
  .object({
    ...sceneBaseShape,
    template: z.literal("process"),
    visual: visual({ steps: labelledItems }),
  })
  .strict();
const previousPreviousSceneSpecSchema = z.union([
  previousSceneSpecSchema,
  previousProcessSceneSpecSchema,
]);
const legacyDefinitionSceneSpecSchema = z
  .object({
    ...sceneBaseShape,
    template: z.literal("definition"),
    visual: visual({
      term: boundedText(200),
      definition: boundedText(1_000),
    }),
  })
  .strict();
const legacySceneSpecSchema = z.union([
  previousPreviousSceneSpecSchema,
  legacyDefinitionSceneSpecSchema,
]);

export const lessonSpecSchema = z
  .object({
    schemaVersion: z.literal(lessonSpecVersion),
    lessonId: identifierSchema,
    projectId: identifierSchema,
    title: boundedText(200),
    subject: boundedText(200),
    audience: z
      .object({
        ageBand: z.enum(["8-10", "11-13", "14-16", "adult-beginner"]),
        difficulty: z.enum(["introductory", "intermediate"]),
        priorKnowledge: z.array(boundedText(300)).max(20),
      })
      .strict(),
    targetDurationSeconds: z.union([
      z.literal(180),
      z.literal(300),
      z.literal(420),
    ]),
    tone: z.enum(["friendly", "academic", "conversational"]),
    themeId: z.literal("mvp-default"),
    objectiveIds: z.array(identifierSchema).min(1).max(50),
    voice: z
      .object({
        providerVoiceId: boundedText(200),
        speakingRate: z.number().min(0.5).max(2),
      })
      .strict(),
    scenes: z.array(sceneSpecSchema).min(1).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    const seenIds = new Set<string>();
    const seenOrders = new Set<number>();
    for (const [index, scene] of value.scenes.entries()) {
      if (seenIds.has(scene.id))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["scenes", index, "id"],
          message: "Scene IDs must be unique.",
        });
      if (seenOrders.has(scene.order))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["scenes", index, "order"],
          message: "Scene order values must be unique.",
        });
      seenIds.add(scene.id);
      seenOrders.add(scene.order);
    }
  });
export type LessonSpec = z.infer<typeof lessonSpecSchema>;
export const lessonSpecJsonSchema = zodToJsonSchema(
  lessonSpecSchema,
  "LessonSpec",
);

const previousLessonSpecEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(legacyLessonSpecVersion),
    scenes: z.array(previousSceneSpecSchema).min(1).max(100),
  })
  .passthrough();

function migrateIpoVisuals(
  scenes: readonly z.infer<typeof previousSceneSpecSchema>[],
): LessonSpec["scenes"] {
  return scenes.map((scene) => {
    if (scene.template !== "input-process-output" || "inputs" in scene.visual)
      return scene;
    return {
      ...scene,
      visual: {
        inputs: [{ label: scene.visual.input }],
        process: { label: scene.visual.process },
        outputs: [{ label: scene.visual.output }],
      },
    };
  }) as LessonSpec["scenes"];
}

export function migrateLessonSpecV1_2ToV1_3(input: unknown): LessonSpec {
  const parsed = previousLessonSpecEnvelopeSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      "LessonSpec 1.2 contains content that requires an explicit teacher migration before it can become 1.3.",
    );
  return migrateLessonSpecV1_3ToV1_4({
    ...parsed.data,
    schemaVersion: "1.3",
    scenes: migrateIpoVisuals(parsed.data.scenes),
  });
}

const previousComparisonVisualSchema = visual({
  leftLabel: boundedText(200),
  rightLabel: boundedText(200),
  similarities: labelledItems,
  differences: labelledItems,
});
const previousLessonSpecV1_3EnvelopeSchema = z
  .object({
    schemaVersion: z.literal("1.3"),
    scenes: z.array(z.unknown()).min(1).max(100),
  })
  .passthrough();

export function migrateLessonSpecV1_3ToV1_4(input: unknown): LessonSpec {
  const parsed = previousLessonSpecV1_3EnvelopeSchema.safeParse(input);
  if (!parsed.success)
    throw new Error("LessonSpec 1.3 is not a valid migration input.");
  const migrated = previousLessonSpecV1_4EnvelopeSchema.safeParse({
    ...parsed.data,
    schemaVersion: previousPreviousLessonSpecVersion,
    scenes: parsed.data.scenes.map((scene) => {
      const prior = z
        .object({
          template: z.literal("comparison"),
          visual: previousComparisonVisualSchema,
        })
        .passthrough()
        .safeParse(scene);
      if (!prior.success) return scene;
      return {
        ...prior.data,
        visual: {
          leftSubject: { label: prior.data.visual.leftLabel },
          rightSubject: { label: prior.data.visual.rightLabel },
          similarities: prior.data.visual.similarities,
          differences: prior.data.visual.differences,
        },
      };
    }),
  });
  if (migrated.success) return migrateLessonSpecV1_4ToV1_5(migrated.data);
  throw new Error(
    "LessonSpec 1.3 contains content that requires an explicit teacher migration before it can become 1.4.",
  );
}

const previousCauseEffectVisualSchema = visual({
  causes: labelledItems,
  effects: labelledItems,
});
const previousLessonSpecV1_4EnvelopeSchema = z
  .object({
    schemaVersion: z.literal(previousPreviousLessonSpecVersion),
    scenes: z.array(z.unknown()).min(1).max(100),
  })
  .passthrough();
const previousLessonSpecV1_5EnvelopeSchema = z
  .object({
    schemaVersion: z.literal(lessonSpecV1_5Version),
    scenes: z.array(z.unknown()).min(1).max(100),
  })
  .passthrough();

export function migrateLessonSpecV1_4ToV1_5(input: unknown): LessonSpec {
  const parsed = previousLessonSpecV1_4EnvelopeSchema.safeParse(input);
  if (!parsed.success)
    throw new Error("LessonSpec 1.4 is not a valid migration input.");
  const migrated = previousLessonSpecV1_5EnvelopeSchema.safeParse({
    ...parsed.data,
    schemaVersion: lessonSpecV1_5Version,
    scenes: parsed.data.scenes.map((scene) => {
      const prior = z
        .object({
          template: z.literal("cause-effect"),
          visual: previousCauseEffectVisualSchema,
        })
        .passthrough()
        .safeParse(scene);
      if (!prior.success) return scene;
      const causes = prior.data.visual.causes.map((label, index) => ({
        id: `cause-${index + 1}`,
        label,
        assetSlot: `cause-${index + 1}-icon` as const,
      }));
      const effects = prior.data.visual.effects.map((label, index) => ({
        id: `effect-${index + 1}`,
        label,
        assetSlot: `effect-${index + 1}-icon` as const,
      }));
      return {
        ...prior.data,
        visual: {
          causes,
          effects,
          connections: causes.flatMap((cause) =>
            effects.map((effect) => ({ from: cause.id, to: effect.id })),
          ),
        },
      };
    }),
  });
  if (migrated.success) return migrateLessonSpecV1_5ToV1_6(migrated.data);
  throw new Error(
    "LessonSpec 1.4 contains content that requires an explicit teacher migration before it can become 1.5.",
  );
}

const previousDiagramVisualSchema = visual({
  diagramDescription: boundedText(1_000),
  labels: labelledItems,
});
const diagramMigrationAnchors: readonly DiagramAnchor[] = [
  "top-left",
  "top-right",
  "right",
  "bottom-right",
  "bottom-left",
  "left",
];

export function migrateLessonSpecV1_5ToV1_6(input: unknown): LessonSpec {
  const parsed = previousLessonSpecV1_5EnvelopeSchema.safeParse(input);
  if (!parsed.success)
    throw new Error("LessonSpec 1.5 is not a valid migration input.");
  const migrated = lessonSpecSchema.safeParse({
    ...parsed.data,
    schemaVersion: lessonSpecVersion,
    scenes: parsed.data.scenes.map((scene) => {
      const prior = z
        .object({
          template: z.literal("labelled-diagram"),
          visual: previousDiagramVisualSchema,
        })
        .passthrough()
        .safeParse(scene);
      if (!prior.success) return scene;
      return {
        ...prior.data,
        visual: {
          kind: "shapes",
          shape: "system",
          labels: prior.data.visual.labels.slice(0, 6).map((text, index) => ({
            anchor: diagramMigrationAnchors[index] ?? "center",
            id: `label-${index + 1}`,
            text,
          })),
        },
      };
    }),
  });
  if (migrated.success) return migrated.data;
  throw new Error(
    "LessonSpec 1.5 contains content that requires an explicit teacher migration before it can become 1.6.",
  );
}

const previousAnalogyVisualSchema = visual({
  analogy: boundedText(1_000),
  mapping: labelledItems,
  sourceConcept: boundedText(500),
});
const previousLessonSpecV1_6EnvelopeSchema = z
  .object({
    schemaVersion: z.literal("1.6"),
    scenes: z.array(z.unknown()).min(1).max(100),
  })
  .passthrough();
const previousLessonSpecV1_7EnvelopeSchema = z
  .object({
    schemaVersion: z.literal(previousLessonSpecVersion),
    scenes: z.array(z.unknown()).min(1).max(100),
  })
  .passthrough();

export function migrateLessonSpecV1_7ToV1_8(input: unknown): LessonSpec {
  const parsed = previousLessonSpecV1_7EnvelopeSchema.safeParse(input);
  if (!parsed.success)
    throw new Error("LessonSpec 1.7 is not a valid migration input.");
  const migrated = lessonSpecSchema.safeParse({
    ...parsed.data,
    schemaVersion: lessonSpecVersion,
    scenes: parsed.data.scenes.map((scene) => {
      const prior = z
        .object({
          template: z.literal("summary"),
          visual: z
            .object({
              takeaways: z.array(boundedText(300)).min(1).max(12),
              callToAction: boundedText(500).optional(),
            })
            .strict(),
        })
        .passthrough()
        .safeParse(scene);
      if (!prior.success) return scene;
      if (prior.data.visual.takeaways.length > 4)
        throw new Error(
          "LessonSpec 1.7 summary content requires an explicit teacher migration before it can become 1.8.",
        );
      return {
        ...prior.data,
        visual: {
          ...prior.data.visual,
          takeaways: prior.data.visual.takeaways.map((text) => ({ text })),
        },
      };
    }),
  });
  if (migrated.success) return migrated.data;
  throw new Error(
    "LessonSpec 1.7 contains content that requires an explicit teacher migration before it can become 1.8.",
  );
}

export function migrateLessonSpecV1_6ToV1_7(input: unknown): LessonSpec {
  const parsed = previousLessonSpecV1_6EnvelopeSchema.safeParse(input);
  if (!parsed.success)
    throw new Error("LessonSpec 1.6 is not a valid migration input.");
  const hasLegacyAnalogy = parsed.data.scenes.some(
    (scene) =>
      z
        .object({
          template: z.literal("analogy"),
          visual: previousAnalogyVisualSchema,
        })
        .passthrough()
        .safeParse(scene).success,
  );
  if (hasLegacyAnalogy)
    throw new Error(
      "LessonSpec 1.6 analogy content requires an explicit teacher migration before it can become 1.7.",
    );
  return migrateLessonSpecV1_7ToV1_8({
    ...parsed.data,
    schemaVersion: previousLessonSpecVersion,
  });
}

const previousPreviousLessonSpecEnvelopeSchema = z
  .object({
    schemaVersion: z.literal("1.1"),
    scenes: z.array(previousPreviousSceneSpecSchema).min(1).max(100),
  })
  .passthrough();

export function migrateLessonSpecV1_1ToV1_3(input: unknown): LessonSpec {
  const previous = previousPreviousLessonSpecEnvelopeSchema.parse(input);
  return migrateLessonSpecV1_2ToV1_3({
    ...previous,
    schemaVersion: legacyLessonSpecVersion,
  });
}

const legacyLessonSpecEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(initialLessonSpecVersion),
    scenes: z.array(legacySceneSpecSchema).min(1).max(100),
  })
  .passthrough();

export function migrateLessonSpecV1_0ToV1_1(input: unknown): LessonSpec {
  const legacy = legacyLessonSpecEnvelopeSchema.parse(input);
  return migrateLessonSpecV1_2ToV1_3({
    ...legacy,
    schemaVersion: legacyLessonSpecVersion,
    scenes: migrateIpoVisuals(legacy.scenes),
  });
}

export function parseLessonSpec(input: unknown): LessonSpec {
  const current = lessonSpecSchema.safeParse(input);
  if (current.success) return current.data;
  if (
    typeof input === "object" &&
    input !== null &&
    "schemaVersion" in input &&
    input.schemaVersion === initialLessonSpecVersion
  )
    return migrateLessonSpecV1_0ToV1_1(input);
  if (
    typeof input === "object" &&
    input !== null &&
    "schemaVersion" in input &&
    input.schemaVersion === previousLessonSpecVersion
  )
    return migrateLessonSpecV1_7ToV1_8(input);
  if (
    typeof input === "object" &&
    input !== null &&
    "schemaVersion" in input &&
    input.schemaVersion === previousPreviousLessonSpecVersion
  )
    return migrateLessonSpecV1_4ToV1_5(input);
  if (
    typeof input === "object" &&
    input !== null &&
    "schemaVersion" in input &&
    input.schemaVersion === legacyPreviousLessonSpecVersion
  )
    return migrateLessonSpecV1_3ToV1_4(input);
  if (
    typeof input === "object" &&
    input !== null &&
    "schemaVersion" in input &&
    input.schemaVersion === legacyLessonSpecVersion
  )
    return migrateLessonSpecV1_2ToV1_3(input);
  if (
    typeof input === "object" &&
    input !== null &&
    "schemaVersion" in input &&
    input.schemaVersion === "1.1"
  )
    return migrateLessonSpecV1_1ToV1_3(input);
  return lessonSpecSchema.parse(input);
}

export const normalizedDocumentVersion = "1.0" as const;
const normalizedText = (maximum: number) => boundedText(maximum);
const pageRangeShape = {
  pageStart: z.number().int().positive(),
  pageEnd: z.number().int().positive().optional(),
} as const;
const pageRangeValidation = (
  value: { pageStart: number; pageEnd?: number | undefined },
  context: z.RefinementCtx,
): void => {
  if (value.pageEnd !== undefined && value.pageEnd < value.pageStart)
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["pageEnd"],
      message: "pageEnd must not precede pageStart.",
    });
};
export const normalizedSectionSchema = z
  .object({
    id: identifierSchema,
    parentSectionId: identifierSchema.optional(),
    order: z.number().int().positive(),
    level: z.number().int().min(1).max(10),
    heading: normalizedText(1_000),
    ...pageRangeShape,
    blockIds: z.array(identifierSchema).max(10_000),
    figureIds: z.array(identifierSchema).max(1_000),
    tableIds: z.array(identifierSchema).max(1_000),
  })
  .strict()
  .superRefine(pageRangeValidation);
export type NormalizedSection = z.infer<typeof normalizedSectionSchema>;

const contentBlockBaseShape = {
  id: identifierSchema,
  sectionId: identifierSchema,
  order: z.number().int().positive(),
  ...pageRangeShape,
  boundingBox: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      width: z.number().positive().max(1),
      height: z.number().positive().max(1),
    })
    .strict()
    .superRefine((value, context) => {
      if (value.x + value.width > 1)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["width"],
          message: "Bounding box must fit within the page width.",
        });
      if (value.y + value.height > 1)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["height"],
          message: "Bounding box must fit within the page height.",
        });
    })
    .optional(),
} as const;
export const contentBlockSchema = z.discriminatedUnion("kind", [
  z
    .object({
      ...contentBlockBaseShape,
      kind: z.literal("paragraph"),
      text: normalizedText(50_000),
    })
    .strict(),
  z
    .object({
      ...contentBlockBaseShape,
      kind: z.literal("list"),
      items: z.array(normalizedText(10_000)).min(1).max(1_000),
    })
    .strict(),
  z
    .object({
      ...contentBlockBaseShape,
      kind: z.literal("equation"),
      latex: normalizedText(20_000),
      text: normalizedText(20_000).optional(),
    })
    .strict(),
  z
    .object({
      ...contentBlockBaseShape,
      kind: z.literal("caption"),
      text: normalizedText(10_000),
    })
    .strict(),
  z
    .object({
      ...contentBlockBaseShape,
      kind: z.literal("unsupported"),
      parserKind: normalizedText(200),
      rawRepresentation: z.unknown(),
    })
    .strict(),
]);
export type ContentBlock = z.infer<typeof contentBlockSchema>;

export const extractedFigureSchema = z
  .object({
    id: identifierSchema,
    sectionId: identifierSchema,
    ...pageRangeShape,
    order: z.number().int().positive(),
    captionBlockId: identifierSchema.optional(),
    altText: normalizedText(10_000).optional(),
    sourceLocator: normalizedText(2_000).optional(),
    asset: z
      .object({
        checksumSha256: z.string().regex(/^[0-9a-f]{64}$/i),
        contentType: z.enum([
          "image/gif",
          "image/jpeg",
          "image/png",
          "image/webp",
        ]),
        byteLength: z
          .number()
          .int()
          .positive()
          .max(25 * 1024 * 1024),
        width: z.number().int().positive().max(20_000).optional(),
        height: z.number().int().positive().max(20_000).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine(pageRangeValidation);
export type ExtractedFigure = z.infer<typeof extractedFigureSchema>;

export const parsedTableCellSchema = z
  .object({
    row: z.number().int().nonnegative(),
    column: z.number().int().nonnegative(),
    text: z.string().max(10_000),
    rowSpan: z.number().int().positive().max(10_000).default(1),
    columnSpan: z.number().int().positive().max(10_000).default(1),
  })
  .strict();
export type ParsedTableCell = z.infer<typeof parsedTableCellSchema>;

export const parsedTableSchema = z
  .object({
    id: identifierSchema,
    sectionId: identifierSchema,
    ...pageRangeShape,
    order: z.number().int().positive(),
    captionBlockId: identifierSchema.optional(),
    columns: z.array(normalizedText(1_000)).min(1).max(500),
    rows: z.array(z.array(z.string().max(10_000))).max(10_000),
    cells: z.array(parsedTableCellSchema).max(100_000).optional(),
    rawRepresentation: z.unknown().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    pageRangeValidation(value, context);
    for (const [index, row] of value.rows.entries())
      if (row.length !== value.columns.length)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rows", index],
          message: "Every table row must have one cell per column.",
        });
  });
export type ParsedTable = z.infer<typeof parsedTableSchema>;

export const ingestionWarningCodeValues = [
  "unknown_block",
  "low_ocr_quality",
  "missing_caption",
  "malformed_table",
  "malformed_media",
  "uncertain_reading_order",
  "duplicate_reading_order",
] as const;
export const ingestionWarningCodeSchema = z.enum(ingestionWarningCodeValues);
export type IngestionWarningCode = z.infer<typeof ingestionWarningCodeSchema>;

export const ingestionWarningSeverityValues = [
  "info",
  "warning",
  "error",
] as const;
export const ingestionWarningSeveritySchema = z.enum(
  ingestionWarningSeverityValues,
);
export type IngestionWarningSeverity = z.infer<
  typeof ingestionWarningSeveritySchema
>;

export const ingestionWarningSchema = z
  .object({
    code: ingestionWarningCodeSchema,
    severity: ingestionWarningSeveritySchema,
    message: normalizedText(2_000),
    ...pageRangeShape,
    sectionId: identifierSchema.optional(),
    blockId: identifierSchema.optional(),
    figureId: identifierSchema.optional(),
    tableId: identifierSchema.optional(),
  })
  .strict()
  .superRefine(pageRangeValidation);
export type IngestionWarning = z.infer<typeof ingestionWarningSchema>;

export const ingestionQualityStatusSchema = z.enum([
  "blocked",
  "review_required",
  "ready",
]);
export type IngestionQualityStatus = z.infer<
  typeof ingestionQualityStatusSchema
>;

export const ingestionQualityFindingSchema = z
  .object({
    code: z.enum([
      "unknown_block",
      "low_ocr_quality",
      "missing_caption",
      "malformed_table",
      "malformed_media",
      "uncertain_reading_order",
      "duplicate_reading_order",
      "parser_failure",
    ]),
    severity: z.enum(["warning", "blocking"]),
    message: normalizedText(2_000),
    ...pageRangeShape,
    sectionId: identifierSchema.optional(),
    blockId: identifierSchema.optional(),
    figureId: identifierSchema.optional(),
    tableId: identifierSchema.optional(),
  })
  .strict()
  .superRefine(pageRangeValidation);
export type IngestionQualityFinding = z.infer<
  typeof ingestionQualityFindingSchema
>;

export const ingestionQualityReportSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    status: ingestionQualityStatusSchema,
    findings: z.array(ingestionQualityFindingSchema).max(10_000),
  })
  .strict();
export type IngestionQualityReport = z.infer<
  typeof ingestionQualityReportSchema
>;

function uniqueIdentifiers(
  values: readonly { id: string }[],
  path: string,
  context: z.RefinementCtx,
): Set<string> {
  const identifiers = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (identifiers.has(value.id))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [path, index, "id"],
        message: `${path} IDs must be unique.`,
      });
    identifiers.add(value.id);
  }
  return identifiers;
}

export const normalizedDocumentSchema = z
  .object({
    schemaVersion: z.literal(normalizedDocumentVersion),
    id: identifierSchema,
    sourceDocumentId: identifierSchema,
    parsedDocumentVersion: z.number().int().positive(),
    language: z.literal("en"),
    pageCount: z.number().int().positive().max(20),
    title: normalizedText(1_000).optional(),
    sections: z.array(normalizedSectionSchema).max(10_000),
    blocks: z.array(contentBlockSchema).max(100_000),
    figures: z.array(extractedFigureSchema).max(10_000),
    tables: z.array(parsedTableSchema).max(10_000),
    warnings: z.array(ingestionWarningSchema).max(10_000),
  })
  .strict()
  .superRefine((value, context) => {
    const sectionIds = uniqueIdentifiers(value.sections, "sections", context);
    const blockIds = uniqueIdentifiers(value.blocks, "blocks", context);
    const figureIds = uniqueIdentifiers(value.figures, "figures", context);
    const tableIds = uniqueIdentifiers(value.tables, "tables", context);
    const sectionsById = new Map(
      value.sections.map((section) => [section.id, section]),
    );
    const blocksById = new Map(value.blocks.map((block) => [block.id, block]));
    const figuresById = new Map(
      value.figures.map((figure) => [figure.id, figure]),
    );
    const tablesById = new Map(value.tables.map((table) => [table.id, table]));
    const sectionOrders = new Set<string>();
    const referencedBlockIds = new Set<string>();
    const referencedFigureIds = new Set<string>();
    const referencedTableIds = new Set<string>();
    const withinDocument = (
      range: { pageStart: number; pageEnd?: number | undefined },
      path: (string | number)[],
    ): void => {
      if ((range.pageEnd ?? range.pageStart) > value.pageCount)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: "Page provenance exceeds the document page count.",
        });
    };
    for (const [index, section] of value.sections.entries()) {
      withinDocument(section, ["sections", index, "pageEnd"]);
      if (
        section.parentSectionId !== undefined &&
        !sectionIds.has(section.parentSectionId)
      )
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sections", index, "parentSectionId"],
          message: "Parent section must exist in this document.",
        });
      const parent =
        section.parentSectionId === undefined
          ? undefined
          : sectionsById.get(section.parentSectionId);
      if (parent !== undefined && parent.level >= section.level)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sections", index, "level"],
          message:
            "A child section level must be greater than its parent level.",
        });
      const orderKey = `${section.parentSectionId ?? "root"}:${section.order}`;
      if (sectionOrders.has(orderKey))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sections", index, "order"],
          message: "Sibling section order values must be unique.",
        });
      sectionOrders.add(orderKey);
      for (const [referenceIndex, blockId] of section.blockIds.entries())
        if (!blockIds.has(blockId))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["sections", index, "blockIds", referenceIndex],
            message: "Section block reference must exist.",
          });
        else referencedBlockIds.add(blockId);
      for (const [referenceIndex, blockId] of section.blockIds.entries()) {
        const block = blocksById.get(blockId);
        if (block !== undefined && block.sectionId !== section.id)
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["sections", index, "blockIds", referenceIndex],
            message:
              "Section block references must point to blocks in that section.",
          });
      }
      for (const [referenceIndex, figureId] of section.figureIds.entries())
        if (!figureIds.has(figureId))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["sections", index, "figureIds", referenceIndex],
            message: "Section figure reference must exist.",
          });
        else referencedFigureIds.add(figureId);
      for (const [referenceIndex, figureId] of section.figureIds.entries()) {
        const figure = figuresById.get(figureId);
        if (figure !== undefined && figure.sectionId !== section.id)
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["sections", index, "figureIds", referenceIndex],
            message:
              "Section figure references must point to figures in that section.",
          });
      }
      for (const [referenceIndex, tableId] of section.tableIds.entries())
        if (!tableIds.has(tableId))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["sections", index, "tableIds", referenceIndex],
            message: "Section table reference must exist.",
          });
        else referencedTableIds.add(tableId);
      for (const [referenceIndex, tableId] of section.tableIds.entries()) {
        const table = tablesById.get(tableId);
        if (table !== undefined && table.sectionId !== section.id)
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["sections", index, "tableIds", referenceIndex],
            message:
              "Section table references must point to tables in that section.",
          });
      }
    }
    for (const [index, block] of value.blocks.entries()) {
      withinDocument(block, ["blocks", index, "pageEnd"]);
      if (!sectionIds.has(block.sectionId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["blocks", index, "sectionId"],
          message: "Block section must exist in this document.",
        });
      if (!referencedBlockIds.has(block.id))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["blocks", index, "id"],
          message: "Every block must be referenced by its section.",
        });
      if (
        block.kind === "unsupported" &&
        !value.warnings.some(
          (warning) =>
            warning.code === "unknown_block" && warning.blockId === block.id,
        )
      )
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["blocks", index],
          message: "Unsupported blocks require an unknown_block warning.",
        });
    }
    for (const [collection, entries] of [
      ["figures", value.figures],
      ["tables", value.tables],
    ] as const)
      for (const [index, entry] of entries.entries()) {
        withinDocument(entry, [collection, index, "pageEnd"]);
        if (!sectionIds.has(entry.sectionId))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [collection, index, "sectionId"],
            message: "Item section must exist in this document.",
          });
        const references =
          collection === "figures" ? referencedFigureIds : referencedTableIds;
        if (!references.has(entry.id))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [collection, index, "id"],
            message: "Every item must be referenced by its section.",
          });
        if (
          entry.captionBlockId !== undefined &&
          !blockIds.has(entry.captionBlockId)
        )
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [collection, index, "captionBlockId"],
            message: "Caption block must exist in this document.",
          });
      }
    for (const [index, warning] of value.warnings.entries()) {
      withinDocument(warning, ["warnings", index, "pageEnd"]);
      const references = [
        [warning.sectionId, sectionIds],
        [warning.blockId, blockIds],
        [warning.figureId, figureIds],
        [warning.tableId, tableIds],
      ] as const;
      for (const [reference, identifiers] of references)
        if (reference !== undefined && !identifiers.has(reference))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["warnings", index],
            message: "Warning references must exist in this document.",
          });
    }
  });
export type NormalizedDocument = z.infer<typeof normalizedDocumentSchema>;

export const sourcePackageSchema = z
  .object({
    schemaVersion: z.literal(normalizedDocumentVersion),
    sourceSnapshotId: identifierSchema,
    normalizedDocumentId: identifierSchema,
    parsedDocumentVersion: z.number().int().positive(),
    language: z.literal("en"),
    sections: z
      .array(
        z
          .object({
            sectionId: identifierSchema,
            heading: normalizedText(1_000),
            ...pageRangeShape,
            blocks: z
              .array(
                z
                  .object({
                    blockId: identifierSchema,
                    page: z.number().int().positive(),
                    kind: z.enum(["paragraph", "list", "equation", "caption"]),
                    text: normalizedText(50_000),
                  })
                  .strict(),
              )
              .max(10_000),
          })
          .strict()
          .superRefine(pageRangeValidation),
      )
      .min(1)
      .max(10_000),
  })
  .strict();
export type SourcePackage = z.infer<typeof sourcePackageSchema>;

export const normalizedDocumentJsonSchema = zodToJsonSchema(
  normalizedDocumentSchema,
  "NormalizedDocument",
);
export function parseNormalizedDocument(input: unknown): NormalizedDocument {
  return normalizedDocumentSchema.parse(input);
}
export function parseSourcePackage(input: unknown): SourcePackage {
  return sourcePackageSchema.parse(input);
}

/** Public project-workspace API contract shared by the API and web boundaries. */
export const projectStageValues = [
  "draft",
  "uploading",
  "validating_source",
  "ingesting",
  "ingestion_review",
  "lesson_configuration",
  "objectives_review",
  "outline_review",
  "narration_storyboard_review",
  "audio_generation",
  "ready_for_validation",
  "ready_to_render",
  "rendering",
  "completed",
] as const;

export const projectTitleSchema = z.string().trim().min(1).max(160);
export const projectStageSchema = z.enum(projectStageValues);
export type ProjectStage = z.infer<typeof projectStageSchema>;

export const projectSummarySchema = z
  .object({
    id: identifierSchema,
    title: projectTitleSchema,
    stage: projectStageSchema,
    latestFailedOperation: z.string().max(120).nullable(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    revision: z.number().int().positive(),
  })
  .strict();
export type ProjectSummary = z.infer<typeof projectSummarySchema>;

export const projectDetailSchema = projectSummarySchema;
export type ProjectDetail = z.infer<typeof projectDetailSchema>;

export const projectListPageSchema = z
  .object({
    items: z.array(projectSummarySchema),
    nextCursor: z.string().min(1).max(512).optional(),
  })
  .strict();
export type ProjectListPage = z.infer<typeof projectListPageSchema>;

export const projectCreateResponseSchema = z
  .object({ project: projectDetailSchema })
  .strict();
export type ProjectCreateResponse = z.infer<typeof projectCreateResponseSchema>;

/** Optional title for a new draft created from an existing project. */
export const projectDuplicateInputSchema = z
  .object({ title: projectTitleSchema.optional() })
  .strict();
export type ProjectDuplicateInput = z.infer<typeof projectDuplicateInputSchema>;

export const projectCloneIdempotencyKeySchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

export const projectDuplicateResponseSchema = projectCreateResponseSchema;
export type ProjectDuplicateResponse = z.infer<
  typeof projectDuplicateResponseSchema
>;

/** Deletion must be an explicit, affirmative user action. */
export const projectDeleteInputSchema = z
  .object({ confirm: z.literal(true) })
  .strict();
export type ProjectDeleteInput = z.infer<typeof projectDeleteInputSchema>;

export const projectDeleteResponseSchema = z
  .object({ deleted: z.literal(true) })
  .strict();
export type ProjectDeleteResponse = z.infer<typeof projectDeleteResponseSchema>;

export const sourceDocumentMediaTypeSchema = z.enum([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
export type SourceDocumentMediaType = z.infer<
  typeof sourceDocumentMediaTypeSchema
>;

export const sourceDocumentStatusSchema = z.enum([
  "pending_validation",
  "validating",
  "active",
  "rejected",
  "validation_error",
]);
export type SourceDocumentStatus = z.infer<typeof sourceDocumentStatusSchema>;

/** The versions that must match before an immutable parse may be reused. */
export const ingestionCompatibilitySchema = z
  .object({
    parserVersion: z.string().trim().min(1).max(200),
    normalizedSchemaVersion: z.string().trim().min(1).max(50),
  })
  .strict();
export type IngestionCompatibility = z.infer<
  typeof ingestionCompatibilitySchema
>;
export const currentIngestionCompatibility = ingestionCompatibilitySchema.parse(
  {
    parserVersion: "docling-v1",
    normalizedSchemaVersion: normalizedDocumentVersion,
  },
);

export const sourceDocumentReuseSchema = z
  .object({ status: z.enum(["not_reused", "reused"]) })
  .strict();
export type SourceDocumentReuse = z.infer<typeof sourceDocumentReuseSchema>;

export const documentValidationCodeSchema = z.enum([
  "EMPTY_FILE",
  "FILE_TOO_LARGE",
  "UNSUPPORTED_FILE_TYPE",
  "MIME_MISMATCH",
  "CORRUPT_DOCUMENT",
  "PAGE_LIMIT_EXCEEDED",
  "MALWARE_DETECTED",
  "DOCUMENT_INSPECTION_UNAVAILABLE",
  "MALWARE_SCAN_UNAVAILABLE",
]);
export type DocumentValidationCode = z.infer<
  typeof documentValidationCodeSchema
>;

export const sourceDocumentValidationSchema = z
  .object({
    status: sourceDocumentStatusSchema,
    code: documentValidationCodeSchema.nullable(),
    pageCount: z.number().int().positive().nullable(),
    warnings: z.array(z.string().max(500)).max(20),
  })
  .strict();
export type SourceDocumentValidation = z.infer<
  typeof sourceDocumentValidationSchema
>;

export const sourceDocumentStatusResponseSchema = z
  .object({
    documentId: identifierSchema,
    validation: sourceDocumentValidationSchema,
    reuse: sourceDocumentReuseSchema,
  })
  .strict();
export type SourceDocumentStatusResponse = z.infer<
  typeof sourceDocumentStatusResponseSchema
>;

export const createSourceUploadSessionInputSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    mediaType: sourceDocumentMediaTypeSchema,
    sizeBytes: z.number().int().positive(),
    sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/i)
      .transform((value) => value.toLowerCase()),
  })
  .strict();
export type CreateSourceUploadSessionInput = z.infer<
  typeof createSourceUploadSessionInputSchema
>;

export const uploadSessionResponseSchema = z
  .object({
    sessionId: identifierSchema,
    documentId: identifierSchema,
    uploadUrl: z.string().url(),
    method: z.literal("PUT"),
    requiredHeaders: z.record(z.string()),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type UploadSessionResponse = z.infer<typeof uploadSessionResponseSchema>;

export const completeSourceUploadInputSchema = z.object({}).strict();

export const completeSourceUploadResponseSchema = z
  .object({
    documentId: identifierSchema,
    status: sourceDocumentStatusSchema,
    ingestionRequested: z.boolean(),
    duplicateDetected: z.boolean(),
  })
  .strict();
export type CompleteSourceUploadResponse = z.infer<
  typeof completeSourceUploadResponseSchema
>;

export const documentValidationJobPayloadSchema = z
  .object({ schemaVersion: z.literal(1), sourceDocumentId: identifierSchema })
  .strict();
export type DocumentValidationJobPayload = z.infer<
  typeof documentValidationJobPayloadSchema
>;

/** Removes a rejected source object after validation has committed its result. */
export const documentValidationCleanupJobPayloadSchema = z
  .object({ schemaVersion: z.literal(1), sourceDocumentId: identifierSchema })
  .strict();
export type DocumentValidationCleanupJobPayload = z.infer<
  typeof documentValidationCleanupJobPayloadSchema
>;

/** The future ingestion worker receives only this tenant-bound source ID. */
export const documentIngestionJobPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    sourceDocumentId: identifierSchema,
    parserVersion: z.string().trim().min(1).max(200).optional(),
    configurationVersion: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export type DocumentIngestionJobPayload = z.infer<
  typeof documentIngestionJobPayloadSchema
>;

export const ingestionRetryInputSchema = z
  .object({ configurationVersion: z.string().trim().min(1).max(200) })
  .strict();
export type IngestionRetryInput = z.infer<typeof ingestionRetryInputSchema>;

export const ingestionJobStatusSchema = z
  .object({
    id: identifierSchema,
    state: z.enum([
      "queued",
      "running",
      "retry_wait",
      "succeeded",
      "failed",
      "cancelled",
    ]),
    progress: z.number().min(0).max(1),
    errorCode: z.string().max(100).nullable(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type IngestionJobStatus = z.infer<typeof ingestionJobStatusSchema>;

export const projectIngestionStatusResponseSchema = z
  .object({
    quality: ingestionQualityReportSchema.nullable(),
    latestJob: ingestionJobStatusSchema.nullable(),
    canProceed: z.boolean(),
  })
  .strict();
export type ProjectIngestionStatusResponse = z.infer<
  typeof projectIngestionStatusResponseSchema
>;

export const ingestionRetryResponseSchema = z
  .object({ jobId: identifierSchema, status: z.literal("queued") })
  .strict();
export type IngestionRetryResponse = z.infer<
  typeof ingestionRetryResponseSchema
>;

/** Versioned internal boundary between the TypeScript job worker and Docling. */
export const doclingIngestionRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    jobId: identifierSchema,
    sourceDocumentId: identifierSchema,
    sourceDownloadUrl: z.string().url().max(4_000),
    mediaType: sourceDocumentMediaTypeSchema,
    parserVersion: z.string().trim().min(1).max(200),
    correlationId: identifierSchema,
  })
  .strict();
export type DoclingIngestionRequest = z.infer<
  typeof doclingIngestionRequestSchema
>;

export const doclingIngestionFailureCodeSchema = z.enum([
  "CORRUPT_SOURCE",
  "PARSER_UNSUPPORTED",
  "RESOURCE_EXHAUSTED",
  "TEMPORARY_INFRASTRUCTURE",
  "SCHEMA_NORMALIZATION_DEFECT",
  "PARSER_FAILED",
]);
export type DoclingIngestionFailureCode = z.infer<
  typeof doclingIngestionFailureCodeSchema
>;

export const doclingIngestionResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    parserVersion: z.string().trim().min(1).max(200),
    configurationHash: z.string().regex(/^[0-9a-f]{64}$/i),
    processingTimeMs: z.number().int().nonnegative(),
    canonicalJson: z.record(z.unknown()),
    markdown: z.string().max(20 * 1024 * 1024),
    warnings: z.array(z.string().trim().min(1).max(500)).max(100),
  })
  .strict();
export type DoclingIngestionResult = z.infer<
  typeof doclingIngestionResultSchema
>;

/**
 * The cleanup worker receives identifiers and timestamps only; stable storage
 * keys are resolved server-side after its tenant check.
 */
export const projectCleanupJobPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    projectId: identifierSchema,
    ownerUserId: identifierSchema,
    deletedAt: z.string().datetime({ offset: true }),
    cleanupAfter: z.string().datetime({ offset: true }),
  })
  .strict();
export type ProjectCleanupJobPayload = z.infer<
  typeof projectCleanupJobPayloadSchema
>;

// ---------------------------------------------------------------------------
// ST-037 — Ingestion review document DTOs
// ---------------------------------------------------------------------------

/** Lightweight section summary for hierarchical tree navigation. */
export const reviewSectionSummarySchema = z
  .object({
    id: identifierSchema,
    parentSectionId: identifierSchema.optional(),
    order: z.number().int().positive(),
    level: z.number().int().min(1).max(10),
    heading: z.string().max(1_000),
    pageStart: z.number().int().positive(),
    pageEnd: z.number().int().positive(),
    blockCount: z.number().int().nonnegative(),
    figureCount: z.number().int().nonnegative(),
    tableCount: z.number().int().nonnegative(),
  })
  .strict();
export type ReviewSectionSummary = z.infer<typeof reviewSectionSummarySchema>;

/** Teacher-visible warning with a locator pointing to the affected item. */
export const reviewWarningSchema = z
  .object({
    id: identifierSchema,
    code: ingestionWarningCodeSchema,
    severity: ingestionWarningSeveritySchema,
    message: z.string().max(2_000),
    pageStart: z.number().int().positive(),
    pageEnd: z.number().int().positive(),
    sectionId: identifierSchema.optional(),
    blockId: identifierSchema.optional(),
    figureId: identifierSchema.optional(),
    tableId: identifierSchema.optional(),
  })
  .strict();
export type ReviewWarning = z.infer<typeof reviewWarningSchema>;

/** Top-level review document response: metadata, section tree, warnings, quality. */
export const parsedDocumentReviewResponseSchema = z
  .object({
    document: z
      .object({
        id: identifierSchema,
        sourceDocumentId: identifierSchema,
        version: z.number().int().positive(),
        schemaVersion: z.string().min(1).max(50),
        parserVersion: z.string().min(1).max(200),
        title: z.string().max(1_000).nullable(),
        language: z.string().min(1).max(50),
        pageCount: z.number().int().positive(),
      })
      .strict(),
    sections: z.array(reviewSectionSummarySchema).max(10_000),
    warnings: z.array(reviewWarningSchema).max(10_000),
    quality: ingestionQualityReportSchema.nullable(),
  })
  .strict();
export type ParsedDocumentReviewResponse = z.infer<
  typeof parsedDocumentReviewResponseSchema
>;

/** Correction overlay state attached to a review content block. */
export const contentBlockCorrectionStateSchema = z
  .object({
    revision: z.number().int().positive(),
    correctedText: z.string().max(50_000).nullable(),
    correctedItems: z
      .array(z.string().max(10_000))
      .min(1)
      .max(1_000)
      .nullable(),
    correctedLatex: z.string().max(20_000).nullable(),
  })
  .strict();
export type ContentBlockCorrectionState = z.infer<
  typeof contentBlockCorrectionStateSchema
>;

/** Content block for review display (simplified from normalized ContentBlock). */
export const reviewContentBlockSchema = z.discriminatedUnion("kind", [
  z
    .object({
      id: identifierSchema,
      kind: z.literal("paragraph"),
      order: z.number().int().positive(),
      pageStart: z.number().int().positive(),
      pageEnd: z.number().int().positive(),
      text: z.string().max(50_000),
      correction: contentBlockCorrectionStateSchema.optional(),
    })
    .strict(),
  z
    .object({
      id: identifierSchema,
      kind: z.literal("list"),
      order: z.number().int().positive(),
      pageStart: z.number().int().positive(),
      pageEnd: z.number().int().positive(),
      items: z.array(z.string().max(10_000)).min(1).max(1_000),
      correction: contentBlockCorrectionStateSchema.optional(),
    })
    .strict(),
  z
    .object({
      id: identifierSchema,
      kind: z.literal("equation"),
      order: z.number().int().positive(),
      pageStart: z.number().int().positive(),
      pageEnd: z.number().int().positive(),
      latex: z.string().max(20_000),
      text: z.string().max(20_000).optional(),
      correction: contentBlockCorrectionStateSchema.optional(),
    })
    .strict(),
  z
    .object({
      id: identifierSchema,
      kind: z.literal("caption"),
      order: z.number().int().positive(),
      pageStart: z.number().int().positive(),
      pageEnd: z.number().int().positive(),
      text: z.string().max(10_000),
      correction: contentBlockCorrectionStateSchema.optional(),
    })
    .strict(),
  z
    .object({
      id: identifierSchema,
      kind: z.literal("unsupported"),
      order: z.number().int().positive(),
      pageStart: z.number().int().positive(),
      pageEnd: z.number().int().positive(),
      parserKind: z.string().max(200),
    })
    .strict(),
]);
export type ReviewContentBlock = z.infer<typeof reviewContentBlockSchema>;

export const reviewFigureExtensionValues = [
  "gif",
  "jpeg",
  "png",
  "webp",
] as const;

/**
 * Figure with short-lived authorized preview/thumbnail URLs. `included` and
 * `revision` carry the effective teacher inclusion state for the current
 * parsed version (included defaults to true, revision 0 when no overlay exists).
 */
export const reviewFigureSchema = z
  .object({
    id: identifierSchema,
    order: z.number().int().positive(),
    pageStart: z.number().int().positive(),
    pageEnd: z.number().int().positive(),
    captionBlockId: identifierSchema.optional(),
    altText: z.string().max(10_000).optional(),
    sourceLocator: z.string().max(2_000).optional(),
    contentType: z
      .enum(["image/gif", "image/jpeg", "image/png", "image/webp"])
      .nullable(),
    width: z.number().int().positive().max(20_000).nullable(),
    height: z.number().int().positive().max(20_000).nullable(),
    previewUrl: z.string().url().optional(),
    thumbnailUrl: z.string().url().optional(),
    included: z.boolean(),
    revision: z.number().int().nonnegative(),
  })
  .strict();
export type ReviewFigure = z.infer<typeof reviewFigureSchema>;

export const reviewTableCellSchema = z
  .object({
    rowIndex: z.number().int().nonnegative(),
    columnIndex: z.number().int().nonnegative(),
    text: z.string().max(10_000),
    rowSpan: z.number().int().positive().max(10_000),
    columnSpan: z.number().int().positive().max(10_000),
  })
  .strict();
export type ReviewTableCell = z.infer<typeof reviewTableCellSchema>;

export const reviewTableSchema = z
  .object({
    id: identifierSchema,
    order: z.number().int().positive(),
    pageStart: z.number().int().positive(),
    pageEnd: z.number().int().positive(),
    captionBlockId: identifierSchema.optional(),
    columns: z.array(z.string().max(1_000)).min(1).max(500),
    rows: z.array(z.array(z.string().max(10_000))).max(10_000),
    cells: z.array(reviewTableCellSchema).max(100_000).optional(),
  })
  .strict();
export type ReviewTable = z.infer<typeof reviewTableSchema>;

/** Section detail response with expandable content, figures, and tables. */
export const parsedDocumentSectionResponseSchema = z
  .object({
    section: z
      .object({
        id: identifierSchema,
        parentSectionId: identifierSchema.optional(),
        order: z.number().int().positive(),
        level: z.number().int().min(1).max(10),
        heading: z.string().max(1_000),
        pageStart: z.number().int().positive(),
        pageEnd: z.number().int().positive(),
        blocks: z.array(reviewContentBlockSchema).max(10_000),
        figures: z.array(reviewFigureSchema).max(1_000),
        tables: z.array(reviewTableSchema).max(1_000),
      })
      .strict(),
  })
  .strict();
export type ParsedDocumentSectionResponse = z.infer<
  typeof parsedDocumentSectionResponseSchema
>;

// ---------------------------------------------------------------------------
// ST-038 — Source section selection overlays
// ---------------------------------------------------------------------------

/**
 * Patch body for a single source-section overlay. `revision` is the expected
 * current overlay revision (0 means "no overlay exists yet"). At least one
 * field beyond `revision` must be supplied; `null` restores the original value.
 */
export const sourceSectionOverlayInputSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    included: z.boolean().optional(),
    displayHeading: z.string().trim().min(1).max(1_000).nullable().optional(),
    reviewOrder: z.number().int().positive().nullable().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.included === undefined &&
      value.displayHeading === undefined &&
      value.reviewOrder === undefined
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["root"],
        message:
          "Provide at least one change: included, displayHeading, or reviewOrder.",
      });
  });
export type SourceSectionOverlayInput = z.infer<
  typeof sourceSectionOverlayInputSchema
>;

/** Persisted overlay state for one source section. */
export const sourceSectionOverlaySchema = z
  .object({
    sectionId: identifierSchema,
    included: z.boolean(),
    displayHeading: z.string().max(1_000).nullable(),
    reviewOrder: z.number().int().positive().nullable(),
    revision: z.number().int().positive(),
  })
  .strict();
export type SourceSectionOverlay = z.infer<typeof sourceSectionOverlaySchema>;

/**
 * Effective (projected) source section. `heading` is the immutable parser
 * heading, `displayHeading` the teacher override (null means unchanged), and
 * `revision` is the overlay revision (0 when no overlay exists yet).
 */
export const sourceSectionSelectionSchema = z
  .object({
    id: identifierSchema,
    parentSectionId: identifierSchema.optional(),
    order: z.number().int().positive(),
    level: z.number().int().min(1).max(10),
    heading: z.string().max(1_000),
    displayHeading: z.string().max(1_000).nullable(),
    included: z.boolean(),
    reviewOrder: z.number().int().positive().nullable(),
    pageStart: z.number().int().positive(),
    pageEnd: z.number().int().positive(),
    revision: z.number().int().nonnegative(),
  })
  .strict();
export type SourceSectionSelection = z.infer<
  typeof sourceSectionSelectionSchema
>;

/** Effective section-selection projection for the current parsed document. */
export const sourceSectionSelectionResponseSchema = z
  .object({
    documentId: identifierSchema,
    sections: z.array(sourceSectionSelectionSchema).max(10_000),
  })
  .strict();
export type SourceSectionSelectionResponse = z.infer<
  typeof sourceSectionSelectionResponseSchema
>;

/** Single overlay update response: the projected section after the change. */
export const sourceSectionUpdateResponseSchema = sourceSectionSelectionSchema;
export type SourceSectionUpdateResponse = z.infer<
  typeof sourceSectionUpdateResponseSchema
>;

// ---------------------------------------------------------------------------
// ST-039 — Content-block correction overlays
// ---------------------------------------------------------------------------

/**
 * Patch body for one content-block correction. `kind` must match the immutable
 * block kind and `revision` is the expected current correction revision (0 means
 * "no correction exists yet"). Corrected content is bounded plain/structured
 * text appropriate to the block kind.
 */
export const contentBlockCorrectionInputSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("paragraph"),
      revision: z.number().int().nonnegative(),
      correctedText: z.string().trim().min(1).max(50_000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("list"),
      revision: z.number().int().nonnegative(),
      correctedItems: z
        .array(z.string().trim().min(1).max(10_000))
        .min(1)
        .max(1_000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("equation"),
      revision: z.number().int().nonnegative(),
      correctedLatex: z.string().trim().min(1).max(20_000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("caption"),
      revision: z.number().int().nonnegative(),
      correctedText: z.string().trim().min(1).max(10_000),
    })
    .strict(),
]);
export type ContentBlockCorrectionInput = z.infer<
  typeof contentBlockCorrectionInputSchema
>;

/** Body for the restore-original command; carries the expected correction revision. */
export const contentBlockRestoreInputSchema = z
  .object({
    revision: z.number().int().nonnegative(),
  })
  .strict();
export type ContentBlockRestoreInput = z.infer<
  typeof contentBlockRestoreInputSchema
>;

/** Persisted correction overlay for one content block. */
export const contentBlockCorrectionSchema = z
  .object({
    blockId: identifierSchema,
    kind: z.enum(["paragraph", "list", "equation", "caption"]),
    correctedText: z.string().max(50_000).nullable(),
    correctedItems: z
      .array(z.string().max(10_000))
      .min(1)
      .max(1_000)
      .nullable(),
    correctedLatex: z.string().max(20_000).nullable(),
    revision: z.number().int().positive(),
  })
  .strict();
export type ContentBlockCorrection = z.infer<
  typeof contentBlockCorrectionSchema
>;

/** Single correction update response: the projected effective block. */
export const contentBlockUpdateResponseSchema = reviewContentBlockSchema;
export type ContentBlockUpdateResponse = z.infer<
  typeof contentBlockUpdateResponseSchema
>;

// ---------------------------------------------------------------------------
// ST-040 — Figure inclusion overlays
// ---------------------------------------------------------------------------

/**
 * Patch body for a single figure inclusion overlay. `revision` is the expected
 * current overlay revision (0 means "no overlay exists yet") and `included`
 * declares whether the figure participates in asset planning.
 */
export const figureInclusionInputSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    included: z.boolean(),
  })
  .strict();
export type FigureInclusionInput = z.infer<typeof figureInclusionInputSchema>;

/**
 * Effective figure projection for asset planning. The immutable extracted
 * figure is preserved; `included` is false when the teacher excluded the figure
 * and `revision` is the overlay revision (0 when no overlay exists yet).
 */
export const effectiveFigureSchema = reviewFigureSchema;
export type EffectiveFigure = z.infer<typeof effectiveFigureSchema>;

// ---------------------------------------------------------------------------
// ST-041 — Lesson configuration
// ---------------------------------------------------------------------------

/**
 * Learner age band. Values stay aligned with the `LessonSpec` audience so a
 * configuration can be mapped onto a lesson without enum translation. The MVP
 * targets ages 10–16 but the schema is future-safe.
 */
export const lessonAgeBandValues = [
  "8-10",
  "11-13",
  "14-16",
  "adult-beginner",
] as const;
export const lessonAgeBandSchema = z.enum(lessonAgeBandValues);
export type LessonAgeBand = z.infer<typeof lessonAgeBandSchema>;

export const lessonDifficultyValues = ["introductory", "intermediate"] as const;
export const lessonDifficultySchema = z.enum(lessonDifficultyValues);
export type LessonDifficulty = z.infer<typeof lessonDifficultySchema>;

export const lessonToneValues = [
  "friendly",
  "academic",
  "conversational",
] as const;
export const lessonToneSchema = z.enum(lessonToneValues);
export type LessonTone = z.infer<typeof lessonToneSchema>;

/** Only one visual theme is selectable in the MVP. */
export const lessonVisualThemeValues = ["mvp-default"] as const;
export const lessonVisualThemeSchema = z.enum(lessonVisualThemeValues);
export type LessonVisualTheme = z.infer<typeof lessonVisualThemeSchema>;

/** 3, 5, and 7 minute lessons map to fixed durations in seconds. */
export const targetDurationSecondsSchema = z.union([
  z.literal(180),
  z.literal(300),
  z.literal(420),
]);
export type TargetDurationSeconds = z.infer<typeof targetDurationSecondsSchema>;
export const durationMinutesToSeconds = (minutes: 3 | 5 | 7): number =>
  minutes * 60;

/**
 * Documented narration-budget constants. `targetWords = durationMinutes ×
 * wordsPerMinute × (1 − pauseReservation)`; the range buffers the target so
 * scripts may land slightly above or below the deterministic midpoint.
 */
export const narrationWordsPerMinute = 140 as const;
export const narrationPauseReservation = 0.2 as const;
export const narrationRangeLower = 0.9 as const;
export const narrationRangeUpper = 1.15 as const;

export const narrationWordCountTargetSchema = z
  .object({
    min: z.number().int().positive(),
    target: z.number().int().positive(),
    max: z.number().int().positive(),
  })
  .strict();
export type NarrationWordCountTarget = z.infer<
  typeof narrationWordCountTargetSchema
>;

export function narrationWordCountRange(
  targetDurationSeconds: number,
): NarrationWordCountTarget {
  const target = Math.round(
    (targetDurationSeconds / 60) *
      narrationWordsPerMinute *
      (1 - narrationPauseReservation),
  );
  return {
    min: Math.max(1, Math.round(target * narrationRangeLower)),
    target,
    max: Math.max(target, Math.round(target * narrationRangeUpper)),
  };
}

/** Persisted current-draft configuration returned by the API. */
export const lessonConfigurationSchema = z
  .object({
    version: z.number().int().positive(),
    ageBand: lessonAgeBandSchema,
    difficulty: lessonDifficultySchema,
    subject: z.string().trim().min(1).max(200),
    lessonTitle: z.string().trim().min(1).max(200),
    targetDurationSeconds: targetDurationSecondsSchema,
    tone: lessonToneSchema,
    visualTheme: lessonVisualThemeSchema,
    includeRecallQuestions: z.boolean(),
    sourceParsedDocumentVersion: z.number().int().positive(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type LessonConfiguration = z.infer<typeof lessonConfigurationSchema>;

/**
 * `PUT /projects/:id/configuration` body. `expectedVersion` is the version the
 * form last loaded (0 when no configuration exists yet) and drives the stale
 * update conflict check.
 */
export const lessonConfigurationInputSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    ageBand: lessonAgeBandSchema,
    difficulty: lessonDifficultySchema,
    subject: z.string().trim().min(1).max(200),
    lessonTitle: z.string().trim().min(1).max(200),
    targetDurationSeconds: targetDurationSecondsSchema,
    tone: lessonToneSchema,
    includeRecallQuestions: z.boolean(),
  })
  .strict();
export type LessonConfigurationInput = z.infer<
  typeof lessonConfigurationInputSchema
>;

/** Effective source context attached to the configuration surface. */
export const lessonConfigurationSourceSchema = z
  .object({
    parsedDocumentVersion: z.number().int().positive().nullable(),
    sourceReviewComplete: z.boolean(),
  })
  .strict();
export type LessonConfigurationSource = z.infer<
  typeof lessonConfigurationSourceSchema
>;

export const lessonConfigurationResponseSchema = z
  .object({
    configuration: lessonConfigurationSchema.nullable(),
    source: lessonConfigurationSourceSchema,
    narrationTarget: narrationWordCountTargetSchema.nullable(),
    canProceed: z.boolean(),
  })
  .strict();
export type LessonConfigurationResponse = z.infer<
  typeof lessonConfigurationResponseSchema
>;

// ---------------------------------------------------------------------------
// ST-042 — Approved source snapshots and bounded source packages
// ---------------------------------------------------------------------------

export const sourceSnapshotVersion = "1.0" as const;

const sha256HexPattern = /^[0-9a-f]{64}$/i;

/**
 * Effective section captured at approval time. `heading` is the teacher's
 * effective heading (displayHeading override when present), `reviewOrder` is
 * the teacher's ordering override (null when unchanged), and the ID arrays
 * reference only content included in the approved snapshot.
 */
export const sourceSnapshotSectionSchema = z
  .object({
    sectionId: identifierSchema,
    parentSectionId: identifierSchema.optional(),
    order: z.number().int().positive(),
    level: z.number().int().min(1).max(10),
    heading: normalizedText(1_000),
    ...pageRangeShape,
    reviewOrder: z.number().int().positive().nullable(),
    blockIds: z.array(identifierSchema).max(10_000),
    figureIds: z.array(identifierSchema).max(1_000),
    tableIds: z.array(identifierSchema).max(1_000),
  })
  .strict()
  .superRefine(pageRangeValidation);
export type SourceSnapshotSection = z.infer<typeof sourceSnapshotSectionSchema>;

/**
 * Effective content block captured at approval time. The effective text is the
 * corrected text when the teacher corrected the block; `corrected` and
 * `revision` record the overlay state used for auditability.
 */
export const sourceSnapshotBlockSchema = z.discriminatedUnion("kind", [
  z
    .object({
      blockId: identifierSchema,
      sectionId: identifierSchema,
      kind: z.literal("paragraph"),
      order: z.number().int().positive(),
      ...pageRangeShape,
      text: normalizedText(50_000),
      corrected: z.boolean(),
      revision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      blockId: identifierSchema,
      sectionId: identifierSchema,
      kind: z.literal("list"),
      order: z.number().int().positive(),
      ...pageRangeShape,
      items: z.array(normalizedText(10_000)).min(1).max(1_000),
      corrected: z.boolean(),
      revision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      blockId: identifierSchema,
      sectionId: identifierSchema,
      kind: z.literal("equation"),
      order: z.number().int().positive(),
      ...pageRangeShape,
      latex: normalizedText(20_000),
      text: normalizedText(20_000).optional(),
      corrected: z.boolean(),
      revision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      blockId: identifierSchema,
      sectionId: identifierSchema,
      kind: z.literal("caption"),
      order: z.number().int().positive(),
      ...pageRangeShape,
      text: normalizedText(10_000),
      corrected: z.boolean(),
      revision: z.number().int().nonnegative(),
    })
    .strict(),
]);
export type SourceSnapshotBlock = z.infer<typeof sourceSnapshotBlockSchema>;

/** Effective figure captured at approval time (included in the approved source). */
export const sourceSnapshotFigureSchema = z
  .object({
    figureId: identifierSchema,
    sectionId: identifierSchema,
    order: z.number().int().positive(),
    ...pageRangeShape,
    captionBlockId: identifierSchema.optional(),
    altText: normalizedText(10_000).optional(),
    sourceLocator: normalizedText(2_000).optional(),
    revision: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine(pageRangeValidation);
export type SourceSnapshotFigure = z.infer<typeof sourceSnapshotFigureSchema>;

/** Effective table captured at approval time. */
export const sourceSnapshotTableSchema = z
  .object({
    tableId: identifierSchema,
    sectionId: identifierSchema,
    order: z.number().int().positive(),
    ...pageRangeShape,
    captionBlockId: identifierSchema.optional(),
    columns: z.array(normalizedText(1_000)).min(1).max(500),
    rows: z.array(z.array(z.string().max(10_000))).max(10_000),
  })
  .strict()
  .superRefine((value, context) => {
    pageRangeValidation(value, context);
    for (const [index, row] of value.rows.entries())
      if (row.length !== value.columns.length)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rows", index],
          message: "Every table row must have one cell per column.",
        });
  });
export type SourceSnapshotTable = z.infer<typeof sourceSnapshotTableSchema>;

/**
 * Immutable approved source snapshot. The effective content is a frozen copy
 * of the reviewed source: later overlay edits create a new snapshot version
 * rather than mutating this record.
 */
export const sourceSnapshotSchema = z
  .object({
    schemaVersion: z.literal(sourceSnapshotVersion),
    id: identifierSchema,
    projectId: identifierSchema,
    sourceDocumentId: identifierSchema,
    parsedDocumentId: identifierSchema,
    parsedDocumentVersion: z.number().int().positive(),
    contentHash: z
      .string()
      .regex(sha256HexPattern, "Expected a hexadecimal SHA-256 checksum.")
      .transform((value) => value.toLowerCase()),
    approvedBy: identifierSchema,
    approvedAt: z.string().datetime({ offset: true }),
    sections: z.array(sourceSnapshotSectionSchema).max(10_000),
    blocks: z.array(sourceSnapshotBlockSchema).max(100_000),
    figures: z.array(sourceSnapshotFigureSchema).max(10_000),
    tables: z.array(sourceSnapshotTableSchema).max(10_000),
  })
  .strict()
  .superRefine((value, context) => {
    const collectUnique = <T>(
      entries: readonly T[],
      select: (entry: T) => string,
      path: string,
    ): Set<string> => {
      const identifiers = new Set<string>();
      for (const [index, entry] of entries.entries()) {
        const id = select(entry);
        if (identifiers.has(id))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [path, index],
            message: `${path} IDs must be unique.`,
          });
        identifiers.add(id);
      }
      return identifiers;
    };
    const sectionIds = collectUnique(
      value.sections,
      (section) => section.sectionId,
      "sections",
    );
    const blockIds = collectUnique(
      value.blocks,
      (block) => block.blockId,
      "blocks",
    );
    const figureIds = collectUnique(
      value.figures,
      (figure) => figure.figureId,
      "figures",
    );
    const tableIds = collectUnique(
      value.tables,
      (table) => table.tableId,
      "tables",
    );
    const sectionsById = new Map(
      value.sections.map((section) => [section.sectionId, section]),
    );
    const blocksById = new Map(
      value.blocks.map((block) => [block.blockId, block]),
    );
    for (const [index, section] of value.sections.entries()) {
      if (
        section.parentSectionId !== undefined &&
        !sectionIds.has(section.parentSectionId)
      )
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sections", index, "parentSectionId"],
          message: "Parent section must exist in this snapshot.",
        });
      const parent =
        section.parentSectionId === undefined
          ? undefined
          : sectionsById.get(section.parentSectionId);
      if (parent !== undefined && parent.level >= section.level)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sections", index, "level"],
          message:
            "A child section level must be greater than its parent level.",
        });
      for (const [referenceIndex, blockId] of section.blockIds.entries())
        if (!blockIds.has(blockId))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["sections", index, "blockIds", referenceIndex],
            message: "Section block reference must exist in this snapshot.",
          });
      for (const [referenceIndex, blockId] of section.blockIds.entries()) {
        const block = blocksById.get(blockId);
        if (block !== undefined && block.sectionId !== section.sectionId)
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["sections", index, "blockIds", referenceIndex],
            message:
              "Section block references must point to blocks in that section.",
          });
      }
      for (const [referenceIndex, figureId] of section.figureIds.entries())
        if (!figureIds.has(figureId))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["sections", index, "figureIds", referenceIndex],
            message: "Section figure reference must exist in this snapshot.",
          });
      for (const [referenceIndex, tableId] of section.tableIds.entries())
        if (!tableIds.has(tableId))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["sections", index, "tableIds", referenceIndex],
            message: "Section table reference must exist in this snapshot.",
          });
    }
    for (const [collection, entries] of [
      ["blocks", value.blocks],
      ["figures", value.figures],
      ["tables", value.tables],
    ] as const) {
      for (const [index, entry] of entries.entries()) {
        if (!sectionIds.has(entry.sectionId))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [collection, index, "sectionId"],
            message: "Item section must exist in this snapshot.",
          });
      }
    }
    for (const [index, block] of value.blocks.entries())
      if (block.pageEnd !== undefined && block.pageEnd < block.pageStart)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["blocks", index, "pageEnd"],
          message: "pageEnd must not precede pageStart.",
        });
    const referencedFigureIds = new Set<string>();
    const referencedTableIds = new Set<string>();
    for (const section of value.sections) {
      for (const figureId of section.figureIds)
        referencedFigureIds.add(figureId);
      for (const tableId of section.tableIds) referencedTableIds.add(tableId);
    }
    for (const [index, figure] of value.figures.entries())
      if (!referencedFigureIds.has(figure.figureId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["figures", index],
          message: "Every figure must be referenced by its section.",
        });
    for (const [index, table] of value.tables.entries())
      if (!referencedTableIds.has(table.tableId))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tables", index],
          message: "Every table must be referenced by its section.",
        });
  });
export type SourceSnapshot = z.infer<typeof sourceSnapshotSchema>;

/** Queryable snapshot metadata returned by the API. */
export const sourceSnapshotMetadataSchema = z
  .object({
    id: identifierSchema,
    snapshotVersion: z.number().int().positive(),
    schemaVersion: z.literal(sourceSnapshotVersion),
    parsedDocumentId: identifierSchema,
    parsedDocumentVersion: z.number().int().positive(),
    contentHash: z.string().regex(sha256HexPattern),
    approvedBy: identifierSchema,
    approvedAt: z.string().datetime({ offset: true }),
    sectionCount: z.number().int().nonnegative(),
    blockCount: z.number().int().nonnegative(),
    figureCount: z.number().int().nonnegative(),
    tableCount: z.number().int().nonnegative(),
  })
  .strict();
export type SourceSnapshotMetadata = z.infer<
  typeof sourceSnapshotMetadataSchema
>;

export const sourceApprovalResponseSchema = z
  .object({ snapshot: sourceSnapshotMetadataSchema })
  .strict();
export type SourceApprovalResponse = z.infer<
  typeof sourceApprovalResponseSchema
>;

/**
 * Current source-review approval state. `stale` is true when the latest
 * snapshot no longer matches the current effective reviewed content (overlays
 * changed after approval), so a re-approval is required before generation.
 */
export const sourceApprovalStatusSchema = z
  .object({
    approved: z.boolean(),
    parsedDocumentVersion: z.number().int().positive().nullable(),
    snapshotId: identifierSchema.nullable(),
    snapshotVersion: z.number().int().positive().nullable(),
    contentHash: z
      .string()
      .regex(sha256HexPattern, "Expected a hexadecimal SHA-256 checksum.")
      .nullable(),
    approvedAt: z.string().datetime({ offset: true }).nullable(),
    stale: z.boolean(),
  })
  .strict();
export type SourceApprovalStatus = z.infer<typeof sourceApprovalStatusSchema>;

/** Source block resolved against an approved snapshot for citation display. */
export const sourceBlockLookupEntrySchema = z
  .object({
    blockId: identifierSchema,
    sectionId: identifierSchema,
    sectionHeading: normalizedText(1_000),
    page: z.number().int().positive(),
    kind: z.enum(["paragraph", "list", "equation", "caption"]),
    text: normalizedText(50_000),
  })
  .strict();
export type SourceBlockLookupEntry = z.infer<
  typeof sourceBlockLookupEntrySchema
>;

/**
 * Optional package narrowing by section or block links (e.g. from approved
 * objectives/outline). IDs retain their stable provenance when narrowed.
 */
export const sourcePackageNarrowingSchema = z
  .object({
    sectionIds: z.array(identifierSchema).min(1).max(10_000).optional(),
    blockIds: z.array(identifierSchema).min(1).max(10_000).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.sectionIds === undefined && value.blockIds === undefined)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["root"],
        message: "Provide at least one of sectionIds or blockIds.",
      });
  });
export type SourcePackageNarrowing = z.infer<
  typeof sourcePackageNarrowingSchema
>;

/** Effective plain-text representation of a snapshot block for packaging/lookup. */
export function sourceSnapshotBlockText(block: SourceSnapshotBlock): string {
  const kind = block.kind;
  if (kind === "list") return block.items.join("\n");
  if (kind === "equation") return block.latex;
  return block.text;
}

/**
 * Deterministic source-package builder used by the AI pipeline. Given an
 * approved snapshot (and optional section/block narrowing), the same snapshot
 * and selection parameters always produce the same package.
 */
export function buildSourcePackage(
  snapshot: SourceSnapshot,
  narrowing: SourcePackageNarrowing = {},
): SourcePackage {
  const sectionFilter =
    narrowing.sectionIds === undefined
      ? undefined
      : new Set(narrowing.sectionIds);
  const blockFilter =
    narrowing.blockIds === undefined ? undefined : new Set(narrowing.blockIds);
  const blocksById = new Map(
    snapshot.blocks.map((block) => [block.blockId, block]),
  );
  const sections = snapshot.sections
    .filter(
      (section) =>
        sectionFilter === undefined || sectionFilter.has(section.sectionId),
    )
    .map((section) => {
      const blockIds = section.blockIds.filter(
        (blockId) => blockFilter === undefined || blockFilter.has(blockId),
      );
      const blocks = blockIds.flatMap((blockId) => {
        const block = blocksById.get(blockId);
        if (block === undefined) return [];
        return [
          {
            blockId: block.blockId,
            page: block.pageStart,
            kind: block.kind,
            text: sourceSnapshotBlockText(block),
          },
        ];
      });
      return {
        sectionId: section.sectionId,
        heading: section.heading,
        pageStart: section.pageStart,
        pageEnd: section.pageEnd,
        blocks,
      };
    })
    .filter((section) => section.blocks.length > 0);
  if (sections.length === 0)
    throw new RangeError("The narrowed source package is empty.");
  return sourcePackageSchema.parse({
    schemaVersion: normalizedDocumentVersion,
    sourceSnapshotId: snapshot.id,
    normalizedDocumentId: snapshot.parsedDocumentId,
    parsedDocumentVersion: snapshot.parsedDocumentVersion,
    language: "en",
    sections,
  });
}

export function parseSourceSnapshot(input: unknown): SourceSnapshot {
  return sourceSnapshotSchema.parse(input);
}

// ---------------------------------------------------------------------------
// ST-043 — AI provider model-call contracts
// ---------------------------------------------------------------------------

export const modelCallOperationValues = [
  "ai.objectives",
  "ai.outline",
  "ai.narration",
  "ai.storyboard",
  "ai.scene_regeneration",
  "ai.grounding",
] as const;
export const modelCallOperationSchema = z.enum(modelCallOperationValues);
export type ModelCallOperation = z.infer<typeof modelCallOperationSchema>;

/** Structured-output validation outcome recorded on every model call. */
export const modelCallValidationStatusValues = [
  "validated",
  "repaired",
  "invalid",
] as const;
export const modelCallValidationStatusSchema = z.enum(
  modelCallValidationStatusValues,
);
export type ModelCallValidationStatus = z.infer<
  typeof modelCallValidationStatusSchema
>;

/**
 * Immutable metadata record for one model call. The pipeline persists this for
 * every provider interaction, including failures, so costs and retries are
 * traceable. Provider response payloads never appear here.
 */
export const modelCallRecordSchema = z
  .object({
    id: identifierSchema,
    projectId: identifierSchema,
    ownerUserId: identifierSchema,
    operationType: modelCallOperationSchema,
    idempotencyKey: z.string().min(1).max(300),
    promptId: z.string().trim().min(1).max(100),
    promptVersion: z.string().trim().min(1).max(50),
    provider: z.string().trim().min(1).max(100),
    model: z.string().trim().min(1).max(200),
    inputVersion: z.string().trim().min(1).max(300),
    inputHash: z
      .string()
      .regex(sha256HexPattern, "Expected a hexadecimal SHA-256 checksum.")
      .transform((value) => value.toLowerCase()),
    inputUnits: z.number().int().nonnegative(),
    outputUnits: z.number().int().nonnegative(),
    estimatedCostUsd: z.number().finite().nonnegative(),
    latencyMs: z.number().int().nonnegative(),
    retryCount: z.number().int().min(0).max(20),
    validationStatus: modelCallValidationStatusSchema,
    status: z.enum(["succeeded", "failed"]),
    errorCode: z.string().max(100).nullable(),
    correlationId: identifierSchema,
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type ModelCallRecord = z.infer<typeof modelCallRecordSchema>;

/**
 * Bounded parameters carried by a model-call job. The concrete operation
 * schema (objectives, outline, ...) is defined by its own story; this is the
 * generic carrier of the operation-specific input passed to the prompt renderer.
 */
export const modelCallParamsSchema = z
  .record(
    z.string().min(1).max(100),
    z.union([
      z.string().max(10_000),
      z.number().finite(),
      z.boolean(),
      z.null(),
    ]),
  )
  .refine((value) => Object.keys(value).length <= 100, {
    message: "Model-call parameters must contain at most 100 entries.",
  });
export type ModelCallParams = z.infer<typeof modelCallParamsSchema>;

/**
 * Versioned job payload for one AI model-call operation. References the exact
 * approved source snapshot and the exact prompt version; the idempotency key
 * and input version are derived from these inputs.
 */
export const modelCallJobPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    operationType: modelCallOperationSchema,
    sourceSnapshotId: identifierSchema,
    promptId: z.string().trim().min(1).max(100),
    promptVersion: z.string().trim().min(1).max(50),
    model: z.string().trim().min(1).max(200),
    narrowing: sourcePackageNarrowingSchema.optional(),
    params: modelCallParamsSchema.optional(),
  })
  .strict();
export type ModelCallJobPayload = z.infer<typeof modelCallJobPayloadSchema>;

/**
 * Structured generation result returned by the model-call lifecycle after a
 * validated provider response. `value` is the validated typed output whose
 * exact shape is defined by the operation's output schema.
 */
export const structuredGenerationResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    value: z.unknown(),
    validationStatus: modelCallValidationStatusSchema,
    repairAttempts: z.number().int().min(0).max(20),
    inputUnits: z.number().int().nonnegative(),
    outputUnits: z.number().int().nonnegative(),
    estimatedCostUsd: z.number().finite().nonnegative(),
    latencyMs: z.number().int().nonnegative(),
  })
  .strict();
export type StructuredGenerationResult = z.infer<
  typeof structuredGenerationResultSchema
>;

/** Classified structured generation error surfaced by the lifecycle. */
export const structuredGenerationErrorSchema = z
  .object({
    schemaVersion: z.literal(1),
    code: z.enum([
      "STRUCTURED_OUTPUT_INVALID",
      "PROVIDER_CALL_FAILED",
      "QUOTA_EXCEEDED",
    ]),
    retryable: z.boolean(),
    message: z.string().min(1).max(500),
    repairAttempts: z.number().int().min(0).max(20).optional(),
  })
  .strict();
export type StructuredGenerationError = z.infer<
  typeof structuredGenerationErrorSchema
>;

// ---------------------------------------------------------------------------
// ST-044 — Grounded learning objectives and instructional analysis
// ---------------------------------------------------------------------------

/** Bounded configuration-derived parameters for one objectives generation. */
export const objectiveGenerationParamsSchema = z
  .object({
    configurationVersion: z.number().int().positive(),
    lessonTitle: boundedText(200),
    subject: boundedText(200),
    ageBand: lessonAgeBandSchema,
    difficulty: lessonDifficultySchema,
    tone: lessonToneSchema,
    targetDurationSeconds: targetDurationSecondsSchema,
    includeRecallQuestions: z.boolean(),
  })
  .strict();
export type ObjectiveGenerationParams = z.infer<
  typeof objectiveGenerationParamsSchema
>;

/**
 * The versioned structured output the model must produce for objectives.
 * Every objective and planning item must cite at least one source block ID;
 * citation existence and uniqueness are enforced by deterministic checks.
 */
export const objectiveOutputItemSchema = z
  .object({
    statement: boundedText(500),
    verb: boundedText(50),
    sourceBlockIds: z.array(identifierSchema).min(1).max(100),
    confidence: z.number().min(0).max(1),
  })
  .strict();
export type ObjectiveOutputItem = z.infer<typeof objectiveOutputItemSchema>;

export const objectivePlanningOutputItemSchema = z
  .object({
    text: boundedText(300),
    sourceBlockIds: z.array(identifierSchema).min(1).max(100),
  })
  .strict();
export type ObjectivePlanningOutputItem = z.infer<
  typeof objectivePlanningOutputItemSchema
>;

export const objectiveVocabularyOutputItemSchema = z
  .object({
    term: boundedText(100),
    definition: boundedText(300),
    sourceBlockIds: z.array(identifierSchema).min(1).max(100),
  })
  .strict();
export type ObjectiveVocabularyOutputItem = z.infer<
  typeof objectiveVocabularyOutputItemSchema
>;

export const objectiveMisconceptionOutputItemSchema = z
  .object({
    misconception: boundedText(300),
    correction: boundedText(300),
    sourceBlockIds: z.array(identifierSchema).min(1).max(100),
  })
  .strict();
export type ObjectiveMisconceptionOutputItem = z.infer<
  typeof objectiveMisconceptionOutputItemSchema
>;

export const objectiveAssessmentOutputItemSchema = z
  .object({
    question: boundedText(500),
    sourceBlockIds: z.array(identifierSchema).min(1).max(100),
  })
  .strict();
export type ObjectiveAssessmentOutputItem = z.infer<
  typeof objectiveAssessmentOutputItemSchema
>;

export const objectiveOutputV1Schema = z
  .object({
    schemaVersion: z.literal("objectives-v1"),
    objectives: z
      .array(objectiveOutputItemSchema)
      .min(3)
      .max(6),
    keyConcepts: z.array(objectivePlanningOutputItemSchema).max(12),
    prerequisiteKnowledge: z.array(objectivePlanningOutputItemSchema).max(8),
    vocabulary: z.array(objectiveVocabularyOutputItemSchema).max(12),
    misconceptions: z.array(objectiveMisconceptionOutputItemSchema).max(8),
    assessmentQuestions: z.array(objectiveAssessmentOutputItemSchema).max(8),
  })
  .strict();
export type ObjectiveOutputV1 = z.infer<typeof objectiveOutputV1Schema>;

export const learningObjectiveSetStatusValues = [
  "draft",
  "approved",
  "superseded",
] as const;
export const learningObjectiveSetStatusSchema = z.enum(
  learningObjectiveSetStatusValues,
);
export type LearningObjectiveSetStatus = z.infer<
  typeof learningObjectiveSetStatusSchema
>;

/** Whether a persisted objective still cites approved source blocks. */
export const objectiveGroundingStatusValues = ["supported", "unsupported"] as const;
export const objectiveGroundingStatusSchema = z.enum(objectiveGroundingStatusValues);
export type ObjectiveGroundingStatus = z.infer<
  typeof objectiveGroundingStatusSchema
>;

/** Persisted learning objective (AI-generated in ST-044; teacher edits revise later). */
export const learningObjectiveSchema = z
  .object({
    id: identifierSchema,
    order: z.number().int().positive(),
    statement: boundedText(500),
    verb: boundedText(50),
    confidence: z.number().min(0).max(1),
    sourceRefs: z.array(sourceRefSchema).max(20),
    generated: z.boolean(),
    revision: z.number().int().nonnegative(),
    groundingStatus: objectiveGroundingStatusSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const expected = value.sourceRefs.length > 0 ? "supported" : "unsupported";
    if (value.groundingStatus !== expected)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["groundingStatus"],
        message: `groundingStatus must be ${expected} for this source-ref set.`,
      });
  });
export type LearningObjective = z.infer<typeof learningObjectiveSchema>;

/** Persisted planning item shared by key concepts and prerequisites. */
export const objectivePlanningItemSchema = z
  .object({
    id: identifierSchema,
    order: z.number().int().positive(),
    text: boundedText(300),
    sourceRefs: z.array(sourceRefSchema).min(1).max(20),
  })
  .strict();
export type ObjectivePlanningItem = z.infer<typeof objectivePlanningItemSchema>;

export const objectiveVocabularyItemSchema = z
  .object({
    id: identifierSchema,
    order: z.number().int().positive(),
    term: boundedText(100),
    definition: boundedText(300),
    sourceRefs: z.array(sourceRefSchema).min(1).max(20),
  })
  .strict();
export type ObjectiveVocabularyItem = z.infer<
  typeof objectiveVocabularyItemSchema
>;

export const objectiveMisconceptionItemSchema = z
  .object({
    id: identifierSchema,
    order: z.number().int().positive(),
    misconception: boundedText(300),
    correction: boundedText(300),
    sourceRefs: z.array(sourceRefSchema).min(1).max(20),
  })
  .strict();
export type ObjectiveMisconceptionItem = z.infer<
  typeof objectiveMisconceptionItemSchema
>;

export const objectiveAssessmentItemSchema = z
  .object({
    id: identifierSchema,
    order: z.number().int().positive(),
    question: boundedText(500),
    sourceRefs: z.array(sourceRefSchema).min(1).max(20),
  })
  .strict();
export type ObjectiveAssessmentItem = z.infer<
  typeof objectiveAssessmentItemSchema
>;

/**
 * Immutable draft objective set produced by one objectives generation. The
 * teacher edits/approval in ST-045 create revisions rather than mutating the
 * generated objective rows.
 */
export const learningObjectiveSetSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: identifierSchema,
    projectId: identifierSchema,
    sourceSnapshotId: identifierSchema,
    sourceSnapshotContentHash: z
      .string()
      .regex(sha256HexPattern, "Expected a hexadecimal SHA-256 checksum.")
      .transform((value) => value.toLowerCase()),
    configurationVersion: z.number().int().positive(),
    promptId: z.string().trim().min(1).max(100),
    promptVersion: z.string().trim().min(1).max(50),
    model: z.string().trim().min(1).max(200),
    modelCallId: identifierSchema,
    status: learningObjectiveSetStatusSchema,
    revision: z.number().int().nonnegative(),
    objectives: z.array(learningObjectiveSchema).max(20),
    keyConcepts: z.array(objectivePlanningItemSchema).max(50),
    prerequisiteKnowledge: z.array(objectivePlanningItemSchema).max(50),
    vocabulary: z.array(objectiveVocabularyItemSchema).max(50),
    misconceptions: z.array(objectiveMisconceptionItemSchema).max(50),
    assessmentQuestions: z.array(objectiveAssessmentItemSchema).max(50),
    generatedAt: z.string().datetime({ offset: true }),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type LearningObjectiveSet = z.infer<typeof learningObjectiveSetSchema>;

/** The prompt/model the API uses for objectives generation right now. */
export const objectiveGenerationCompatibilitySchema = z
  .object({
    promptId: z.string().trim().min(1).max(100),
    promptVersion: z.string().trim().min(1).max(50),
    model: z.string().trim().min(1).max(200),
  })
  .strict();
export type ObjectiveGenerationCompatibility = z.infer<
  typeof objectiveGenerationCompatibilitySchema
>;
export const currentObjectiveGenerationCompatibility =
  objectiveGenerationCompatibilitySchema.parse({
    promptId: "objectives",
    promptVersion: "v2",
    model: "mock-model-1",
  });

/** Latest objectives generation job surfaced for the review UI. */
export const objectiveGenerationJobStatusSchema = z
  .object({
    id: identifierSchema,
    state: z.enum([
      "queued",
      "running",
      "retry_wait",
      "succeeded",
      "failed",
      "cancelled",
    ]),
    errorCode: z.string().max(100).nullable(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type ObjectiveGenerationJobStatus = z.infer<
  typeof objectiveGenerationJobStatusSchema
>;

export const objectiveGenerationResponseSchema = z
  .object({
    jobId: identifierSchema,
    status: z.literal("queued"),
  })
  .strict();
export type ObjectiveGenerationResponse = z.infer<
  typeof objectiveGenerationResponseSchema
>;

/** Review route state derived from the latest set and generation job. */
export const objectiveGenerationStateValues = [
  "idle",
  "generating",
  "draft",
  "approved",
  "failed",
] as const;
export const objectiveGenerationStateSchema = z.enum(
  objectiveGenerationStateValues,
);
export type ObjectiveGenerationState = z.infer<
  typeof objectiveGenerationStateSchema
>;

/** `GET /projects/:id/objectives` response. */
export const objectivesResponseSchema = z
  .object({
    state: objectiveGenerationStateSchema,
    set: learningObjectiveSetSchema.nullable(),
    approved: learningObjectiveSetSchema.nullable(),
    latestJob: objectiveGenerationJobStatusSchema.nullable(),
    canGenerate: z.boolean(),
    canApprove: z.boolean(),
  })
  .strict();
export type ObjectivesResponse = z.infer<typeof objectivesResponseSchema>;

// ---------------------------------------------------------------------------
// ST-045 — Edit, reorder, regenerate, and approve learning objectives
// ---------------------------------------------------------------------------

/** Boundary for adding a teacher-authored objective to the current draft. */
export const objectiveCreateInputSchema = z
  .object({
    statement: boundedText(500),
    verb: boundedText(50),
    sourceBlockIds: z.array(identifierSchema).max(100).optional(),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export type ObjectiveCreateInput = z.infer<typeof objectiveCreateInputSchema>;

/** Boundary for editing one objective in the current draft. */
export const objectiveUpdateInputSchema = z
  .object({
    statement: boundedText(500).optional(),
    verb: boundedText(50).optional(),
    sourceBlockIds: z.array(identifierSchema).max(100).optional(),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.statement === undefined &&
      value.verb === undefined &&
      value.sourceBlockIds === undefined
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["root"],
        message: "Provide at least one field to update.",
      });
  });
export type ObjectiveUpdateInput = z.infer<typeof objectiveUpdateInputSchema>;

/** Boundary for removing one objective from the current draft. */
export const objectiveRemoveInputSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export type ObjectiveRemoveInput = z.infer<typeof objectiveRemoveInputSchema>;

/** Boundary for reordering the current draft's objectives. */
export const objectiveReorderInputSchema = z
  .object({
    objectiveIds: z.array(identifierSchema).min(1).max(20),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export type ObjectiveReorderInput = z.infer<typeof objectiveReorderInputSchema>;

/** Boundary for approving the current draft objectives. */
export const objectiveApproveInputSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export type ObjectiveApproveInput = z.infer<typeof objectiveApproveInputSchema>;

// ---------------------------------------------------------------------------
// ST-046 — Grounded duration-aware lesson outline generation
// ---------------------------------------------------------------------------

/** Structural purpose of one lesson-outline item. */
export const outlineItemKindValues = [
  "hook",
  "concept",
  "example",
  "analogy",
  "summary",
  "recall_question",
] as const;
export const outlineItemKindSchema = z.enum(outlineItemKindValues);
export type OutlineItemKind = z.infer<typeof outlineItemKindSchema>;

/**
 * Fraction of the configured target duration within which the total estimated
 * outline time must land (a 180-second lesson tolerates 162–198 seconds).
 */
export const outlineDurationToleranceRatio = 0.1 as const;

/** Per-item estimated-time bounds for a bounded, scene-agnostic outline. */
export const outlineItemMinimumSeconds = 10 as const;
export const outlineItemMaximumSeconds = 240 as const;

/**
 * Bounded configuration-derived parameters for one outline generation. The
 * approved objective set identity (not its content) travels here; the pipeline
 * worker loads the approved set from the database so the model prompt and the
 * deterministic coverage check always use the exact approved revision.
 */
export const outlineGenerationParamsSchema = z
  .object({
    configurationVersion: z.number().int().positive(),
    lessonTitle: boundedText(200),
    subject: boundedText(200),
    ageBand: lessonAgeBandSchema,
    difficulty: lessonDifficultySchema,
    tone: lessonToneSchema,
    targetDurationSeconds: targetDurationSecondsSchema,
    includeRecallQuestions: z.boolean(),
    objectiveSetId: identifierSchema,
    objectiveSetRevision: z.number().int().nonnegative(),
  })
  .strict();
export type OutlineGenerationParams = z.infer<
  typeof outlineGenerationParamsSchema
>;

/**
 * One model-proposed outline item. The model returns kind, title,
 * description, objective links, source block IDs, and an estimated duration;
 * application code assigns stable IDs, order, and resolved SourceRefs.
 * Non-hook items must cite at least one source block; an uncited hook must be
 * labelled as generated framing via `framingNote`.
 */
export const outlineOutputItemSchema = z
  .object({
    kind: outlineItemKindSchema,
    title: boundedText(160),
    description: boundedText(1_000),
    objectiveIds: z.array(identifierSchema).min(1).max(20),
    sourceBlockIds: z.array(identifierSchema).max(100),
    estimatedSeconds: z
      .number()
      .int()
      .min(outlineItemMinimumSeconds)
      .max(outlineItemMaximumSeconds),
    framingNote: boundedText(500).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.sourceBlockIds.length === 0) {
      if (value.kind !== "hook")
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sourceBlockIds"],
          message:
            "Non-hook outline items must cite at least one source block.",
        });
      else if (value.framingNote === undefined)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["framingNote"],
          message: "Uncited hook items must be labelled as generated framing.",
        });
    }
  });
export type OutlineOutputItem = z.infer<typeof outlineOutputItemSchema>;

/**
 * The versioned structured output the model must produce for one outline
 * generation. Items describe pedagogical purpose, not exact scene layout.
 */
export const outlineOutputV1Schema = z
  .object({
    schemaVersion: z.literal("outline-v1"),
    targetDurationSeconds: targetDurationSecondsSchema,
    items: z.array(outlineOutputItemSchema).min(3).max(20),
  })
  .strict();
export type OutlineOutputV1 = z.infer<typeof outlineOutputV1Schema>;

export const lessonOutlineSetStatusValues = [
  "draft",
  "approved",
  "superseded",
] as const;
export const lessonOutlineSetStatusSchema = z.enum(
  lessonOutlineSetStatusValues,
);
export type LessonOutlineSetStatus = z.infer<
  typeof lessonOutlineSetStatusSchema
>;

/** Persisted outline item with resolved citations and objective links. */
export const lessonOutlineItemSchema = z
  .object({
    id: identifierSchema,
    order: z.number().int().positive(),
    kind: outlineItemKindSchema,
    title: boundedText(160),
    description: boundedText(1_000),
    estimatedSeconds: z
      .number()
      .int()
      .min(outlineItemMinimumSeconds)
      .max(outlineItemMaximumSeconds),
    sourceRefs: z.array(sourceRefSchema).max(20),
    objectiveIds: z.array(identifierSchema).min(1).max(20),
    framingNote: boundedText(500).nullable(),
    generated: z.boolean(),
    revision: z.number().int().nonnegative(),
  })
  .strict();
export type LessonOutlineItem = z.infer<typeof lessonOutlineItemSchema>;

/**
 * Immutable draft outline set produced by one outline generation. Teacher
 * editing/approval (ST-047) creates revisions rather than mutating generated
 * items. The approved objective-set content hash binds the outline to the
 * exact approved objectives it must cover.
 */
export const lessonOutlineSetSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: identifierSchema,
    projectId: identifierSchema,
    sourceSnapshotId: identifierSchema,
    sourceSnapshotContentHash: z
      .string()
      .regex(sha256HexPattern, "Expected a hexadecimal SHA-256 checksum.")
      .transform((value) => value.toLowerCase()),
    objectiveSetId: identifierSchema,
    objectiveSetContentHash: z
      .string()
      .regex(sha256HexPattern, "Expected a hexadecimal SHA-256 checksum.")
      .transform((value) => value.toLowerCase()),
    configurationVersion: z.number().int().positive(),
    promptId: z.string().trim().min(1).max(100),
    promptVersion: z.string().trim().min(1).max(50),
    model: z.string().trim().min(1).max(200),
    modelCallId: identifierSchema,
    status: lessonOutlineSetStatusSchema,
    revision: z.number().int().nonnegative(),
    items: z.array(lessonOutlineItemSchema).max(20),
    totalEstimatedSeconds: z.number().int().positive(),
    generatedAt: z.string().datetime({ offset: true }),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type LessonOutlineSet = z.infer<typeof lessonOutlineSetSchema>;

/** The prompt/model the API uses for outline generation right now. */
export const outlineGenerationCompatibilitySchema = z
  .object({
    promptId: z.string().trim().min(1).max(100),
    promptVersion: z.string().trim().min(1).max(50),
    model: z.string().trim().min(1).max(200),
  })
  .strict();
export type OutlineGenerationCompatibility = z.infer<
  typeof outlineGenerationCompatibilitySchema
>;
export const currentOutlineGenerationCompatibility =
  outlineGenerationCompatibilitySchema.parse({
    promptId: "outline",
    promptVersion: "v2",
    model: "mock-model-1",
  });

/** Latest outline generation job surfaced for the review route. */
export const outlineGenerationJobStatusSchema = z
  .object({
    id: identifierSchema,
    state: z.enum([
      "queued",
      "running",
      "retry_wait",
      "succeeded",
      "failed",
      "cancelled",
    ]),
    errorCode: z.string().max(100).nullable(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type OutlineGenerationJobStatus = z.infer<
  typeof outlineGenerationJobStatusSchema
>;

export const outlineGenerationResponseSchema = z
  .object({
    jobId: identifierSchema,
    status: z.literal("queued"),
  })
  .strict();
export type OutlineGenerationResponse = z.infer<
  typeof outlineGenerationResponseSchema
>;

/** Outline review route state derived from the latest set and generation job. */
export const outlineGenerationStateValues = [
  "idle",
  "generating",
  "draft",
  "failed",
  "approved",
] as const;
export const outlineGenerationStateSchema = z.enum(outlineGenerationStateValues);
export type OutlineGenerationState = z.infer<
  typeof outlineGenerationStateSchema
>;

export const outlineDurationStatusValues = [
  "under",
  "over",
  "within",
] as const;
export const outlineDurationStatusSchema = z.enum(outlineDurationStatusValues);
export type OutlineDurationStatus = z.infer<
  typeof outlineDurationStatusSchema
>;

/**
 * ST-047 validation surfaced for the outline review route. `structurallyValid`
 * blocks approval for an empty outline, items without objective links, a
 * non-hook item without source references, or an uncited hook that is not
 * labelled as generated framing. `uncoveredObjectiveIds` lists approved
 * objectives no draft item links, which also blocks approval. Duration and
 * structure warnings are informational and do not block approval.
 */
export const outlineValidationSchema = z
  .object({
    structurallyValid: z.boolean(),
    durationStatus: outlineDurationStatusSchema,
    durationWarning: z.string().max(500).nullable(),
    uncoveredObjectiveIds: z.array(identifierSchema),
    structureWarning: z.string().max(500).nullable(),
  })
  .strict();
export type OutlineValidation = z.infer<typeof outlineValidationSchema>;

/** `GET /projects/:id/outline` response. */
export const outlineResponseSchema = z
  .object({
    state: outlineGenerationStateSchema,
    set: lessonOutlineSetSchema.nullable(),
    approved: lessonOutlineSetSchema.nullable(),
    latestJob: outlineGenerationJobStatusSchema.nullable(),
    canGenerate: z.boolean(),
    canApprove: z.boolean(),
    validation: outlineValidationSchema,
  })
  .strict();
export type OutlineResponse = z.infer<typeof outlineResponseSchema>;

// ---------------------------------------------------------------------------
// ST-047 — Edit, reorder, link, and approve the lesson outline
// ---------------------------------------------------------------------------

/** Boundary for adding a teacher-authored outline item to the current draft. */
export const outlineItemCreateInputSchema = z
  .object({
    kind: outlineItemKindSchema,
    title: boundedText(160),
    description: boundedText(1_000),
    estimatedSeconds: z
      .number()
      .int()
      .min(outlineItemMinimumSeconds)
      .max(outlineItemMaximumSeconds),
    objectiveIds: z.array(identifierSchema).min(1).max(20),
    sourceBlockIds: z.array(identifierSchema).max(100).optional(),
    framingNote: boundedText(500).optional(),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export type OutlineItemCreateInput = z.infer<
  typeof outlineItemCreateInputSchema
>;

/** Boundary for editing one outline item in the current draft. */
export const outlineItemUpdateInputSchema = z
  .object({
    kind: outlineItemKindSchema.optional(),
    title: boundedText(160).optional(),
    description: boundedText(1_000).optional(),
    estimatedSeconds: z
      .number()
      .int()
      .min(outlineItemMinimumSeconds)
      .max(outlineItemMaximumSeconds)
      .optional(),
    objectiveIds: z.array(identifierSchema).min(1).max(20).optional(),
    sourceBlockIds: z.array(identifierSchema).max(100).optional(),
    framingNote: z.string().trim().min(1).max(500).nullable().optional(),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.kind === undefined &&
      value.title === undefined &&
      value.description === undefined &&
      value.estimatedSeconds === undefined &&
      value.objectiveIds === undefined &&
      value.sourceBlockIds === undefined &&
      value.framingNote === undefined
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["root"],
        message: "Provide at least one field to update.",
      });
  });
export type OutlineItemUpdateInput = z.infer<
  typeof outlineItemUpdateInputSchema
>;

/** Boundary for removing one outline item from the current draft. */
export const outlineItemRemoveInputSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export type OutlineItemRemoveInput = z.infer<
  typeof outlineItemRemoveInputSchema
>;

/** Boundary for reordering the current draft's outline items. */
export const outlineReorderInputSchema = z
  .object({
    itemIds: z.array(identifierSchema).min(1).max(20),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.itemIds).size !== value.itemIds.length)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["itemIds"],
        message: "Outline item ids must be unique.",
      });
  });
export type OutlineReorderInput = z.infer<typeof outlineReorderInputSchema>;

/** Boundary for approving the current draft outline. */
export const outlineApproveInputSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export type OutlineApproveInput = z.infer<typeof outlineApproveInputSchema>;
