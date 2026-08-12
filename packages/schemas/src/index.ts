import { identifierSchema } from "@avlp/config/identifiers";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const lessonSpecVersion = "1.7" as const;
export const previousLessonSpecVersion = "1.6" as const;
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
      visual: visual({
        problem: boundedText(1_000),
        steps: labelledItems,
        answer: boundedText(1_000),
      }),
    })
    .strict(),
  z
    .object({
      ...sceneBaseShape,
      template: z.literal("summary"),
      visual: visual({
        takeaways: labelledItems,
        callToAction: boundedText(500).optional(),
      }),
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
    schemaVersion: z.literal(previousLessonSpecVersion),
    scenes: z.array(z.unknown()).min(1).max(100),
  })
  .passthrough();

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
  const migrated = lessonSpecSchema.safeParse({
    ...parsed.data,
    schemaVersion: lessonSpecVersion,
  });
  if (migrated.success) return migrated.data;
  throw new Error(
    "LessonSpec 1.6 contains content that requires an explicit teacher migration before it can become 1.7.",
  );
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
    return migrateLessonSpecV1_6ToV1_7(input);
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
  })
  .strict()
  .superRefine(pageRangeValidation);
export type ExtractedFigure = z.infer<typeof extractedFigureSchema>;

export const parsedTableSchema = z
  .object({
    id: identifierSchema,
    sectionId: identifierSchema,
    ...pageRangeShape,
    order: z.number().int().positive(),
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
export type ParsedTable = z.infer<typeof parsedTableSchema>;

export const ingestionWarningSchema = z
  .object({
    code: z.enum([
      "unknown_block",
      "low_ocr_quality",
      "missing_caption",
      "malformed_table",
      "uncertain_reading_order",
      "duplicate_reading_order",
    ]),
    severity: z.enum(["info", "warning", "error"]),
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
