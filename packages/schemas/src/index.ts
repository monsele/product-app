import { togetherModelDefaults } from "@avlp/config";
import { identifierSchema, type Identifier } from "@avlp/config/identifiers";
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
export const sceneAssetRoleValues = [
  "background",
  "diagram",
  "icon",
  "illustration",
  "photo",
  "supporting",
] as const;
export const sceneAssetRoleSchema = z.enum(sceneAssetRoleValues);
export type SceneAssetRole = z.infer<typeof sceneAssetRoleSchema>;

/** The epistemic role of a template-owned visual slot (ST-085). */
export const visualRoleSchema = z.enum([
  "grounding_critical",
  "source_derived",
  "decorative",
]);
export type VisualRole = z.infer<typeof visualRoleSchema>;

export const assetProvenanceSchema = z.enum([
  "catalog",
  "source_figure",
  "teacher_uploaded",
  "ai_generated",
]);
export type AssetProvenance = z.infer<typeof assetProvenanceSchema>;

/**
 * ST-085: `provenance` records where the bound asset came from and `visualRole`
 * mirrors the epistemic role of the slot it fills. Both are optional so bindings
 * written against the previous contract (no provenance) keep parsing; every
 * binding created from this release on carries them. The authoritative check is
 * on `sceneSpecSchema` — see `assetBindingComplianceIssues` — because only the
 * scene knows its template and therefore the slot's real role. The refinement
 * here is a second, template-independent guard for callers that validate a
 * binding in isolation.
 */
export const sceneAssetBindingSchema = z
  .object({
    assetId: identifierSchema,
    role: sceneAssetRoleSchema,
    altText: boundedText(500).optional(),
    provenance: assetProvenanceSchema.optional(),
    slot: boundedText(64).optional(),
    sourceRef: sourceRefSchema.optional(),
    visualRole: visualRoleSchema.optional(),
  })
  .strict()
  .superRefine((binding, context) => {
    if (binding.visualRole === undefined) return;
    if (
      binding.visualRole === "grounding_critical" &&
      binding.provenance === "ai_generated"
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["provenance"],
        message: "A grounding-critical slot cannot use an AI-generated asset.",
      });
    if (binding.visualRole !== "decorative" && binding.sourceRef === undefined)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceRef"],
        message:
          "A grounding-critical or source-derived slot requires a source reference.",
      });
  });
export type SceneAssetBinding = z.infer<typeof sceneAssetBindingSchema>;

// ---------------------------------------------------------------------------
// ST-059 — bounded illustration generation
// ---------------------------------------------------------------------------

export const illustrationGenerationUseCaseValues = [
  "conceptual-supporting-illustration",
] as const;
export const illustrationGenerationUseCaseSchema = z.enum(
  illustrationGenerationUseCaseValues,
);
export const illustrationCandidateStatusSchema = z.enum([
  "queued",
  "generating",
  "pending_review",
  "accepted",
  "rejected",
  "failed",
]);
export const illustrationModerationStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
]);
export const illustrationGenerationInputSchema = z
  .object({
    useCase: illustrationGenerationUseCaseSchema,
    expectedSceneRevision: z.number().int().nonnegative(),
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .strict();
export const illustrationCandidateDecisionInputSchema = z
  .object({
    expectedSceneRevision: z.number().int().nonnegative(),
    expectedStoryboardRevision: z.number().int().nonnegative(),
    // Optional so the existing per-scene acceptance path remains compatible.
    // The contact sheet supplies this when the teacher refines the accessible
    // description before accepting an illustration.
    altText: boundedText(300).optional(),
  })
  .strict();
export const illustrationGenerationResponseSchema = z
  .object({
    candidateId: identifierSchema,
    jobId: identifierSchema,
    status: z.literal("queued"),
  })
  .strict();
export type IllustrationGenerationResponse = z.infer<
  typeof illustrationGenerationResponseSchema
>;
/**
 * Result of queueing illustrations for every required-but-unbound asset slot in
 * a lesson. The hourly cap is usually smaller than a full storyboard's needs, so
 * this reports a partial run honestly rather than failing the whole request:
 * `queued` covers what was accepted and `skipped` what the cap deferred.
 */
export const lessonIllustrationGenerationResponseSchema = z
  .object({
    totalMissing: z.number().int().nonnegative().max(1_000),
    queued: z.number().int().nonnegative().max(1_000),
    skipped: z.number().int().nonnegative().max(1_000),
    rateLimited: z.boolean(),
    requests: z
      .array(
        z
          .object({
            sceneId: identifierSchema,
            slot: z.string().trim().min(1).max(64),
            candidateId: identifierSchema,
            jobId: identifierSchema,
            status: z.literal("queued"),
          })
          .strict(),
      )
      .max(1_000),
  })
  .strict();
export type LessonIllustrationGenerationResponse = z.infer<
  typeof lessonIllustrationGenerationResponseSchema
>;

export const illustrationGenerationJobPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    candidateId: identifierSchema,
  })
  .strict();
export type IllustrationGenerationJobPayload = z.infer<
  typeof illustrationGenerationJobPayloadSchema
>;
export const illustrationCandidateSchema = z
  .object({
    id: identifierSchema,
    sceneId: identifierSchema,
    slot: boundedText(64),
    assetId: identifierSchema.nullable(),
    status: illustrationCandidateStatusSchema,
    moderationStatus: illustrationModerationStatusSchema,
    provenance: z.literal("ai_generated"),
  })
  .strict();

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
  sourceRefs: z.array(sourceRefSchema).max(100),
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
export const processAssetSlotSchema = z.enum([
  "step-1-icon",
  "step-2-icon",
  "step-3-icon",
  "step-4-icon",
  "step-5-icon",
  "step-6-icon",
]);
const graphIdSchema = boundedText(40).regex(/^[a-z][a-z0-9-]*$/);
/**
 * A structural edge between two nodes. The engine decides geometry: no pixel,
 * coordinate, transform, or easing field is accepted here or on a node.
 */
export const graphEdgeSchema = z
  .object({
    id: graphIdSchema,
    from: boundedText(40),
    to: boundedText(40),
    label: boundedText(60).optional(),
  })
  .strict();
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
export const processNodeSchema = z
  .object({
    id: graphIdSchema,
    label: boundedText(80),
    assetSlot: processAssetSlotSchema.optional(),
  })
  .strict();
export type ProcessNode = z.infer<typeof processNodeSchema>;
/**
 * Shared structural validation for node-and-edge scene visuals: unique node ids,
 * unique edge ids, and every edge endpoint resolving to a declared node. An edge
 * that references an unknown node id fails validation.
 */
export const refineSceneGraph = (
  nodes: readonly { id: string }[],
  edges: readonly { id: string; from: string; to: string }[],
  context: z.RefinementCtx,
): void => {
  const nodeIds = new Set<string>();
  nodes.forEach((node, index) => {
    if (nodeIds.has(node.id))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nodes", index, "id"],
        message: "Graph node ids must be unique.",
      });
    nodeIds.add(node.id);
  });
  const edgeIds = new Set<string>();
  edges.forEach((edge, index) => {
    if (edgeIds.has(edge.id))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["edges", index, "id"],
        message: "Graph edge ids must be unique.",
      });
    edgeIds.add(edge.id);
    if (edge.from === edge.to)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["edges", index, "to"],
        message: "An edge cannot connect a node to itself.",
      });
    if (!nodeIds.has(edge.from))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["edges", index, "from"],
        message: `Edge references unknown node id "${edge.from}".`,
      });
    if (!nodeIds.has(edge.to))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["edges", index, "to"],
        message: `Edge references unknown node id "${edge.to}".`,
      });
  });
  const pairs = new Set<string>();
  edges.forEach((edge, index) => {
    const key = `${edge.from} ${edge.to}`;
    if (pairs.has(key))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["edges", index],
        message: `Duplicate edge from "${edge.from}" to "${edge.to}".`,
      });
    pairs.add(key);
  });
};
/**
 * `process` visual. Backwards compatible: a scene supplies either the legacy
 * `steps` array or the graph `nodes`/`edges` pair, never both. Coordinates,
 * transforms, easing, and animation code are rejected by `.strict()`.
 */
export const processVisualSchema = z
  .object({
    steps: z.array(boundedText(80)).min(2).max(6).optional(),
    nodes: z.array(processNodeSchema).min(2).max(12).optional(),
    edges: z.array(graphEdgeSchema).min(1).max(24).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasGraph = value.nodes !== undefined || value.edges !== undefined;
    if (hasGraph === (value.steps !== undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [value.steps === undefined ? "steps" : "nodes"],
        message: "Provide either `steps` or `nodes` and `edges`, not both.",
      });
      return;
    }
    if (!hasGraph) return;
    if (value.nodes === undefined || value.edges === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [value.nodes === undefined ? "nodes" : "edges"],
        message: "A graph process scene requires both `nodes` and `edges`.",
      });
      return;
    }
    refineSceneGraph(value.nodes, value.edges, context);
  });
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
export const causeEffectKindSchema = z.enum(["cause", "mechanism", "effect"]);
export type CauseEffectKind = z.infer<typeof causeEffectKindSchema>;
export const causeEffectGraphNodeSchema = z
  .object({
    id: graphIdSchema,
    label: boundedText(80),
    kind: causeEffectKindSchema,
    assetSlot: causeEffectAssetSlotSchema.optional(),
  })
  .strict();
export type CauseEffectGraphNode = z.infer<typeof causeEffectGraphNodeSchema>;
/**
 * `cause-effect` visual. Backwards compatible: a scene supplies either the
 * legacy `causes`/`mechanism`/`effects`/`connections` shape or the graph
 * `nodes`/`edges` pair, never both. Coordinates, transforms, easing, and
 * animation code are rejected by `.strict()`.
 */
export const causeEffectVisualSchema = z
  .object({
    causes: z.array(causeEffectNodeSchema).min(1).max(3).optional(),
    mechanism: causeEffectNodeSchema.optional(),
    effects: z.array(causeEffectNodeSchema).min(1).max(3).optional(),
    connections: z.array(causeEffectConnectionSchema).min(1).max(9).optional(),
    nodes: z.array(causeEffectGraphNodeSchema).min(2).max(12).optional(),
    edges: z.array(graphEdgeSchema).min(1).max(24).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasGraph = value.nodes !== undefined || value.edges !== undefined;
    const hasLegacy =
      value.causes !== undefined ||
      value.effects !== undefined ||
      value.connections !== undefined;
    if (hasGraph === hasLegacy) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [hasGraph ? "nodes" : "causes"],
        message:
          "Provide either the legacy causes/mechanism/effects/connections shape or the graph nodes/edges pair, not both.",
      });
      return;
    }
    if (hasGraph) {
      if (value.nodes === undefined || value.edges === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [value.nodes === undefined ? "nodes" : "edges"],
          message:
            "A graph cause-effect scene requires both `nodes` and `edges`.",
        });
        return;
      }
      refineSceneGraph(value.nodes, value.edges, context);
      if (!value.nodes.some((node) => node.kind === "cause"))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes"],
          message: "A cause-effect graph needs at least one `cause` node.",
        });
      if (!value.nodes.some((node) => node.kind === "effect"))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes"],
          message: "A cause-effect graph needs at least one `effect` node.",
        });
      return;
    }
    if (
      value.causes === undefined ||
      value.effects === undefined ||
      value.connections === undefined
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["connections"],
        message:
          "The legacy cause-effect shape requires causes, effects, and connections together.",
      });
      return;
    }
    const legacyCauses = value.causes;
    const legacyEffects = value.effects;
    const legacyConnections = value.connections;
    const legacyMechanism = value.mechanism;
    const nodes = [
      ...legacyCauses,
      ...(legacyMechanism === undefined ? [] : [legacyMechanism]),
      ...legacyEffects,
    ];
    const ids = new Set<string>();
    nodes.forEach((node, index) => {
      if (ids.has(node.id))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [
            index < legacyCauses.length
              ? "causes"
              : index === legacyCauses.length
                ? "mechanism"
                : "effects",
            "id",
          ],
          message: "Causal node IDs must be unique.",
        });
      ids.add(node.id);
    });
    const expected = new Set<string>();
    if (legacyMechanism === undefined)
      legacyCauses.forEach((cause) =>
        legacyEffects.forEach((effect) =>
          expected.add(`${cause.id}:${effect.id}`),
        ),
      );
    else {
      legacyCauses.forEach((cause) =>
        expected.add(`${cause.id}:${legacyMechanism.id}`),
      );
      legacyEffects.forEach((effect) =>
        expected.add(`${legacyMechanism.id}:${effect.id}`),
      );
    }
    const actual = legacyConnections.map(
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
    /**
     * Semantic placement preference. The layout engine treats this as a hint
     * and decides final pixels; raw pixel coordinates are never accepted.
     */
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
    labels: z.array(diagramLabelSchema).min(1).max(20),
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

export const sceneSpecSchema = z
  .discriminatedUnion("template", [
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
  ])
  .superRefine((scene, context) => {
    // ST-085: enforce the slot's epistemic role structurally, on the scene
    // contract, so no binding — however it was constructed or by which endpoint —
    // can place generated imagery into a slot a learner must trust. The role is
    // read from the immutable template registry, never from the binding.
    for (const issue of assetBindingComplianceIssues(
      scene.template,
      scene.assetBindings,
    ))
      context.addIssue({ code: z.ZodIssueCode.custom, ...issue });
  });
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
      if (scene.sourceRefs.length === 0)
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["scenes", index, "sourceRefs"],
          message: "Every lesson scene must cite at least one source block.",
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
    duplicateDetected: z.boolean().optional().default(false),
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

/** Retained deletion of one project-private teacher asset. */
export const projectAssetCleanupJobPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    assetId: identifierSchema,
    deletedAt: z.string().datetime({ offset: true }),
    cleanupAfter: z.string().datetime({ offset: true }),
  })
  .strict();
export type ProjectAssetCleanupJobPayload = z.infer<
  typeof projectAssetCleanupJobPayloadSchema
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
// ST-052 — Resolve and display scene source citations
// ---------------------------------------------------------------------------

/**
 * Why a single source-reference identifier could not be resolved against the
 * approved snapshot. Reported per reference rather than silently dropped so a
 * stale or invalid citation is always visible to the teacher.
 */
export const citationIssueKindValues = [
  "document_mismatch",
  "version_mismatch",
  "missing_section",
  "missing_block",
  "missing_figure",
  "missing_table",
] as const;
export const citationIssueKindSchema = z.enum(citationIssueKindValues);
export type CitationIssueKind = z.infer<typeof citationIssueKindSchema>;

export const citationIssueSchema = z
  .object({
    kind: citationIssueKindSchema,
    id: identifierSchema,
  })
  .strict();
export type CitationIssue = z.infer<typeof citationIssueSchema>;

/** Resolved block excerpt backing a citation. */
export const resolvedCitationBlockSchema = z
  .object({
    blockId: identifierSchema,
    sectionId: identifierSchema,
    kind: z.enum(["paragraph", "list", "equation", "caption"]),
    page: z.number().int().positive(),
    text: normalizedText(50_000),
  })
  .strict();
export type ResolvedCitationBlock = z.infer<typeof resolvedCitationBlockSchema>;

/** Resolved figure label backing a citation (no image payload). */
export const resolvedCitationFigureSchema = z
  .object({
    figureId: identifierSchema,
    sectionId: identifierSchema,
    page: z.number().int().positive(),
    altText: normalizedText(10_000).optional(),
    sourceLocator: normalizedText(2_000).optional(),
  })
  .strict();
export type ResolvedCitationFigure = z.infer<
  typeof resolvedCitationFigureSchema
>;

/** Resolved table label backing a citation (columns only, no cell payload). */
export const resolvedCitationTableSchema = z
  .object({
    tableId: identifierSchema,
    sectionId: identifierSchema,
    page: z.number().int().positive(),
    columns: z.array(normalizedText(1_000)).min(1).max(500),
  })
  .strict();
export type ResolvedCitationTable = z.infer<typeof resolvedCitationTableSchema>;

/**
 * One scene SourceRef resolved against the approved snapshot into
 * teacher-facing labels and bounded excerpts. `issues` records every stale or
 * unknown identifier so invalid grounding is surfaced, never silently ignored.
 */
export const resolvedCitationSchema = z
  .object({
    documentId: identifierSchema,
    parsedDocumentVersion: z.number().int().positive(),
    pageStart: z.number().int().positive(),
    pageEnd: z.number().int().positive().optional(),
    sectionId: identifierSchema.optional(),
    sectionHeading: normalizedText(1_000).optional(),
    blocks: z.array(resolvedCitationBlockSchema).max(100),
    figures: z.array(resolvedCitationFigureSchema).max(100),
    tables: z.array(resolvedCitationTableSchema).max(100),
    issues: z.array(citationIssueSchema).max(100),
  })
  .strict();
export type ResolvedCitation = z.infer<typeof resolvedCitationSchema>;

/** `GET /projects/:id/scenes/:sceneId/citations` response. */
export const sceneCitationsResponseSchema = z
  .object({
    sceneId: identifierSchema,
    citations: z.array(resolvedCitationSchema).max(100),
    generatedAdditions: z.array(generatedAdditionSchema).max(20),
  })
  .strict();
export type SceneCitationsResponse = z.infer<
  typeof sceneCitationsResponseSchema
>;

// ---------------------------------------------------------------------------
// ST-053 — Recheck grounding after teacher edits and preserve citation history
// ---------------------------------------------------------------------------

/**
 * Classification of a claim's grounding status after recheck.
 * - supported: The claim is fully supported by the cited source blocks.
 * - unsupported: The claim is not supported by the cited source blocks.
 * - generated_addition: The claim is a teacher/AI-generated addition (analogy, example, etc.) explicitly labelled as such.
 * - needs_review: The claim requires human review (partial support, ambiguous, etc.).
 */
export const groundingStatusValues = [
  "supported",
  "unsupported",
  "generated_addition",
  "needs_review",
] as const;
export const groundingStatusSchema = z.enum(groundingStatusValues);
export type GroundingStatus = z.infer<typeof groundingStatusSchema>;

/**
 * A single claim unit extracted from narration or on-screen text for grounding check.
 * Each claim is a self-contained factual assertion that can be verified against source.
 */
export const groundingClaimSchema = z
  .object({
    id: identifierSchema,
    text: boundedText(2_000),
    sourceRefs: z.array(sourceRefSchema).max(20),
    generatedAddition: generatedAdditionSchema.optional(),
    location: z.object({
      type: z.enum(["narration", "on_screen_text"]),
      blockId: identifierSchema.optional(),
      sceneId: identifierSchema.optional(),
      sentenceIndex: z.number().int().nonnegative().optional(),
    }),
  })
  .strict()
  .superRefine((value, context) => {
    const hasSourceRefs = value.sourceRefs.length > 0;
    const hasGeneratedAddition = value.generatedAddition !== undefined;
    if (!hasSourceRefs && !hasGeneratedAddition) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sourceRefs"],
        message: "A claim must have either sourceRefs or a generatedAddition.",
      });
    }
    if (hasSourceRefs && hasGeneratedAddition) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["generatedAddition"],
        message: "A claim cannot have both sourceRefs and a generatedAddition.",
      });
    }
  });
export type GroundingClaim = z.infer<typeof groundingClaimSchema>;

/**
 * Result of checking one claim against the approved source snapshot.
 */
export const groundingClaimResultSchema = z
  .object({
    claimId: identifierSchema,
    status: groundingStatusSchema,
    supportedSpans: z
      .array(
        z
          .object({
            start: z.number().int().nonnegative(),
            end: z.number().int().positive(),
            sourceBlockId: identifierSchema,
          })
          .refine((span) => span.start < span.end, {
            message: "A supported span start must be less than its end.",
          }),
      )
      .max(50),
    unsupportedSpans: z
      .array(
        z
          .object({
            start: z.number().int().nonnegative(),
            end: z.number().int().positive(),
            reason: boundedText(500),
          })
          .refine((span) => span.start < span.end, {
            message: "An unsupported span start must be less than its end.",
          }),
      )
      .max(50),
    modelAssisted: z.boolean(),
    modelCallId: identifierSchema.nullable(),
    checkedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type GroundingClaimResult = z.infer<typeof groundingClaimResultSchema>;

/**
 * Complete grounding check result for a lesson revision.
 * Tied to exact content hashes and source snapshot for reproducibility.
 */
export const groundingCheckSchema = z
  .object({
    schemaVersion: z.literal("grounding-check-v1"),
    id: identifierSchema,
    projectId: identifierSchema,
    lessonSpecId: identifierSchema,
    lessonSpecRevision: z.number().int().nonnegative(),
    lessonSpecContentHash: z
      .string()
      .regex(sha256HexPattern, "Expected a hexadecimal SHA-256 checksum.")
      .transform((value) => value.toLowerCase()),
    sourceSnapshotId: identifierSchema,
    sourceSnapshotContentHash: z
      .string()
      .regex(sha256HexPattern, "Expected a hexadecimal SHA-256 checksum.")
      .transform((value) => value.toLowerCase()),
    claims: z.array(groundingClaimSchema).max(500),
    results: z.array(groundingClaimResultSchema).max(500),
    summary: z.object({
      total: z.number().int().nonnegative(),
      supported: z.number().int().nonnegative(),
      unsupported: z.number().int().nonnegative(),
      generatedAddition: z.number().int().nonnegative(),
      needsReview: z.number().int().nonnegative(),
    }),
    modelCalls: z.array(identifierSchema).max(20),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type GroundingCheck = z.infer<typeof groundingCheckSchema>;

/**
 * Citation history snapshot preserved with lesson versions.
 * Records the grounding state at the time of version creation.
 */
export const citationHistorySnapshotSchema = z
  .object({
    schemaVersion: z.literal("citation-history-v1"),
    lessonVersionId: identifierSchema,
    lessonSpecId: identifierSchema,
    lessonSpecRevision: z.number().int().nonnegative(),
    sourceSnapshotId: identifierSchema,
    sourceSnapshotContentHash: z
      .string()
      .regex(sha256HexPattern, "Expected a hexadecimal SHA-256 checksum.")
      .transform((value) => value.toLowerCase()),
    sceneCitations: z.array(sceneCitationsResponseSchema).max(100),
    groundingCheckId: identifierSchema.nullable(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type CitationHistorySnapshot = z.infer<
  typeof citationHistorySnapshotSchema
>;

/** A portable, immutable lesson state. Values are copied as JSON; media is
 * represented by stable object identifiers/hashes rather than binary data. */
export const lessonVersionReasonSchema = z.enum([
  "approval",
  "explicit_save",
  "before_render",
  "restore",
]);
export type LessonVersionReason = z.infer<typeof lessonVersionReasonSchema>;
export const lessonVersionCreateSchema = z
  .object({
    reason: lessonVersionReasonSchema.default("explicit_save"),
  })
  .strict();
export type LessonVersionCreate = z.infer<typeof lessonVersionCreateSchema>;
export const lessonVersionRestoreSchema = z
  .object({
    expectedCurrentVersionId: identifierSchema.nullable(),
    confirmReplace: z.literal(true),
  })
  .strict();
export type LessonVersionRestore = z.infer<typeof lessonVersionRestoreSchema>;
export const lessonVersionSummarySchema = z
  .object({
    id: identifierSchema,
    versionNumber: z.number().int().positive(),
    reason: lessonVersionReasonSchema,
    contentHash: z.string().regex(sha256HexPattern),
    createdBy: identifierSchema,
    createdAt: z.string().datetime({ offset: true }),
    lessonSpecId: identifierSchema,
    lessonSpecRevision: z.number().int().nonnegative(),
  })
  .strict();
export type LessonVersionSummary = z.infer<typeof lessonVersionSummarySchema>;
export const lessonVersionDetailSchema = lessonVersionSummarySchema
  .extend({
    parentVersionId: identifierSchema.nullable(),
    schemaVersion: z.string().min(1).max(100),
    sceneLibraryVersion: z.string().min(1).max(100),
    durationSeconds: z.number().int().positive(),
    sceneCount: z.number().int().nonnegative(),
    renderAssociationCount: z.number().int().nonnegative(),
  })
  .strict();
export type LessonVersionDetail = z.infer<typeof lessonVersionDetailSchema>;

/** A deliberately small, application-owned allowlist. Provider identifiers never
 * cross the API boundary; the adapter resolves them only when synthesis begins. */
export const voiceCatalogEntrySchema = z
  .object({
    id: z.enum(["english-aria", "english-james", "english-luna"]),
    displayName: z.string().min(1).max(80),
    description: z.string().min(1).max(200),
    language: z.literal("en-US"),
    previewUrl: z.string().url(),
  })
  .strict();
export type VoiceCatalogEntry = z.infer<typeof voiceCatalogEntrySchema>;

export const pronunciationOverrideSchema = z
  .object({
    phrase: z.string().trim().min(1).max(80),
    replacement: z.string().trim().min(1).max(120),
  })
  .strict();
export type PronunciationOverride = z.infer<typeof pronunciationOverrideSchema>;

export const voiceConfigurationSchema = z
  .object({
    version: z.number().int().min(1),
    voiceId: voiceCatalogEntrySchema.shape.id,
    speakingRate: z.number().min(0.75).max(1.25),
    pronunciationOverrides: z.array(pronunciationOverrideSchema).max(20),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type VoiceConfiguration = z.infer<typeof voiceConfigurationSchema>;

export const voiceConfigurationInputSchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    voiceId: voiceCatalogEntrySchema.shape.id,
    speakingRate: z.number().min(0.75).max(1.25),
    pronunciationOverrides: z.array(pronunciationOverrideSchema).max(20),
  })
  .strict()
  .superRefine((value, context) => {
    const normalized = new Set<string>();
    value.pronunciationOverrides.forEach((entry, index) => {
      const key = entry.phrase.toLocaleLowerCase("en-US");
      if (normalized.has(key))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pronunciationOverrides", index, "phrase"],
          message: "Each pronunciation phrase may be configured only once.",
        });
      normalized.add(key);
    });
  });
export type VoiceConfigurationInput = z.infer<
  typeof voiceConfigurationInputSchema
>;

export const voiceConfigurationResponseSchema = z
  .object({ configuration: voiceConfigurationSchema.nullable() })
  .strict();
export type VoiceConfigurationResponse = z.infer<
  typeof voiceConfigurationResponseSchema
>;

// ST-063 â€” scene-level TTS commands never carry narration text: the worker
// re-loads the tenant-owned scene and validates the hashes before completion.
export const sceneAudioGenerationInputSchema = z
  .object({ idempotencyKey: z.string().trim().min(8).max(200) })
  .strict();
export type SceneAudioGenerationInput = z.infer<
  typeof sceneAudioGenerationInputSchema
>;
export const sceneAudioProviderOptionsSchema = z
  .object({
    providerId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
    outputFormat: z.enum(["mp3", "wav"]),
  })
  .strict();
export type SceneAudioProviderOptions = z.infer<
  typeof sceneAudioProviderOptionsSchema
>;
export const sceneAudioGenerationJobPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    sceneAudioId: identifierSchema,
    narrationHash: z.string().regex(/^[a-f0-9]{64}$/),
    voiceConfigurationHash: z.string().regex(/^[a-f0-9]{64}$/),
    provider: sceneAudioProviderOptionsSchema,
  })
  .strict();
export type SceneAudioGenerationJobPayload = z.infer<
  typeof sceneAudioGenerationJobPayloadSchema
>;
export const sceneAudioStatusResponseSchema = z
  .object({
    sceneId: identifierSchema,
    status: z.enum(["queued", "generating", "ready", "stale", "failed"]),
    jobId: identifierSchema.nullable(),
    durationMs: z.number().int().positive().nullable(),
    fitWarning: z.string().nullable(),
    failureCode: z.string().trim().min(1).max(100).nullable(),
    captions: z
      .array(
        z
          .object({
            startMs: z.number().int().nonnegative(),
            endMs: z.number().int().positive(),
            text: boundedText(1_000),
          })
          .strict()
          .refine((cue) => cue.endMs > cue.startMs, {
            message: "Caption endMs must be after startMs.",
          }),
      )
      .max(1_000),
    retryable: z.boolean(),
  })
  .strict();
export type SceneAudioStatusResponse = z.infer<
  typeof sceneAudioStatusResponseSchema
>;

/**
 * Short-lived signed playback for one scene's narration audio. The URL is
 * minted per request so the storyboard can play a scene without the caller
 * ever seeing a storage key.
 */
export const sceneAudioPlaybackResponseSchema = z
  .object({
    sceneId: identifierSchema,
    url: z.string().url(),
    contentType: z.string().trim().min(1).max(100),
    durationMs: z.number().int().positive().nullable(),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type SceneAudioPlaybackResponse = z.infer<
  typeof sceneAudioPlaybackResponseSchema
>;

/** One explicit teacher action may queue every incomplete scene, while each
 * scene keeps its own independently retryable TTS job and status record. */
export const lessonAudioGenerationResponseSchema = z
  .object({
    totalScenes: z.number().int().positive().max(50),
    readyScenes: z.number().int().nonnegative().max(50),
    pendingScenes: z.number().int().nonnegative().max(50),
    failedScenes: z.number().int().nonnegative().max(50),
    scenes: z.array(sceneAudioStatusResponseSchema).min(1).max(50),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.readyScenes + value.pendingScenes + value.failedScenes !==
      value.totalScenes
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalScenes"],
        message: "The lesson audio summary must account for every scene.",
      });
  });
export type LessonAudioGenerationResponse = z.infer<
  typeof lessonAudioGenerationResponseSchema
>;
export const lessonVersionsResponseSchema = z
  .object({
    versions: z.array(lessonVersionSummarySchema),
    latestModifiedAt: z.string().datetime({ offset: true }).nullable(),
    currentVersionId: identifierSchema.nullable(),
  })
  .strict();
export type LessonVersionsResponse = z.infer<
  typeof lessonVersionsResponseSchema
>;

/**
 * API request to trigger a grounding check for a scene or lesson.
 */
export const groundingCheckRequestSchema = z
  .object({
    scope: z.enum(["scene", "lesson"]),
    sceneId: identifierSchema.optional(),
    lessonSpecId: identifierSchema,
    lessonSpecRevision: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.scope === "scene" && value.sceneId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sceneId"],
        message: "sceneId is required when scope is 'scene'.",
      });
    }
  });
export type GroundingCheckRequest = z.infer<typeof groundingCheckRequestSchema>;

/**
 * API response for a grounding check request.
 * `cached` is true when the exact same content was already checked and the
 * existing completed result was reused instead of queueing a new paid job.
 */
export const groundingCheckResponseSchema = z
  .object({
    jobId: identifierSchema,
    status: z.literal("queued"),
    cached: z.boolean().default(false),
  })
  .strict();
export type GroundingCheckResponse = z.infer<
  typeof groundingCheckResponseSchema
>;

/**
 * API response for retrieving grounding check results.
 */
export const groundingCheckResultResponseSchema = z
  .object({
    check: groundingCheckSchema.nullable(),
    latestJob: z
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
      .nullable(),
  })
  .strict();
export type GroundingCheckResultResponse = z.infer<
  typeof groundingCheckResultResponseSchema
>;

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
    schemaVersion: z.literal(2),
    operationType: modelCallOperationSchema,
    sourceSnapshotId: identifierSchema,
    promptId: z.string().trim().min(1).max(100),
    promptVersion: z.string().trim().min(1).max(50),
    model: z.string().trim().min(1).max(200),
    /**
     * Immutable approval captured when the explicit generation request is
     * queued.  The reference is the persisted job request itself; it binds
     * execution to the selected provider, model, and bounded cost estimate.
     */
    providerApproval: z
      .object({
        approvalReference: identifierSchema,
        providerId: z.string().trim().min(1).max(100),
        model: z.string().trim().min(1).max(200),
        estimatedCostUsd: z.number().finite().nonnegative(),
        selectionReason: z.literal("explicit_job_request"),
      })
      .strict(),
    narrowing: sourcePackageNarrowingSchema.optional(),
    params: modelCallParamsSchema.optional(),
  })
  .strict();
export type ModelCallJobPayload = z.infer<typeof modelCallJobPayloadSchema>;

/**
 * Bounded parameters for one grounding check (ST-053). The job loads the
 * working lesson spec, its scenes, and the approved source snapshot from the
 * database so the prompt and the deterministic checks always use the exact
 * revisions and content hashes recorded at request time.
 */
export const groundingCheckParamsSchema = z
  .object({
    lessonSpecId: identifierSchema,
    lessonSpecRevision: z.number().int().nonnegative(),
    lessonSpecContentHash: z
      .string()
      .regex(sha256HexPattern, "Expected a hexadecimal SHA-256 checksum.")
      .transform((value) => value.toLowerCase()),
    sourceSnapshotId: identifierSchema,
    sourceSnapshotContentHash: z
      .string()
      .regex(sha256HexPattern, "Expected a hexadecimal SHA-256 checksum.")
      .transform((value) => value.toLowerCase()),
    scope: z.enum(["scene", "lesson"]),
    sceneId: identifierSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.scope === "scene" && value.sceneId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sceneId"],
        message: "sceneId is required when scope is 'scene'.",
      });
    }
  });
export type GroundingCheckParams = z.infer<typeof groundingCheckParamsSchema>;

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
    objectives: z.array(objectiveOutputItemSchema).min(3).max(6),
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
export const objectiveGroundingStatusValues = [
  "supported",
  "unsupported",
] as const;
export const objectiveGroundingStatusSchema = z.enum(
  objectiveGroundingStatusValues,
);
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
    model: togetherModelDefaults.llm,
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
    model: togetherModelDefaults.llm,
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
export const outlineGenerationStateSchema = z.enum(
  outlineGenerationStateValues,
);
export type OutlineGenerationState = z.infer<
  typeof outlineGenerationStateSchema
>;

export const outlineDurationStatusValues = ["under", "over", "within"] as const;
export const outlineDurationStatusSchema = z.enum(outlineDurationStatusValues);
export type OutlineDurationStatus = z.infer<typeof outlineDurationStatusSchema>;

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

// ---------------------------------------------------------------------------
// ST-048 — Generate grounded spoken narration by outline section
// ---------------------------------------------------------------------------

/** Maximum sentence length a narration block may contain. */
export const narrationBlockMaximumSentences = 40 as const;

/** Deterministic sentence-length ceiling for age-appropriate narration. */
export const narrationSentenceMaximumWords = 40 as const;

/**
 * Minimum contiguous word run shared verbatim between a narration sentence and
 * a source block that counts as a long copied passage.
 */
export const narrationCopiedPassageMinimumRun = 8 as const;

/**
 * One model-proposed spoken sentence (or claim group). A sentence either cites
 * at least one source block ID or is labelled as an AI-generated addition;
 * never both. Application code resolves block IDs into SourceRefs.
 */
export const narrationSentenceOutputSchema = z
  .object({
    text: boundedText(1_000),
    sourceBlockIds: z.array(identifierSchema).max(100),
    generatedAddition: z
      .object({
        kind: z.enum(["analogy", "example", "illustration", "clarification"]),
        rationale: boundedText(500),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.sourceBlockIds.length === 0 &&
      value.generatedAddition === undefined
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["root"],
        message:
          "Every narration sentence must cite source blocks or be labelled as a generated addition.",
      });
    if (
      value.sourceBlockIds.length > 0 &&
      value.generatedAddition !== undefined
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["generatedAddition"],
        message: "A generated-addition sentence must not cite source blocks.",
      });
  });
export type NarrationSentenceOutput = z.infer<
  typeof narrationSentenceOutputSchema
>;

/** One outline item's narration: ordered spoken sentences with grounding. */
export const narrationBlockOutputSchema = z
  .object({
    outlineItemId: identifierSchema,
    sentences: z
      .array(narrationSentenceOutputSchema)
      .min(1)
      .max(narrationBlockMaximumSentences),
  })
  .strict();
export type NarrationBlockOutput = z.infer<typeof narrationBlockOutputSchema>;

/**
 * The versioned structured output the model must produce for one narration
 * generation. Blocks are divided by approved outline item; the application
 * assigns stable IDs, order, word counts, and resolved SourceRefs.
 */
export const narrationOutputV1Schema = z
  .object({
    schemaVersion: z.literal("narration-v1"),
    targetDurationSeconds: targetDurationSecondsSchema,
    blocks: z.array(narrationBlockOutputSchema).min(1).max(20),
  })
  .strict();
export type NarrationOutputV1 = z.infer<typeof narrationOutputV1Schema>;

export const narrationSetStatusValues = [
  "draft",
  "approved",
  "superseded",
] as const;
export const narrationSetStatusSchema = z.enum(narrationSetStatusValues);
export type NarrationSetStatus = z.infer<typeof narrationSetStatusSchema>;

/**
 * Persisted narration block within a narration set. `text` is the joined
 * sentence text; `estimatedWords` is the deterministic word count; `sourceRefs`
 * and `generatedAdditions` mirror the sentence grounding and AI additions.
 */
export const lessonNarrationBlockSchema = z
  .object({
    id: identifierSchema,
    outlineItemId: identifierSchema,
    order: z.number().int().positive(),
    text: boundedText(10_000),
    estimatedWords: z.number().int().positive(),
    targetSeconds: z.number().int().positive(),
    sourceRefs: z.array(sourceRefSchema).max(20),
    generatedAdditions: z.array(generatedAdditionSchema).max(20),
    generated: z.boolean(),
    revision: z.number().int().nonnegative(),
    contentHash: z
      .string()
      .regex(sha256HexPattern, "Expected a hexadecimal SHA-256 checksum.")
      .transform((value) => value.toLowerCase()),
  })
  .strict();
export type LessonNarrationBlock = z.infer<typeof lessonNarrationBlockSchema>;

/**
 * Immutable draft narration set produced by one narration generation. Editing
 * and approval (ST-049) create revisions rather than mutating generated
 * blocks. The approved outline-set content hash binds the narration to the
 * exact approved outline it narrates.
 */
export const lessonNarrationSetSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: identifierSchema,
    projectId: identifierSchema,
    sourceSnapshotId: identifierSchema,
    sourceSnapshotContentHash: z
      .string()
      .regex(sha256HexPattern, "Expected a hexadecimal SHA-256 checksum.")
      .transform((value) => value.toLowerCase()),
    outlineSetId: identifierSchema,
    outlineSetContentHash: z
      .string()
      .regex(sha256HexPattern, "Expected a hexadecimal SHA-256 checksum.")
      .transform((value) => value.toLowerCase()),
    configurationVersion: z.number().int().positive(),
    promptId: z.string().trim().min(1).max(100),
    promptVersion: z.string().trim().min(1).max(50),
    model: z.string().trim().min(1).max(200),
    modelCallId: identifierSchema,
    status: narrationSetStatusSchema,
    revision: z.number().int().nonnegative(),
    blocks: z.array(lessonNarrationBlockSchema).max(20),
    totalEstimatedSeconds: z.number().int().positive(),
    contentHash: z
      .string()
      .regex(sha256HexPattern, "Expected a hexadecimal SHA-256 checksum.")
      .transform((value) => value.toLowerCase()),
    generatedAt: z.string().datetime({ offset: true }),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type LessonNarrationSet = z.infer<typeof lessonNarrationSetSchema>;

/**
 * Bounded configuration-derived parameters for one narration generation. The
 * approved outline-set identity (not its content) travels here; the pipeline
 * worker loads the approved set from the database so the model prompt and the
 * deterministic coverage check always use the exact approved revision.
 */
export const narrationGenerationParamsSchema = z
  .object({
    configurationVersion: z.number().int().positive(),
    lessonTitle: boundedText(200),
    subject: boundedText(200),
    ageBand: lessonAgeBandSchema,
    difficulty: lessonDifficultySchema,
    tone: lessonToneSchema,
    targetDurationSeconds: targetDurationSecondsSchema,
    includeRecallQuestions: z.boolean(),
    outlineSetId: identifierSchema,
    outlineSetRevision: z.number().int().nonnegative(),
  })
  .strict();
export type NarrationGenerationParams = z.infer<
  typeof narrationGenerationParamsSchema
>;

/** The prompt/model the API uses for narration generation right now. */
export const narrationGenerationCompatibilitySchema = z
  .object({
    promptId: z.string().trim().min(1).max(100),
    promptVersion: z.string().trim().min(1).max(50),
    model: z.string().trim().min(1).max(200),
  })
  .strict();
export type NarrationGenerationCompatibility = z.infer<
  typeof narrationGenerationCompatibilitySchema
>;
export const currentNarrationGenerationCompatibility =
  narrationGenerationCompatibilitySchema.parse({
    promptId: "narration",
    promptVersion: "v2",
    model: togetherModelDefaults.llm,
  });

/** Latest narration generation job surfaced for the review route. */
export const narrationGenerationJobStatusSchema = z
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
export type NarrationGenerationJobStatus = z.infer<
  typeof narrationGenerationJobStatusSchema
>;

export const narrationGenerationResponseSchema = z
  .object({
    jobId: identifierSchema,
    status: z.literal("queued"),
  })
  .strict();
export type NarrationGenerationResponse = z.infer<
  typeof narrationGenerationResponseSchema
>;

/** Narration review route state derived from the latest set and job. */
export const narrationGenerationStateValues = [
  "idle",
  "generating",
  "draft",
  "failed",
  "approved",
] as const;
export const narrationGenerationStateSchema = z.enum(
  narrationGenerationStateValues,
);
export type NarrationGenerationState = z.infer<
  typeof narrationGenerationStateSchema
>;

export const narrationBudgetStatusValues = ["under", "over", "within"] as const;
export const narrationBudgetStatusSchema = z.enum(narrationBudgetStatusValues);
export type NarrationBudgetStatus = z.infer<typeof narrationBudgetStatusSchema>;

/**
 * ST-048 validation surfaced for the narration review route. `structurallyValid`
 * blocks approval for an empty set or a block without grounding (each sentence
 * must cite source or be a generated addition). `uncoveredOutlineItemIds` lists
 * approved outline items with no narration block, which also blocks approval.
 * Duration and word-count statuses are informational and do not block approval.
 */
export const narrationValidationSchema = z
  .object({
    structurallyValid: z.boolean(),
    durationStatus: narrationBudgetStatusSchema,
    durationWarning: z.string().max(500).nullable(),
    wordCountStatus: narrationBudgetStatusSchema,
    wordCountWarning: z.string().max(500).nullable(),
    uncoveredOutlineItemIds: z.array(identifierSchema),
  })
  .strict();
export type NarrationValidation = z.infer<typeof narrationValidationSchema>;

/** `GET /projects/:id/narration` response. */
export const narrationResponseSchema = z
  .object({
    state: narrationGenerationStateSchema,
    set: lessonNarrationSetSchema.nullable(),
    approved: lessonNarrationSetSchema.nullable(),
    latestJob: narrationGenerationJobStatusSchema.nullable(),
    latestTransformJob: narrationGenerationJobStatusSchema.nullable(),
    canGenerate: z.boolean(),
    canApprove: z.boolean(),
    canEdit: z.boolean(),
    stale: z.boolean(),
    staleReason: z.string().max(500).nullable(),
    candidates: z.array(z.lazy(() => narrationBlockCandidateSchema)).max(100),
    validation: narrationValidationSchema,
  })
  .strict();
export type NarrationResponse = z.infer<typeof narrationResponseSchema>;

/** Boundary for approving the current draft narration set. */
export const narrationApproveInputSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export type NarrationApproveInput = z.infer<typeof narrationApproveInputSchema>;

// ---------------------------------------------------------------------------
// ST-049 — Edit or regenerate individual narration blocks with dependency
// invalidation
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ST-049 — Edit or regenerate individual narration blocks with dependency
// invalidation
// ---------------------------------------------------------------------------

/**
 * Deterministic content hashes for narration blocks and sets live in
 * `@avlp/config` (server-only). Schemas validate the hash format and expose
 * the bounded editor/revision/candidate contracts below; derived-artifact
 * staleness is detected by comparing stored content hashes.
 */

/** The four bounded block-transformation modes a teacher can request. */
export const narrationTransformModeValues = [
  "shorten",
  "simplify",
  "expand",
  "regenerate",
] as const;
export const narrationTransformModeSchema = z.enum(
  narrationTransformModeValues,
);
export type NarrationTransformMode = z.infer<
  typeof narrationTransformModeSchema
>;

/** Maximum pending block-transform candidates retained per narration block. */
export const narrationBlockMaximumActiveCandidates = 5 as const;

export const narrationCandidateStatusValues = [
  "pending",
  "accepted",
  "rejected",
] as const;
export const narrationCandidateStatusSchema = z.enum(
  narrationCandidateStatusValues,
);
export type NarrationCandidateStatus = z.infer<
  typeof narrationCandidateStatusSchema
>;

export const narrationBlockRevisionOriginValues = [
  "generated",
  "teacher_edit",
  "transform",
  "restore",
] as const;
export const narrationBlockRevisionOriginSchema = z.enum(
  narrationBlockRevisionOriginValues,
);
export type NarrationBlockRevisionOrigin = z.infer<
  typeof narrationBlockRevisionOriginSchema
>;

/** Boundary for the teacher editing one narration block directly. */
export const narrationBlockUpdateInputSchema = z
  .object({
    text: boundedText(10_000),
    sourceBlockIds: z.array(identifierSchema).max(100).optional(),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export type NarrationBlockUpdateInput = z.infer<
  typeof narrationBlockUpdateInputSchema
>;

/**
 * Boundary for requesting a one-block regeneration. `instruction` is an
 * optional teacher direction; `expectedRevision` is the narration-set revision
 * the request is based on and must still be current when the job runs.
 */
export const narrationBlockTransformInputSchema = z
  .object({
    mode: narrationTransformModeSchema,
    instruction: boundedText(500).optional(),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export type NarrationBlockTransformInput = z.infer<
  typeof narrationBlockTransformInputSchema
>;

/** `POST /projects/:id/narration-blocks/:blockId/regenerate` response. */
export const narrationTransformResponseSchema = z
  .object({
    jobId: identifierSchema,
    status: z.literal("queued"),
  })
  .strict();
export type NarrationTransformResponse = z.infer<
  typeof narrationTransformResponseSchema
>;

/** Boundary for accepting or rejecting one generated block candidate. */
export const narrationCandidateDecisionInputSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export type NarrationCandidateDecisionInput = z.infer<
  typeof narrationCandidateDecisionInputSchema
>;

/** Boundary for restoring a previous narration block revision. */
export const narrationBlockRestoreInputSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export type NarrationBlockRestoreInput = z.infer<
  typeof narrationBlockRestoreInputSchema
>;

/**
 * One generated block candidate from a transform job. The teacher accepts or
 * rejects it; accepting applies the candidate as a new block revision and
 * invalidates dependent artifacts.
 */
export const narrationBlockCandidateSchema = z
  .object({
    id: identifierSchema,
    blockId: identifierSchema,
    mode: narrationTransformModeSchema,
    text: boundedText(10_000),
    estimatedWords: z.number().int().positive(),
    sourceRefs: z.array(sourceRefSchema).max(20),
    generatedAdditions: z.array(generatedAdditionSchema).max(20),
    status: narrationCandidateStatusSchema,
    blockRevision: z.number().int().nonnegative(),
    modelCallId: identifierSchema,
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type NarrationBlockCandidate = z.infer<
  typeof narrationBlockCandidateSchema
>;

/**
 * One archived narration block revision used for rollback. Every mutation
 * archives the previous current revision before advancing the block.
 */
export const narrationBlockRevisionSchema = z
  .object({
    id: identifierSchema,
    blockId: identifierSchema,
    revision: z.number().int().nonnegative(),
    text: boundedText(10_000),
    estimatedWords: z.number().int().positive(),
    sourceRefs: z.array(sourceRefSchema).max(20),
    generatedAdditions: z.array(generatedAdditionSchema).max(20),
    origin: narrationBlockRevisionOriginSchema,
    modelCallId: identifierSchema.nullable(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type NarrationBlockRevision = z.infer<
  typeof narrationBlockRevisionSchema
>;

/** `GET /projects/:id/narration/blocks/:blockId/revisions` response. */
export const narrationBlockRevisionsResponseSchema = z
  .object({
    revisions: z.array(narrationBlockRevisionSchema).max(100),
  })
  .strict();
export type NarrationBlockRevisionsResponse = z.infer<
  typeof narrationBlockRevisionsResponseSchema
>;

/**
 * Bounded parameters for one narration block transform. The job loads the
 * narration set, its block, the neighboring blocks, and the approved outline
 * from the database so the prompt and the deterministic checks always use the
 * exact approved revisions.
 */
export const narrationTransformParamsSchema = z
  .object({
    narrationSetId: identifierSchema,
    narrationSetRevision: z.number().int().nonnegative(),
    blockId: identifierSchema,
    outlineItemId: identifierSchema,
    mode: narrationTransformModeSchema,
    instruction: boundedText(500).nullable(),
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
export type NarrationTransformParams = z.infer<
  typeof narrationTransformParamsSchema
>;

/**
 * The versioned structured output a transform job must produce: exactly one
 * block for the selected outline item, in the requested mode.
 */
export const narrationBlockTransformOutputSchema = z
  .object({
    schemaVersion: z.literal("narration-block-v1"),
    mode: narrationTransformModeSchema,
    block: narrationBlockOutputSchema,
  })
  .strict();
export type NarrationBlockTransformOutput = z.infer<
  typeof narrationBlockTransformOutputSchema
>;

/**
 * The versioned structured output a grounding check job must produce for one claim.
 * The model evaluates whether the claim is supported by the cited source blocks.
 */
export const groundingClaimOutputSchema = z
  .object({
    schemaVersion: z.literal("grounding-claim-v1"),
    claimId: identifierSchema,
    status: groundingStatusSchema,
    supportedSpans: z
      .array(
        z
          .object({
            start: z.number().int().nonnegative(),
            end: z.number().int().positive(),
            sourceBlockId: identifierSchema,
          })
          .refine((span) => span.start < span.end, {
            message: "A supported span start must be less than its end.",
          }),
      )
      .max(50),
    unsupportedSpans: z
      .array(
        z
          .object({
            start: z.number().int().nonnegative(),
            end: z.number().int().positive(),
            reason: boundedText(500),
          })
          .refine((span) => span.start < span.end, {
            message: "An unsupported span start must be less than its end.",
          }),
      )
      .max(50),
  })
  .strict();
export type GroundingClaimOutput = z.infer<typeof groundingClaimOutputSchema>;

/**
 * The versioned structured output a grounding check job must produce: an array of claim results.
 */
export const groundingOutputSchema = z
  .object({
    schemaVersion: z.literal("grounding-v1"),
    results: z.array(groundingClaimOutputSchema).max(500),
  })
  .strict();
export type GroundingOutput = z.infer<typeof groundingOutputSchema>;

/** The prompt/model the API uses for one-block narration transforms now. */
export const narrationTransformCompatibilitySchema = z
  .object({
    promptId: z.string().trim().min(1).max(100),
    promptVersion: z.string().trim().min(1).max(50),
    model: z.string().trim().min(1).max(200),
  })
  .strict();
export type NarrationTransformCompatibility = z.infer<
  typeof narrationTransformCompatibilitySchema
>;
export const currentNarrationTransformCompatibility =
  narrationTransformCompatibilitySchema.parse({
    promptId: "narration-block",
    promptVersion: "v1",
    model: togetherModelDefaults.llm,
  });

/** The prompt/model the API uses for grounding checks now. */
export const groundingCompatibilitySchema = z
  .object({
    promptId: z.string().trim().min(1).max(100),
    promptVersion: z.string().trim().min(1).max(50),
    model: z.string().trim().min(1).max(200),
  })
  .strict();
export type GroundingCompatibility = z.infer<
  typeof groundingCompatibilitySchema
>;
export const currentGroundingCompatibility = groundingCompatibilitySchema.parse(
  {
    promptId: "grounding",
    promptVersion: "v2",
    model: togetherModelDefaults.llm,
  },
);

// ---------------------------------------------------------------------------
// ST-050 — Generate a valid LessonSpec storyboard from approved narration
// ---------------------------------------------------------------------------

/** Minimum/maximum number of scenes the model may propose for one lesson. */
export const storyboardSceneCountMinimum = 3 as const;
export const storyboardSceneCountMaximum = 50 as const;

/** Per-scene duration bounds used by the deterministic duration allocator. */
export const storyboardSceneMinimumSeconds = 3 as const;
export const storyboardSceneMaximumSeconds = 60 as const;

/**
 * The fewest outline items a lesson target can be told in. Each outline item
 * becomes exactly one narration block, every narration block belongs to
 * exactly one scene, and a scene lasts at most `storyboardSceneMaximumSeconds`
 * — so an outline with fewer items than this can never be storyboarded, no
 * matter what the storyboard model proposes.
 */
export function minimumOutlineItemsForTarget(target: number): number {
  return Math.ceil(target / storyboardSceneMaximumSeconds);
}

/** Maximum planned asset requirements the model may attach to one scene. */
export const storyboardSceneMaximumAssetRequirements = 10 as const;

/** Duration-sum tolerance relative to the configured target duration. */
export const storyboardDurationToleranceRatio = 0.05 as const;

/**
 * Absolute scene-duration sum tolerance for a target. The allocator always
 * produces an exact sum; the tolerance exists so review-route validation can
 * report near-miss drafts without blocking them.
 */
export function storyboardDurationToleranceSeconds(target: number): number {
  return Math.max(10, Math.round(target * storyboardDurationToleranceRatio));
}

/**
 * One planned asset slot the storyboard requires but cannot resolve yet.
 * Missing assets become requirements, never invented public URLs or fake
 * asset bindings; the asset catalog (ST-057/058) resolves them later.
 */
export const storyboardAssetRequirementSchema = z
  .object({
    slot: boundedText(64),
    purpose: boundedText(300),
  })
  .strict();
export type StoryboardAssetRequirement = z.infer<
  typeof storyboardAssetRequirementSchema
>;

/** One entry of the ten-template catalog the model must choose from. */
export const storyboardTemplateCatalogEntrySchema = z
  .object({
    template: sceneTemplateSchema,
    purpose: boundedText(500),
    assetSlots: z.array(boundedText(64)).max(20),
    itemLimits: z.record(z.string().max(100), z.number().int().positive()),
    textLimits: z.record(z.string().max(100), z.number().int().positive()),
    guidance: boundedText(1_000),
  })
  .strict();
export type StoryboardTemplateCatalogEntry = z.infer<
  typeof storyboardTemplateCatalogEntrySchema
>;

/**
 * The versioned ten-template catalog given to the storyboard planner. Field
 * limits are product constraints mirrored from the scene contract; the model
 * must pick a template and fill only its fields, never coordinates or code.
 */
export const storyboardTemplateCatalog: readonly StoryboardTemplateCatalogEntry[] =
  [
    {
      template: "hook",
      purpose:
        "Open the lesson with a question that frames the topic before the first explanation.",
      assetSlots: ["subject"],
      itemLimits: { "visual.supportingElements": 3 },
      textLimits: {
        "visual.question": 80,
        "visual.prompt": 48,
        onScreenText: 300,
      },
      guidance:
        "Keep the question under 80 characters. A prompt and up to 3 very short supporting elements are optional.",
    },
    {
      template: "definition",
      purpose:
        "Define one key term with a concise explanation and optional example.",
      assetSlots: ["visual-example"],
      itemLimits: {},
      textLimits: {
        "visual.term": 80,
        "visual.definition": 120,
        "visual.exampleLabel": 48,
        "visual.exampleText": 48,
      },
      guidance:
        "exampleLabel and exampleText must be provided together or omitted together.",
    },
    {
      template: "process",
      purpose: "Show a linear sequence of 2 to 6 steps.",
      assetSlots: [
        "step-1-icon",
        "step-2-icon",
        "step-3-icon",
        "step-4-icon",
        "step-5-icon",
        "step-6-icon",
      ],
      itemLimits: { "visual.steps": 6 },
      textLimits: { "visual.steps": 80 },
      guidance: "Keep each step to one short phrase.",
    },
    {
      template: "input-process-output",
      purpose:
        "Illustrate how inputs are transformed into outputs by one process.",
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
      textLimits: {
        "visual.inputs.label": 80,
        "visual.process.label": 80,
        "visual.outputs.label": 80,
      },
      guidance: "One process item with at least one input and one output.",
    },
    {
      template: "comparison",
      purpose: "Compare two subjects through shared and differing features.",
      assetSlots: ["left-subject-image", "right-subject-image"],
      itemLimits: { "visual.similarities": 4, "visual.differences": 4 },
      textLimits: {
        "visual.leftSubject.label": 80,
        "visual.rightSubject.label": 80,
        "visual.similarities": 80,
        "visual.differences": 80,
      },
      guidance: "Use short phrases for similarities and differences.",
    },
    {
      template: "cause-effect",
      purpose:
        "Explain why something happens using causes, a mechanism, and effects.",
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
      textLimits: {
        "visual.causes.label": 80,
        "visual.mechanism.label": 80,
        "visual.effects.label": 80,
      },
      guidance:
        "Node IDs must be unique lowercase slugs such as cause-1. Connections must form the complete cause-to-mechanism-to-effect chain.",
    },
    {
      template: "labelled-diagram",
      purpose:
        "Label parts of a shape-based diagram (cell, cycle, plant, or system).",
      assetSlots: ["diagram"],
      itemLimits: { "visual.labels": 6 },
      textLimits: { "visual.labels.text": 80 },
      guidance:
        "At storyboard time choose kind 'shapes' with an approved shape (cell, cycle, plant, system). Asset diagrams need an approved diagram that is not available yet.",
    },
    {
      template: "analogy",
      purpose:
        "Map a familiar system onto the source concept to aid understanding.",
      assetSlots: ["central-visual"],
      itemLimits: { "visual.mappings": 4 },
      textLimits: {
        "visual.sourceConcept": 80,
        "visual.familiarSystem": 80,
        "visual.mappings.concept": 60,
        "visual.mappings.analogy": 60,
      },
      guidance:
        "Each mapping must use distinct concept and familiar-system terms.",
    },
    {
      template: "worked-example",
      purpose: "Work through a problem step by step with a final answer.",
      assetSlots: [],
      itemLimits: { "visual.steps": 12 },
      textLimits: {
        "visual.problem": 1000,
        "visual.steps": 300,
        "visual.answer": 1000,
      },
      guidance: "Steps are strings; order them from first to last.",
    },
    {
      template: "summary",
      purpose:
        "Close the lesson with key takeaways and an optional call to action.",
      assetSlots: [],
      itemLimits: { "visual.takeaways.text": 4 },
      textLimits: {
        "visual.takeaways.text": 140,
        "visual.centralModel": 140,
        "visual.callToAction": 120,
      },
      guidance:
        "Prefer a centralModel text summary. A central asset slot requires an approved illustration that is not available yet.",
    },
  ];

const storyboardSceneOutputBase = {
  narrationBlockIds: z.array(identifierSchema).min(1).max(100),
  onScreenText: z.array(boundedText(300)).max(12),
  estimatedSeconds: z
    .number()
    .int()
    .min(storyboardSceneMinimumSeconds)
    .max(storyboardSceneMaximumSeconds),
  transition: z.enum(["cut", "fade", "slide"]),
  sourceBlockIds: z.array(identifierSchema).min(1).max(100),
  generatedAdditions: z.array(generatedAdditionSchema).max(20),
  assetRequirements: z
    .array(storyboardAssetRequirementSchema)
    .max(storyboardSceneMaximumAssetRequirements),
  title: boundedText(160).optional(),
} as const;

/**
 * One model-proposed scene. The model chooses the template, narration-block
 * assignment, visual data, on-screen text, estimated duration, transition,
 * source citations, and planned asset requirements; application code assigns
 * stable IDs, order, resolved SourceRefs, and allocated durations. The
 * narration text itself is derived from the assigned approved narration
 * blocks so the model can never invent spoken content. Every scene must cite
 * at least one source block (resolved into the scene's canonical `sourceRefs`
 * at persistence); generated additions are optional labels for content that is
 * not in the source, never a substitute for citations.
 */
export const storyboardSceneOutputSchema = z.discriminatedUnion("template", [
  z
    .object({
      ...storyboardSceneOutputBase,
      template: z.literal("hook"),
      visual: hookVisualSchema,
    })
    .strict(),
  z
    .object({
      ...storyboardSceneOutputBase,
      template: z.literal("definition"),
      visual: definitionVisualSchema,
    })
    .strict(),
  z
    .object({
      ...storyboardSceneOutputBase,
      template: z.literal("process"),
      visual: processVisualSchema,
    })
    .strict(),
  z
    .object({
      ...storyboardSceneOutputBase,
      template: z.literal("input-process-output"),
      visual: ipoVisualSchema,
    })
    .strict(),
  z
    .object({
      ...storyboardSceneOutputBase,
      template: z.literal("comparison"),
      visual: comparisonVisualSchema,
    })
    .strict(),
  z
    .object({
      ...storyboardSceneOutputBase,
      template: z.literal("cause-effect"),
      visual: causeEffectVisualSchema,
    })
    .strict(),
  z
    .object({
      ...storyboardSceneOutputBase,
      template: z.literal("labelled-diagram"),
      visual: diagramVisualSchema,
    })
    .strict(),
  z
    .object({
      ...storyboardSceneOutputBase,
      template: z.literal("analogy"),
      visual: analogyVisualSchema,
    })
    .strict(),
  z
    .object({
      ...storyboardSceneOutputBase,
      template: z.literal("worked-example"),
      visual: workedExampleVisualSchema,
    })
    .strict(),
  z
    .object({
      ...storyboardSceneOutputBase,
      template: z.literal("summary"),
      visual: summaryVisualSchema,
    })
    .strict(),
]);
export type StoryboardSceneOutput = z.infer<typeof storyboardSceneOutputSchema>;

/**
 * The versioned structured output the model must produce for one storyboard
 * generation. Scenes are ordered; the concatenation of their narration-block
 * assignments must equal the approved narration's ordered block list exactly.
 * Every scene must cite at least one source block and the model-proposed
 * duration total must stay within the target tolerance.
 */
export const storyboardOutputV1Schema = z
  .object({
    schemaVersion: z.literal("storyboard-v1"),
    targetDurationSeconds: targetDurationSecondsSchema,
    scenes: z
      .array(storyboardSceneOutputSchema)
      .min(storyboardSceneCountMinimum)
      .max(storyboardSceneCountMaximum),
  })
  .strict()
  .superRefine((value, context) => {
    const proposedTotal = value.scenes.reduce(
      (sum, scene) => sum + scene.estimatedSeconds,
      0,
    );
    const tolerance = storyboardDurationToleranceSeconds(
      value.targetDurationSeconds,
    );
    if (Math.abs(proposedTotal - value.targetDurationSeconds) > tolerance)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scenes"],
        message: `Scene durations total ${proposedTotal}s, outside the ${tolerance}s tolerance of the ${value.targetDurationSeconds}s target.`,
      });
  });
export type StoryboardOutputV1 = z.infer<typeof storyboardOutputV1Schema>;

export const lessonSpecStatusValues = [
  "draft",
  "approved",
  "superseded",
] as const;
export const lessonSpecStatusSchema = z.enum(lessonSpecStatusValues);
export type LessonSpecStatus = z.infer<typeof lessonSpecStatusSchema>;

/**
 * One persisted storyboard scene. `scene` is a fully valid `SceneSpec` (the
 * LessonSpec scene contract); `narrationBlockIds` records which approved
 * narration blocks the scene covers, and `assetRequirements` the planned asset
 * slots that are not yet resolved to real bindings.
 */
export const lessonStoryboardSceneSchema = z
  .object({
    id: identifierSchema,
    stableSceneId: identifierSchema,
    order: z.number().int().positive(),
    template: sceneTemplateSchema,
    durationSeconds: z
      .number()
      .int()
      .min(storyboardSceneMinimumSeconds)
      .max(storyboardSceneMaximumSeconds),
    narrationBlockIds: z.array(identifierSchema).max(100),
    assetRequirements: z
      .array(storyboardAssetRequirementSchema)
      .max(storyboardSceneMaximumAssetRequirements),
    scene: sceneSpecSchema,
  })
  .strict();
export type LessonStoryboardScene = z.infer<typeof lessonStoryboardSceneSchema>;

/**
 * The persisted storyboard draft produced by one storyboard generation. The
 * payload is the ordered scene collection with every scene validated against
 * the LessonSpec scene contract; top-level objective links, configuration,
 * narration/outline binding hashes, and generation metadata make the draft
 * traceable and stale when any input revision changes.
 */
export const lessonStoryboardSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: identifierSchema,
    projectId: identifierSchema,
    basedOnNarrationSetId: identifierSchema,
    narrationSetContentHash: z
      .string()
      .regex(sha256HexPattern, "Expected a hexadecimal SHA-256 checksum.")
      .transform((value) => value.toLowerCase()),
    outlineSetId: identifierSchema,
    outlineSetContentHash: z
      .string()
      .regex(sha256HexPattern, "Expected a hexadecimal SHA-256 checksum.")
      .transform((value) => value.toLowerCase()),
    configurationVersion: z.number().int().positive(),
    promptId: z.string().trim().min(1).max(100),
    promptVersion: z.string().trim().min(1).max(50),
    model: z.string().trim().min(1).max(200),
    modelCallId: identifierSchema,
    status: lessonSpecStatusSchema,
    revision: z.number().int().nonnegative(),
    title: boundedText(200),
    subject: boundedText(200),
    targetDurationSeconds: targetDurationSecondsSchema,
    totalDurationSeconds: z.number().int().positive(),
    objectiveIds: z.array(identifierSchema).min(1).max(50),
    contentHash: z
      .string()
      .regex(sha256HexPattern, "Expected a hexadecimal SHA-256 checksum.")
      .transform((value) => value.toLowerCase()),
    scenes: z.array(lessonStoryboardSceneSchema).min(1).max(100),
    generatedAt: z.string().datetime({ offset: true }),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((value, context) => {
    const seenSceneIds = new Set<string>();
    const seenOrders = new Set<number>();
    for (const [index, scene] of value.scenes.entries()) {
      if (seenSceneIds.has(scene.id))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["scenes", index, "id"],
          message: "Storyboard scene ids must be unique.",
        });
      if (seenOrders.has(scene.order))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["scenes", index, "order"],
          message: "Storyboard scene order values must be unique.",
        });
      seenSceneIds.add(scene.id);
      seenOrders.add(scene.order);
    }
    const total = value.scenes.reduce(
      (sum, scene) => sum + scene.durationSeconds,
      0,
    );
    if (total !== value.totalDurationSeconds)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalDurationSeconds"],
        message:
          "totalDurationSeconds must equal the sum of the scene durations.",
      });
  });
export type LessonStoryboard = z.infer<typeof lessonStoryboardSchema>;

// ---------------------------------------------------------------------------
// ST-068 — immutable production-render lifecycle
// ---------------------------------------------------------------------------

export const renderStatusSchema = z.enum([
  "queued",
  "rendering",
  "completed",
  "failed",
  "cancelled",
]);
export type RenderStatus = z.infer<typeof renderStatusSchema>;

export const renderErrorCodeSchema = z.enum([
  "VALIDATION_STALE",
  "VALIDATION_BLOCKED",
  "RENDER_TIMEOUT",
  "RENDER_WORKER_UNAVAILABLE",
  "ASSET_MISSING",
  "ASSET_CHECKSUM_MISMATCH",
  "OUTPUT_UNREADABLE",
  "OUTPUT_PROFILE_INVALID",
  "RENDER_STORAGE_FAILED",
  "RENDER_FAILED",
  "RENDER_CANCELLED",
]);
export type RenderErrorCode = z.infer<typeof renderErrorCodeSchema>;

export const renderRequestSchema = z
  .object({
    lessonVersionId: identifierSchema,
    /** An optional client token distinguishes an intentional new render profile. */
    idempotencyKey: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export type RenderRequest = z.infer<typeof renderRequestSchema>;

export const renderedVideoSchema = z
  .object({
    id: identifierSchema,
    durationMs: z.number().int().positive(),
    sizeBytes: z.number().int().positive(),
    width: z.literal(1920),
    height: z.literal(1080),
    fps: z.literal(30),
    videoCodec: z.literal("h264"),
    audioCodec: z.literal("aac"),
    storageKey: z.string().min(1).max(1_000),
    thumbnailStorageKey: z.string().min(1).max(1_000).nullable(),
    thumbnailUrl: z.string().url().nullable(),
  })
  .strict();
export type RenderedVideo = z.infer<typeof renderedVideoSchema>;

export const renderStatusResponseSchema = z
  .object({
    id: identifierSchema,
    lessonVersionId: identifierSchema,
    validationRunId: identifierSchema,
    status: renderStatusSchema,
    progress: z.number().min(0).max(1),
    attempt: z.number().int().nonnegative(),
    errorCode: renderErrorCodeSchema.nullable(),
    errorMessage: z.string().min(1).max(500).nullable(),
    retryable: z.boolean(),
    correlationId: identifierSchema,
    createdAt: z.string().datetime({ offset: true }),
    startedAt: z.string().datetime({ offset: true }).nullable(),
    completedAt: z.string().datetime({ offset: true }).nullable(),
    video: renderedVideoSchema.nullable(),
  })
  .strict();
export type RenderStatusResponse = z.infer<typeof renderStatusResponseSchema>;

// ---------------------------------------------------------------------------
// ST-069 — version-bound downloads and supporting-file exports
// ---------------------------------------------------------------------------

export const exportTypeSchema = z.enum(["captions", "narration", "storyboard"]);
export type ExportType = z.infer<typeof exportTypeSchema>;
export const exportFormatSchema = z.enum([
  "srt",
  "vtt",
  "text",
  "markdown",
  "json",
]);
export type ExportFormat = z.infer<typeof exportFormatSchema>;
export const captionExportFormatSchema = z.enum(["srt", "vtt"]);
export const narrationExportFormatSchema = z.enum(["text", "markdown"]);
export const storyboardExportFormatSchema = z.enum(["markdown", "json"]);
/** Safe export projection; deliberately excludes source, storage, and editor data. */
export const versionExportManifestSchema = z
  .object({
    lessonVersionId: identifierSchema,
    title: boundedText(200),
    subject: boundedText(200),
    narration: z
      .array(
        z
          .object({
            order: z.number().int().positive(),
            text: boundedText(10_000),
          })
          .strict(),
      )
      .min(1)
      .max(1_000),
    scenes: z
      .array(
        z
          .object({
            number: z.number().int().positive(),
            template: sceneTemplateSchema,
            durationSeconds: z.number().int().positive(),
            narration: boundedText(10_000),
            onScreenText: z.array(boundedText(10_000)).max(50),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export type VersionExportManifest = z.infer<typeof versionExportManifestSchema>;
export const signedDownloadResponseSchema = z
  .object({
    url: z.string().url(),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type SignedDownloadResponse = z.infer<
  typeof signedDownloadResponseSchema
>;

// ---------------------------------------------------------------------------
// ST-070 — revocable public playback capabilities
// ---------------------------------------------------------------------------

export const shareLinkStatusSchema = z.enum(["active", "revoked"]);
export type ShareLinkStatus = z.infer<typeof shareLinkStatusSchema>;
export const createShareLinkInputSchema = z
  .object({
    renderId: identifierSchema,
    expiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export type CreateShareLinkInput = z.infer<typeof createShareLinkInputSchema>;
export const shareLinkSchema = z
  .object({
    id: identifierSchema,
    lessonVersionId: identifierSchema,
    renderedVideoId: identifierSchema,
    status: shareLinkStatusSchema,
    expiresAt: z.string().datetime({ offset: true }).nullable(),
    revokedAt: z.string().datetime({ offset: true }).nullable(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type ShareLink = z.infer<typeof shareLinkSchema>;
export const shareLinksResponseSchema = z
  .object({ shareLinks: z.array(shareLinkSchema).max(100) })
  .strict();
export type ShareLinksResponse = z.infer<typeof shareLinksResponseSchema>;
export const shareLinkCreatedResponseSchema = z
  .object({ shareLink: shareLinkSchema, token: z.string().min(43).max(128) })
  .strict();
export type ShareLinkCreatedResponse = z.infer<
  typeof shareLinkCreatedResponseSchema
>;
/** Strictly public projection: no project, source, user, editor, or key data. */
export const publicPlaybackSchema = z
  .object({
    title: boundedText(200),
    thumbnailUrl: z.string().url().nullable(),
    playbackUrl: z.string().url(),
  })
  .strict();
export type PublicPlayback = z.infer<typeof publicPlaybackSchema>;

// ---------------------------------------------------------------------------
// ST-051 — Regenerate one storyboard scene without altering neighboring
// teacher edits
// ---------------------------------------------------------------------------

/** The four bounded scene-regeneration modes a teacher can request. */
export const sceneRegenerationModeValues = [
  "improve-visual",
  "simplify",
  "shorten",
  "regenerate",
] as const;
export const sceneRegenerationModeSchema = z.enum(sceneRegenerationModeValues);
export type SceneRegenerationMode = z.infer<typeof sceneRegenerationModeSchema>;

/** Maximum pending scene-regeneration candidates retained per scene. */
export const sceneRegenerationMaximumActiveCandidates = 5 as const;

export const sceneCandidateStatusValues = [
  "pending",
  "accepted",
  "rejected",
] as const;
export const sceneCandidateStatusSchema = z.enum(sceneCandidateStatusValues);
export type SceneCandidateStatus = z.infer<typeof sceneCandidateStatusSchema>;

/**
 * Boundary for requesting a one-scene regeneration. `instruction` is an
 * optional teacher direction; `expectedRevision` is the storyboard (lesson
 * spec) revision the request is based on and must still be current when the
 * job runs.
 */
export const sceneRegenerationInputSchema = z
  .object({
    mode: sceneRegenerationModeSchema,
    instruction: boundedText(500).optional(),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export type SceneRegenerationInput = z.infer<
  typeof sceneRegenerationInputSchema
>;

/**
 * Bounded parameters for one scene regeneration. The job loads the working
 * lesson spec, the target scene, its neighbors, and the bound narration set
 * from the database so the prompt and deterministic checks always use the
 * exact revisions.
 */
export const sceneRegenerationParamsSchema = z
  .object({
    lessonSpecId: identifierSchema,
    lessonSpecRevision: z.number().int().nonnegative(),
    sceneId: identifierSchema,
    sceneRevision: z.number().int().nonnegative(),
    mode: sceneRegenerationModeSchema,
    instruction: boundedText(500).nullable(),
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
export type SceneRegenerationParams = z.infer<
  typeof sceneRegenerationParamsSchema
>;

/**
 * The versioned structured output a scene-regeneration job must produce:
 * exactly one scene in the requested mode. The scene keeps the same narration
 * blocks; the model changes the template choice, visual data, on-screen text,
 * duration estimate, transition, citations, generated additions, and planned
 * asset requirements for that one scene only.
 */
export const sceneRegenerationOutputSchema = z
  .object({
    schemaVersion: z.literal("scene-regeneration-v1"),
    mode: sceneRegenerationModeSchema,
    scene: storyboardSceneOutputSchema,
  })
  .strict();
export type SceneRegenerationOutput = z.infer<
  typeof sceneRegenerationOutputSchema
>;

/** `POST /projects/:id/scenes/:sceneId/regenerate` response. */
export const sceneRegenerationResponseSchema = z
  .object({
    jobId: identifierSchema,
    status: z.literal("queued"),
  })
  .strict();
export type SceneRegenerationResponse = z.infer<
  typeof sceneRegenerationResponseSchema
>;

/** Boundary for applying or rejecting one generated scene candidate. */
export const sceneCandidateDecisionInputSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    expectedSceneRevision: z.number().int().nonnegative(),
  })
  .strict();
export type SceneCandidateDecisionInput = z.infer<
  typeof sceneCandidateDecisionInputSchema
>;

/**
 * One generated scene candidate from a regeneration job. The teacher compares
 * the before/after scenes and applies or rejects the candidate; applying
 * replaces only the selected scene and invalidates only its dependent
 * artifacts.
 */
export const sceneCandidateSchema = z
  .object({
    id: identifierSchema,
    sceneId: identifierSchema,
    mode: sceneRegenerationModeSchema,
    before: lessonStoryboardSceneSchema,
    after: lessonStoryboardSceneSchema,
    status: sceneCandidateStatusSchema,
    sceneRevision: z.number().int().nonnegative(),
    modelCallId: identifierSchema,
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type SceneCandidate = z.infer<typeof sceneCandidateSchema>;

/** The prompt/model the API uses for scene regeneration right now. */
export const sceneRegenerationCompatibilitySchema = z
  .object({
    promptId: z.string().trim().min(1).max(100),
    promptVersion: z.string().trim().min(1).max(50),
    model: z.string().trim().min(1).max(200),
  })
  .strict();
export type SceneRegenerationCompatibility = z.infer<
  typeof sceneRegenerationCompatibilitySchema
>;
export const currentSceneRegenerationCompatibility =
  sceneRegenerationCompatibilitySchema.parse({
    promptId: "scene-regeneration",
    promptVersion: "v2",
    model: togetherModelDefaults.llm,
  });

/**
 * Bounded configuration-derived parameters for one storyboard generation. The
 * narration-set identity (not its content) travels here; the pipeline worker
 * loads the working narration set, its blocks, and the approved outline it is
 * bound to from the database so the prompt and deterministic coverage checks
 * always use the exact revisions.
 */
export const storyboardGenerationParamsSchema = z
  .object({
    configurationVersion: z.number().int().positive(),
    lessonTitle: boundedText(200),
    subject: boundedText(200),
    ageBand: lessonAgeBandSchema,
    difficulty: lessonDifficultySchema,
    tone: lessonToneSchema,
    targetDurationSeconds: targetDurationSecondsSchema,
    includeRecallQuestions: z.boolean(),
    narrationSetId: identifierSchema,
    narrationSetRevision: z.number().int().nonnegative(),
  })
  .strict();
export type StoryboardGenerationParams = z.infer<
  typeof storyboardGenerationParamsSchema
>;

/** The prompt/model the API uses for storyboard generation right now. */
export const storyboardGenerationCompatibilitySchema = z
  .object({
    promptId: z.string().trim().min(1).max(100),
    promptVersion: z.string().trim().min(1).max(50),
    model: z.string().trim().min(1).max(200),
  })
  .strict();
export type StoryboardGenerationCompatibility = z.infer<
  typeof storyboardGenerationCompatibilitySchema
>;
export const currentStoryboardGenerationCompatibility =
  storyboardGenerationCompatibilitySchema.parse({
    promptId: "storyboard",
    promptVersion: "v2",
    model: togetherModelDefaults.llm,
  });

/** Latest storyboard generation job surfaced for the review route. */
export const storyboardGenerationJobStatusSchema = z
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
export type StoryboardGenerationJobStatus = z.infer<
  typeof storyboardGenerationJobStatusSchema
>;

export const storyboardGenerationResponseSchema = z
  .object({
    jobId: identifierSchema,
    status: z.literal("queued"),
  })
  .strict();
export type StoryboardGenerationResponse = z.infer<
  typeof storyboardGenerationResponseSchema
>;

/** Storyboard review route state derived from the latest draft and job. */
export const storyboardGenerationStateValues = [
  "idle",
  "generating",
  "draft",
  "failed",
  "approved",
] as const;
export const storyboardGenerationStateSchema = z.enum(
  storyboardGenerationStateValues,
);
export type StoryboardGenerationState = z.infer<
  typeof storyboardGenerationStateSchema
>;

/**
 * ST-050 validation surfaced for the storyboard review route. A saved draft is
 * always structurally valid with no uncovered outline items or unassigned
 * narration blocks (the job rejects invalid output before persistence);
 * `uncoveredOutlineItemIds` and `unassignedBlockIds` are empty for a saved
 * draft and list gaps only for pre-persistence diagnostics.
 */
export const storyboardValidationSchema = z
  .object({
    structurallyValid: z.boolean(),
    durationStatus: narrationBudgetStatusSchema,
    durationWarning: z.string().max(500).nullable(),
    uncoveredOutlineItemIds: z.array(identifierSchema),
    unassignedBlockIds: z.array(identifierSchema),
  })
  .strict();
export type StoryboardValidation = z.infer<typeof storyboardValidationSchema>;

/** `GET /projects/:id/storyboard` response. */
export const storyboardResponseSchema = z
  .object({
    state: storyboardGenerationStateSchema,
    storyboard: lessonStoryboardSchema.nullable(),
    approved: lessonStoryboardSchema.nullable(),
    latestJob: storyboardGenerationJobStatusSchema.nullable(),
    latestSceneRegenerationJob: storyboardGenerationJobStatusSchema.nullable(),
    sceneCandidates: z.array(sceneCandidateSchema).max(100),
    canGenerate: z.boolean(),
    canApprove: z.boolean(),
    canEdit: z.boolean(),
    stale: z.boolean(),
    staleReason: z.string().max(500).nullable(),
    validation: storyboardValidationSchema,
  })
  .strict();
export type StoryboardResponse = z.infer<typeof storyboardResponseSchema>;

/** `GET /projects/:id/preview-manifest` response. URLs are short-lived and
 * intentionally excluded from every persisted lesson contract. */
export const previewManifestSchema = z
  .object({
    assets: z
      .record(
        z
          .object({
            altText: boundedText(2_000),
            assetId: identifierSchema,
            provenance: assetProvenanceSchema.optional(),
            source: z.enum(["library", "source"]),
            src: z.string().min(1).max(4_096),
          })
          .strict(),
      )
      .default({}),
    canvas: z
      .object({
        fps: z.number().int().positive().max(120),
        height: z.number().int().positive().max(8_640),
        width: z.number().int().positive().max(8_640),
      })
      .strict(),
    storyboard: lessonStoryboardSchema,
    generatedAt: z.string().datetime({ offset: true }),
    scenes: z
      .array(
        z
          .object({
            sceneId: identifierSchema,
            audio: z
              .object({
                status: z.string().min(1).max(50),
                url: z.string().url().nullable(),
                expiresAt: z.string().datetime({ offset: true }).nullable(),
              })
              .strict(),
            captions: z
              .array(
                z
                  .object({
                    startMs: z.number().int().nonnegative(),
                    endMs: z.number().int().positive(),
                    text: boundedText(1_000),
                  })
                  .strict()
                  .superRefine((cue, context) => {
                    if (cue.endMs <= cue.startMs)
                      context.addIssue({
                        code: z.ZodIssueCode.custom,
                        path: ["endMs"],
                        message:
                          "Caption end time must be after its start time.",
                      });
                  }),
              )
              .max(1_000),
            missingAssetIds: z.array(identifierSchema).max(100),
            stale: z.boolean(),
          })
          .strict(),
      )
      .max(100),
  })
  .strict();
export type PreviewManifest = z.infer<typeof previewManifestSchema>;

// ---------------------------------------------------------------------------
// ST-054 — Storyboard scene list, selection, and navigation read model
// ---------------------------------------------------------------------------

/** Asset-readiness projection for one storyboard scene. */
export const storyboardSceneAssetStatusValues = [
  "none",
  "planned",
  "missing_required",
  "resolved",
] as const;
export const storyboardSceneAssetStatusSchema = z.enum(
  storyboardSceneAssetStatusValues,
);
export type StoryboardSceneAssetStatus = z.infer<
  typeof storyboardSceneAssetStatusSchema
>;

/** Audio-readiness projection for one current storyboard scene. */
export const storyboardSceneAudioStatusValues = [
  "not_generated",
  "queued",
  "generating",
  "ready",
  "stale",
  "failed",
] as const;
export const storyboardSceneAudioStatusSchema = z.enum(
  storyboardSceneAudioStatusValues,
);
export type StoryboardSceneAudioStatus = z.infer<
  typeof storyboardSceneAudioStatusSchema
>;

/** Caption readiness is projected separately so ready audio can never hide a
 * missing or interrupted caption write. */
export const storyboardSceneCaptionStatusValues = [
  "not_generated",
  "pending",
  "ready",
  "stale",
  "failed",
] as const;
export const storyboardSceneCaptionStatusSchema = z.enum(
  storyboardSceneCaptionStatusValues,
);
export type StoryboardSceneCaptionStatus = z.infer<
  typeof storyboardSceneCaptionStatusSchema
>;

/** Validation-readiness projection for one storyboard scene. */
export const storyboardSceneValidationStatusValues = [
  "ok",
  "warning",
  "error",
] as const;
export const storyboardSceneValidationStatusSchema = z.enum(
  storyboardSceneValidationStatusValues,
);
export type StoryboardSceneValidationStatus = z.infer<
  typeof storyboardSceneValidationStatusSchema
>;

/** Status projection attached to each storyboard scene list entry and detail. */
export const storyboardSceneStatusSchema = z
  .object({
    assets: storyboardSceneAssetStatusSchema,
    audio: storyboardSceneAudioStatusSchema,
    captions: storyboardSceneCaptionStatusSchema,
    validation: storyboardSceneValidationStatusSchema,
    stale: z.boolean(),
  })
  .strict();
export type StoryboardSceneStatus = z.infer<typeof storyboardSceneStatusSchema>;

/** One lightweight scene summary for the ordered storyboard editor list. */
export const storyboardSceneListEntrySchema = z
  .object({
    sceneId: identifierSchema,
    order: z.number().int().positive(),
    template: sceneTemplateSchema,
    title: boundedText(160).nullable(),
    narrationSummary: boundedText(200),
    narrationBlockCount: z.number().int().min(0).max(100),
    durationSeconds: z
      .number()
      .int()
      .min(storyboardSceneMinimumSeconds)
      .max(storyboardSceneMaximumSeconds),
    status: storyboardSceneStatusSchema,
  })
  .strict();
export type StoryboardSceneListEntry = z.infer<
  typeof storyboardSceneListEntrySchema
>;

/**
 * `GET /projects/:id/storyboard/scenes` response. The list carries the
 * storyboard revision so the editor can key its query cache by it and refetch
 * whenever the draft changes.
 */
export const storyboardSceneListResponseSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    stale: z.boolean(),
    staleReason: z.string().max(500).nullable(),
    totalDurationSeconds: z.number().int().positive(),
    targetDurationSeconds: targetDurationSecondsSchema,
    scenes: z.array(storyboardSceneListEntrySchema).min(1).max(100),
  })
  .strict();
export type StoryboardSceneListResponse = z.infer<
  typeof storyboardSceneListResponseSchema
>;

/** `GET /projects/:id/storyboard/scenes/:sceneId` response. */
export const storyboardSceneDetailResponseSchema = z
  .object({
    scene: lessonStoryboardSceneSchema,
    sceneRevision: z.number().int().nonnegative(),
    status: storyboardSceneStatusSchema,
  })
  .strict();
export type StoryboardSceneDetailResponse = z.infer<
  typeof storyboardSceneDetailResponseSchema
>;

// ---------------------------------------------------------------------------
// ST-056 — Schema-driven scene editing and template migration
// ---------------------------------------------------------------------------

const sceneEditorControlValues = [
  "text",
  "textarea",
  "text-list",
  "select",
] as const;
export const sceneEditorControlSchema = z.enum(sceneEditorControlValues);
export type SceneEditorControl = z.infer<typeof sceneEditorControlSchema>;

export const sceneEditorFieldSchema = z
  .object({
    control: sceneEditorControlSchema,
    label: boundedText(100),
    options: z.array(boundedText(100)).max(20).optional(),
    path: boundedText(100),
    required: z.boolean(),
  })
  .strict();
export type SceneEditorField = z.infer<typeof sceneEditorFieldSchema>;

// ST-057 keeps catalog eligibility explicit and data-driven. These values are
// not written to LessonSpec; bindings continue to contain only stable asset IDs.
export const assetCatalogKindValues = [
  "icon",
  "illustration",
  "shape",
] as const;
export const assetCatalogKindSchema = z.enum(assetCatalogKindValues);
export type AssetCatalogKind = z.infer<typeof assetCatalogKindSchema>;
export const assetAspectRatioValues = ["square", "landscape", "wide"] as const;
export const assetAspectRatioSchema = z.enum(assetAspectRatioValues);
export type AssetAspectRatio = z.infer<typeof assetAspectRatioSchema>;

export const assetCatalogEntrySchema = z
  .object({
    aspectRatio: assetAspectRatioSchema,
    dimensions: z
      .object({
        height: z.number().int().positive(),
        width: z.number().int().positive(),
      })
      .strict(),
    id: identifierSchema,
    kind: assetCatalogKindSchema,
    license: boundedText(160),
    mediaType: z.literal("image/svg+xml"),
    source: boundedText(200),
    staticLocation: boundedText(500),
    subject: boundedText(100),
    tags: z.array(boundedText(40)).min(1).max(20),
    usageConstraints: z.array(boundedText(200)).min(1).max(10),
  })
  .strict();
export type AssetCatalogEntry = z.infer<typeof assetCatalogEntrySchema>;

export const sceneAssetSlotRequirementSchema = z
  .object({
    acceptedAspectRatios: z.array(assetAspectRatioSchema).min(1).max(3),
    acceptedKinds: z.array(assetCatalogKindSchema).min(1).max(3),
    bindingRole: sceneAssetRoleSchema,
    required: z.boolean(),
    slot: boundedText(64),
    visualRole: visualRoleSchema,
  })
  .strict();
export type SceneAssetSlotRequirement = z.infer<
  typeof sceneAssetSlotRequirementSchema
>;

/**
 * ST-089: one line of teacher-facing guidance describing what acquisition a
 * slot's epistemic role permits. Kept beside the role enum so the contact-sheet
 * read path and the storyboard editor stay consistent.
 */
export function visualRolePermits(role: VisualRole): string {
  switch (role) {
    case "grounding_critical":
      return "Carries factual content the learner must trust. Only a source-derived visual is allowed; generated illustrations cannot be used here.";
    case "source_derived":
      return "Must stay faithful to the source. A generated illustration is allowed only with an explicit source reference and your review.";
    case "decorative":
      return "Supports the scene without carrying facts. A generated illustration is a free editorial choice.";
  }
}

/** ST-089: why a candidate cannot be selected from the contact sheet. */
export const illustrationCandidateBlockReasonSchema = z.enum([
  "generation_failed",
  "moderation_rejected",
  "media_check_failed",
  "not_reviewable",
  "already_resolved",
]);
export type IllustrationCandidateBlockReason = z.infer<
  typeof illustrationCandidateBlockReasonSchema
>;

/**
 * ST-089: a non-blocking editorial signal shown against a scene in the contact
 * sheet. `deterministic` signals (e.g. scene monotony) carry a ruleset version;
 * a future `model_assisted` visual-quality signal additionally names its model.
 * An advisory never gates candidate selection.
 */
export const illustrationAdvisoryFindingSchema = z
  .object({
    code: boundedText(64),
    message: boundedText(500),
    source: z.enum(["deterministic", "model_assisted"]),
    rulesetVersion: boundedText(64),
    model: boundedText(120).nullable(),
  })
  .strict();
export type IllustrationAdvisoryFinding = z.infer<
  typeof illustrationAdvisoryFindingSchema
>;

export const illustrationContactSheetCandidateSchema = z
  .object({
    id: identifierSchema,
    jobId: identifierSchema.nullable(),
    status: illustrationCandidateStatusSchema,
    moderationStatus: illustrationModerationStatusSchema,
    provenance: z.literal("ai_generated"),
    provider: boundedText(80),
    promptVersion: boundedText(40),
    // A signed download URL for our own asset store, rendered straight into an
    // <img src>. Not constrained to z.string().url() on purpose: a single
    // provider producing an unusual-but-valid URL form must not fail the parse
    // for the whole contact sheet.
    previewUrl: z.string().min(1).max(4_000).nullable(),
    altText: boundedText(300),
    costUsd: z.number().nonnegative().nullable(),
    failureCode: boundedText(120).nullable(),
    selectable: z.boolean(),
    blockedReason: illustrationCandidateBlockReasonSchema.nullable(),
    blockedDetail: boundedText(300).nullable(),
  })
  .strict();
export type IllustrationContactSheetCandidate = z.infer<
  typeof illustrationContactSheetCandidateSchema
>;

export const illustrationContactSheetSlotSchema = z
  .object({
    slot: boundedText(64),
    visualRole: visualRoleSchema,
    visualRolePermits: boundedText(400),
    required: z.boolean(),
    candidates: z.array(illustrationContactSheetCandidateSchema).max(100),
  })
  .strict();
export type IllustrationContactSheetSlot = z.infer<
  typeof illustrationContactSheetSlotSchema
>;

export const illustrationContactSheetSceneSchema = z
  .object({
    sceneId: identifierSchema,
    order: z.number().int().positive(),
    title: boundedText(160).nullable(),
    template: sceneTemplateSchema,
    sceneRevision: z.number().int().nonnegative(),
    advisories: z.array(illustrationAdvisoryFindingSchema).max(20),
    slots: z.array(illustrationContactSheetSlotSchema).max(20),
  })
  .strict();
export type IllustrationContactSheetScene = z.infer<
  typeof illustrationContactSheetSceneSchema
>;

export const illustrationContactSheetResponseSchema = z
  .object({
    rulesetVersion: boundedText(64).nullable(),
    scenes: z.array(illustrationContactSheetSceneSchema).max(500),
  })
  .strict();
export type IllustrationContactSheetResponse = z.infer<
  typeof illustrationContactSheetResponseSchema
>;

export const sceneEditorTemplateMetadataSchema = z
  .object({
    assetSlots: z.array(boundedText(64)).max(20),
    assetSlotRequirements: z.array(sceneAssetSlotRequirementSchema).max(20),
    fields: z.array(sceneEditorFieldSchema).min(1).max(30),
    template: sceneTemplateSchema,
  })
  .strict();
export type SceneEditorTemplateMetadata = z.infer<
  typeof sceneEditorTemplateMetadataSchema
>;

const commonSceneEditorFields: readonly SceneEditorField[] = [
  { path: "title", label: "Title", control: "text", required: false },
  {
    path: "narration",
    label: "Narration",
    control: "textarea",
    required: true,
  },
  {
    path: "onScreenText",
    label: "On-screen text",
    control: "text-list",
    required: false,
  },
  {
    path: "durationSeconds",
    label: "Duration (seconds)",
    control: "text",
    required: true,
  },
  {
    path: "transition",
    label: "Transition",
    control: "select",
    options: ["cut", "fade", "slide"],
    required: true,
  },
];

const templateEditorFields: Record<SceneTemplate, readonly SceneEditorField[]> =
  {
    hook: [
      {
        path: "visual.question",
        label: "Question",
        control: "text",
        required: true,
      },
      {
        path: "visual.prompt",
        label: "Prompt",
        control: "text",
        required: false,
      },
      {
        path: "visual.supportingElements",
        label: "Supporting elements",
        control: "text-list",
        required: false,
      },
    ],
    definition: [
      { path: "visual.term", label: "Term", control: "text", required: true },
      {
        path: "visual.definition",
        label: "Definition",
        control: "textarea",
        required: true,
      },
      {
        path: "visual.exampleLabel",
        label: "Example label",
        control: "text",
        required: false,
      },
      {
        path: "visual.exampleText",
        label: "Example text",
        control: "text",
        required: false,
      },
    ],
    process: [
      {
        path: "visual.steps",
        label: "Steps",
        control: "text-list",
        required: true,
      },
    ],
    "input-process-output": [
      {
        path: "visual.inputs",
        label: "Inputs",
        control: "text-list",
        required: true,
      },
      {
        path: "visual.process.label",
        label: "Process",
        control: "text",
        required: true,
      },
      {
        path: "visual.outputs",
        label: "Outputs",
        control: "text-list",
        required: true,
      },
    ],
    comparison: [
      {
        path: "visual.leftSubject.label",
        label: "Left subject",
        control: "text",
        required: true,
      },
      {
        path: "visual.rightSubject.label",
        label: "Right subject",
        control: "text",
        required: true,
      },
      {
        path: "visual.similarities",
        label: "Similarities",
        control: "text-list",
        required: true,
      },
      {
        path: "visual.differences",
        label: "Differences",
        control: "text-list",
        required: true,
      },
    ],
    "cause-effect": [
      {
        path: "visual.causes",
        label: "Causes",
        control: "text-list",
        required: true,
      },
      {
        path: "visual.mechanism.label",
        label: "Mechanism",
        control: "text",
        required: false,
      },
      {
        path: "visual.effects",
        label: "Effects",
        control: "text-list",
        required: true,
      },
    ],
    "labelled-diagram": [
      {
        path: "visual.kind",
        label: "Diagram type",
        control: "select",
        options: ["asset", "shapes"],
        required: true,
      },
      {
        path: "visual.shape",
        label: "Shape",
        control: "select",
        options: ["cell", "cycle", "plant", "system"],
        required: false,
      },
      {
        path: "visual.labels",
        label: "Labels",
        control: "text-list",
        required: true,
      },
    ],
    analogy: [
      {
        path: "visual.sourceConcept",
        label: "Source concept",
        control: "text",
        required: true,
      },
      {
        path: "visual.familiarSystem",
        label: "Familiar system",
        control: "text",
        required: true,
      },
      {
        path: "visual.mappings",
        label: "Mappings",
        control: "text-list",
        required: true,
      },
    ],
    "worked-example": [
      {
        path: "visual.problem",
        label: "Problem",
        control: "textarea",
        required: true,
      },
      {
        path: "visual.steps",
        label: "Steps",
        control: "text-list",
        required: true,
      },
      {
        path: "visual.answer",
        label: "Answer",
        control: "textarea",
        required: true,
      },
    ],
    summary: [
      {
        path: "visual.takeaways",
        label: "Takeaways",
        control: "text-list",
        required: true,
      },
      {
        path: "visual.centralModel",
        label: "Central model",
        control: "text",
        required: false,
      },
      {
        path: "visual.callToAction",
        label: "Call to action",
        control: "text",
        required: false,
      },
    ],
  };

const templateAssetSlots: Record<SceneTemplate, readonly string[]> = {
  hook: ["subject"],
  definition: ["visual-example"],
  process: [
    "step-1-icon",
    "step-2-icon",
    "step-3-icon",
    "step-4-icon",
    "step-5-icon",
    "step-6-icon",
  ],
  "input-process-output": [
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
  comparison: ["left-subject-image", "right-subject-image"],
  "cause-effect": [
    "cause-1-icon",
    "cause-2-icon",
    "cause-3-icon",
    "mechanism-icon",
    "effect-1-icon",
    "effect-2-icon",
    "effect-3-icon",
  ],
  "labelled-diagram": ["diagram"],
  analogy: ["central-visual"],
  "worked-example": [],
  summary: ["central-visual"],
};

function slotRequirement(
  slot: string,
  bindingRole: SceneAssetRole,
  acceptedKinds: readonly AssetCatalogKind[],
  acceptedAspectRatios: readonly AssetAspectRatio[] = ["square"],
  required = false,
  // ST-085: fail closed. A slot added without an explicit role is treated as
  // grounding-critical, which blocks generation until someone classifies it.
  visualRole: VisualRole = "grounding_critical",
): SceneAssetSlotRequirement {
  return sceneAssetSlotRequirementSchema.parse({
    acceptedAspectRatios,
    acceptedKinds,
    bindingRole,
    required,
    slot,
    visualRole,
  });
}

// ST-085 visual-role assignment. `labelled-diagram.diagram` carries the factual
// visual of the scene — exact labels a learner is expected to trust — so it is
// grounding-critical and generation is barred from it. Every other slot is a
// supporting or establishing visual with no required labels or factual
// assertions and is decorative. No slot is `source_derived` in this release
// (the teacher-approved generated-illustration flow for those is ST-089).
const decorative = "decorative" as const;
const templateAssetSlotRequirements: Record<
  SceneTemplate,
  readonly SceneAssetSlotRequirement[]
> = {
  hook: [
    slotRequirement(
      "subject",
      "illustration",
      ["illustration", "shape"],
      ["square", "landscape"],
      false,
      decorative,
    ),
  ],
  definition: [
    slotRequirement(
      "visual-example",
      "illustration",
      ["illustration", "shape"],
      ["square", "landscape"],
      false,
      decorative,
    ),
  ],
  process: templateAssetSlots.process.map((slot) =>
    slotRequirement(
      slot,
      "icon",
      ["icon", "shape"],
      ["square"],
      false,
      decorative,
    ),
  ),
  "input-process-output": templateAssetSlots["input-process-output"].map(
    (slot) =>
      slotRequirement(
        slot,
        "icon",
        ["icon", "shape"],
        ["square"],
        false,
        decorative,
      ),
  ),
  comparison: templateAssetSlots.comparison.map((slot) =>
    slotRequirement(
      slot,
      "illustration",
      ["illustration", "shape"],
      ["square", "landscape"],
      false,
      decorative,
    ),
  ),
  "cause-effect": templateAssetSlots["cause-effect"].map((slot) =>
    slotRequirement(
      slot,
      "icon",
      ["icon", "shape"],
      ["square"],
      false,
      decorative,
    ),
  ),
  "labelled-diagram": [
    slotRequirement(
      "diagram",
      "diagram",
      ["illustration", "shape"],
      ["landscape", "wide"],
      true,
      "grounding_critical",
    ),
  ],
  analogy: [
    slotRequirement(
      "central-visual",
      "illustration",
      ["illustration", "shape"],
      ["square", "landscape"],
      false,
      decorative,
    ),
  ],
  "worked-example": [],
  summary: [
    slotRequirement(
      "central-visual",
      "illustration",
      ["illustration", "shape"],
      ["square", "landscape"],
      false,
      decorative,
    ),
  ],
};

export function sceneEditorMetadata(
  template: SceneTemplate,
): SceneEditorTemplateMetadata {
  return sceneEditorTemplateMetadataSchema.parse({
    template,
    assetSlots: templateAssetSlots[template],
    assetSlotRequirements: templateAssetSlotRequirements[template],
    fields: [...commonSceneEditorFields, ...templateEditorFields[template]],
  });
}

export function sceneAssetSlotRequirement(
  template: SceneTemplate,
  slot: string,
): SceneAssetSlotRequirement | undefined {
  return templateAssetSlotRequirements[template].find(
    (requirement) => requirement.slot === slot,
  );
}

export const assetBindingRoleViolationValues = [
  "visual_role_mismatch",
  "generated_in_grounding_slot",
  "missing_source_reference",
] as const;
export type AssetBindingRoleViolation =
  (typeof assetBindingRoleViolationValues)[number];

/**
 * ST-085: the pure role-vs-provenance rule for one binding, with no dependency
 * on a template or scene. `slotRole` is the authoritative role the template
 * assigns to the slot. A binding that declares no `provenance` predates this
 * contract and is grandfathered (only a declared-`visualRole` mismatch is
 * reported). `source_derived` permits a teacher-approved generated illustration
 * per the visual-role table; only `grounding_critical` bars `ai_generated`.
 */
export function assetBindingRoleViolations(input: {
  slotRole: VisualRole;
  declaredVisualRole?: VisualRole | undefined;
  provenance?: AssetProvenance | undefined;
  hasSourceRef: boolean;
}): readonly AssetBindingRoleViolation[] {
  const violations: AssetBindingRoleViolation[] = [];
  if (
    input.declaredVisualRole !== undefined &&
    input.declaredVisualRole !== input.slotRole
  )
    violations.push("visual_role_mismatch");
  if (input.slotRole === "decorative" || input.provenance === undefined)
    return violations;
  if (
    input.slotRole === "grounding_critical" &&
    input.provenance === "ai_generated"
  )
    violations.push("generated_in_grounding_slot");
  if (!input.hasSourceRef) violations.push("missing_source_reference");
  return violations;
}

/**
 * ST-085: validate a scene's asset bindings against the epistemic role its
 * template assigns to each slot. Returned issues are ready to hand to
 * `context.addIssue`. The authoritative provenance-versus-slot check at write
 * time lives in the storyboard service, which resolves the real asset
 * provenance from the database.
 */
export function assetBindingComplianceIssues(
  template: SceneTemplate,
  assetBindings: readonly SceneAssetBinding[],
): readonly { path: (string | number)[]; message: string }[] {
  const issues: { path: (string | number)[]; message: string }[] = [];
  assetBindings.forEach((binding, index) => {
    if (binding.slot === undefined) return;
    const requirement = sceneAssetSlotRequirement(template, binding.slot);
    if (requirement === undefined) return;
    const slotRole = requirement.visualRole;
    for (const violation of assetBindingRoleViolations({
      slotRole,
      declaredVisualRole: binding.visualRole,
      provenance: binding.provenance,
      hasSourceRef: binding.sourceRef !== undefined,
    })) {
      if (violation === "visual_role_mismatch")
        issues.push({
          path: ["assetBindings", index, "visualRole"],
          message: `Slot "${binding.slot}" is ${slotRole}, not ${binding.visualRole}.`,
        });
      else if (violation === "generated_in_grounding_slot")
        issues.push({
          path: ["assetBindings", index, "provenance"],
          message: `Slot "${binding.slot}" is grounding-critical and cannot use an AI-generated asset.`,
        });
      else
        issues.push({
          path: ["assetBindings", index, "sourceRef"],
          message: `Slot "${binding.slot}" is ${slotRole} and requires a source reference.`,
        });
    }
  });
  return issues;
}

/**
 * Returns the template-declared slots that the current scene must bind. A
 * labelled diagram can be rendered with deterministic shapes, so its diagram
 * slot becomes required only when the teacher selects the asset visual mode.
 */
export function requiredSceneAssetSlots(scene: SceneSpec): readonly string[] {
  return templateAssetSlotRequirements[scene.template]
    .filter((requirement) => {
      if (!requirement.required) return false;
      return (
        scene.template !== "labelled-diagram" || scene.visual.kind === "asset"
      );
    })
    .map((requirement) => requirement.slot);
}

export function isCatalogAssetCompatibleWithSlot(
  asset: Pick<AssetCatalogEntry, "aspectRatio" | "kind">,
  requirement: SceneAssetSlotRequirement,
): boolean {
  return (
    requirement.acceptedKinds.includes(asset.kind) &&
    requirement.acceptedAspectRatios.includes(asset.aspectRatio)
  );
}

export const assetCatalogSearchInputSchema = z
  .object({
    query: z.string().trim().max(100).optional(),
    slot: boundedText(64).optional(),
    tags: z.array(boundedText(40)).max(10).optional(),
    template: sceneTemplateSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.template === undefined) !== (value.slot === undefined))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "template and slot must be provided together.",
        path: [value.template === undefined ? "template" : "slot"],
      });
  });
export type AssetCatalogSearchInput = z.infer<
  typeof assetCatalogSearchInputSchema
>;
export const assetCatalogSearchResponseSchema = z
  .object({ assets: z.array(assetCatalogEntrySchema).max(100) })
  .strict();
export type AssetCatalogSearchResponse = z.infer<
  typeof assetCatalogSearchResponseSchema
>;

// ---------------------------------------------------------------------------
// ST-058 — Project-private teacher replacement assets
// ---------------------------------------------------------------------------

export const projectAssetMediaTypeSchema = z.enum([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
export type ProjectAssetMediaType = z.infer<typeof projectAssetMediaTypeSchema>;

export const createProjectAssetUploadInputSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    mediaType: projectAssetMediaTypeSchema,
    sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/i)
      .transform((value) => value.toLowerCase()),
    sizeBytes: z.number().int().positive(),
  })
  .strict();
export type CreateProjectAssetUploadInput = z.infer<
  typeof createProjectAssetUploadInputSchema
>;

export const projectAssetUploadSessionSchema = z
  .object({
    assetId: identifierSchema,
    expiresAt: z.string().datetime({ offset: true }),
    method: z.literal("PUT"),
    requiredHeaders: z.record(z.string()),
    sessionId: identifierSchema,
    uploadUrl: z.string().url(),
  })
  .strict();
export type ProjectAssetUploadSession = z.infer<
  typeof projectAssetUploadSessionSchema
>;

export const projectAssetSchema = z
  .object({
    assetId: identifierSchema,
    createdAt: z.string().datetime({ offset: true }),
    height: z.number().int().positive(),
    mediaType: projectAssetMediaTypeSchema,
    previewUrl: z.string().url(),
    provenance: z.literal("teacher_uploaded"),
    width: z.number().int().positive(),
  })
  .strict();
export type ProjectAsset = z.infer<typeof projectAssetSchema>;

export const projectAssetListResponseSchema = z
  .object({ assets: z.array(projectAssetSchema).max(200) })
  .strict();
export type ProjectAssetListResponse = z.infer<
  typeof projectAssetListResponseSchema
>;

export const completeProjectAssetUploadInputSchema = z.object({}).strict();
export const completeProjectAssetUploadResponseSchema = z
  .object({
    asset: projectAssetSchema.nullable(),
    status: z.enum(["pending_validation", "active", "rejected"]),
  })
  .strict();
export type CompleteProjectAssetUploadResponse = z.infer<
  typeof completeProjectAssetUploadResponseSchema
>;

/** Idempotent background validation for a teacher-uploaded image. */
export const projectAssetValidationJobPayloadSchema = z
  .object({ schemaVersion: z.literal(1), assetId: identifierSchema })
  .strict();
export type ProjectAssetValidationJobPayload = z.infer<
  typeof projectAssetValidationJobPayloadSchema
>;

export const storyboardSceneAssetBindingInputSchema = z
  .object({
    altText: boundedText(500).optional(),
    assetId: identifierSchema,
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export type StoryboardSceneAssetBindingInput = z.infer<
  typeof storyboardSceneAssetBindingInputSchema
>;
export const storyboardSceneAssetUnbindingInputSchema = z
  .object({ expectedRevision: z.number().int().nonnegative() })
  .strict();
export type StoryboardSceneAssetUnbindingInput = z.infer<
  typeof storyboardSceneAssetUnbindingInputSchema
>;

/** The edit command carries a complete typed scene, not an unbounded patch. */
export const storyboardSceneUpdateInputSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    scene: sceneSpecSchema,
  })
  .strict();
export type StoryboardSceneUpdateInput = z.infer<
  typeof storyboardSceneUpdateInputSchema
>;

export const storyboardSceneTemplateSwitchInputSchema = z
  .object({
    confirmReset: z.boolean().optional(),
    expectedRevision: z.number().int().nonnegative(),
    template: sceneTemplateSchema,
  })
  .strict();
export type StoryboardSceneTemplateSwitchInput = z.infer<
  typeof storyboardSceneTemplateSwitchInputSchema
>;

export const sceneEditInvalidationScopeValues = [
  "audio",
  "captions",
  "preview",
  "render",
  "validation",
  "audio-fit-warning",
] as const;
export const sceneEditInvalidationScopeSchema = z.enum(
  sceneEditInvalidationScopeValues,
);
export type SceneEditInvalidationScope = z.infer<
  typeof sceneEditInvalidationScopeSchema
>;

export const storyboardSceneEditResponseSchema = z
  .object({
    invalidated: z.array(sceneEditInvalidationScopeSchema).max(6),
    requiresConfirmation: z.boolean(),
    resetFields: z.array(boundedText(100)).max(30),
    revision: z.number().int().nonnegative(),
    scene: lessonStoryboardSceneSchema,
    warning: z.string().max(500).nullable(),
  })
  .strict();
export type StoryboardSceneEditResponse = z.infer<
  typeof storyboardSceneEditResponseSchema
>;

// ---------------------------------------------------------------------------
// ST-055 — Reorder, add, duplicate, and delete storyboard scenes
// ---------------------------------------------------------------------------

/**
 * Boundary for reordering the complete scene list. `sceneIds` must contain
 * every current scene id exactly once; the server rejects any mismatch so a
 * concurrent add/delete cannot silently reorder a stale view.
 */
export const storyboardSceneReorderInputSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    sceneIds: z.array(identifierSchema).min(1).max(100),
  })
  .strict();
export type StoryboardSceneReorderInput = z.infer<
  typeof storyboardSceneReorderInputSchema
>;

/**
 * Boundary for appending a new scene from a registered template's default
 * factory. The new scene starts uncited and unassigned so the teacher can
 * ground it during scene editing (ST-056).
 */
export const storyboardSceneCreateInputSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    template: sceneTemplateSchema,
  })
  .strict();
export type StoryboardSceneCreateInput = z.infer<
  typeof storyboardSceneCreateInputSchema
>;

/**
 * Boundary for duplicating an existing scene. The duplicate keeps the source
 * scene's content and provenance but receives a new stable id and order.
 */
export const storyboardSceneDuplicateInputSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export type StoryboardSceneDuplicateInput = z.infer<
  typeof storyboardSceneDuplicateInputSchema
>;

/** Boundary for deleting one scene. At least one scene must remain. */
export const storyboardSceneDeleteInputSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export type StoryboardSceneDeleteInput = z.infer<
  typeof storyboardSceneDeleteInputSchema
>;

/** Default duration assigned to a newly added scene, within template bounds. */
export const storyboardSceneDefaultDurationSeconds = 10 as const;

/** Template-specific default visuals for a newly added storyboard scene. */
const storyboardSceneDefaultVisuals: Record<
  SceneTemplate,
  SceneSpec["visual"]
> = {
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
};

const storyboardSceneDefaultNarration: Record<SceneTemplate, string> = {
  hook: "What will you discover in this lesson?",
  definition: "Define a key term for this lesson.",
  process: "Describe the steps of this process.",
  "input-process-output": "Explain the inputs, process, and outputs.",
  comparison: "Compare two related subjects.",
  "cause-effect": "Explain the cause and effect.",
  "labelled-diagram": "Label the parts of this diagram.",
  analogy: "Explain this concept with an analogy.",
  "worked-example": "Work through an example step by step.",
  summary: "Summarize the key takeaways.",
};

/**
 * Builds the `SceneSpec` (inner scene content) for a newly added storyboard
 * scene. The scene is uncited (`sourceRefs: []`) and uses the template's
 * default visual so it can be grounded and completed during scene editing.
 */
export function createDefaultStoryboardSceneSpec(
  template: SceneTemplate,
  input: {
    id: Identifier;
    order: number;
    durationSeconds: number;
  },
): SceneSpec {
  return sceneSpecSchema.parse({
    id: input.id,
    order: input.order,
    narration: storyboardSceneDefaultNarration[template],
    durationSeconds: input.durationSeconds,
    onScreenText: [],
    transition: "cut",
    assetBindings: [],
    sourceRefs: [],
    generatedAdditions: [],
    template,
    visual: storyboardSceneDefaultVisuals[template],
  });
}

/**
 * Builds a safe template-switch preview. Common scene fields always survive;
 * only visual keys accepted by the target template and compatible asset slots
 * are retained. The caller must explicitly confirm when data would be reset.
 */
export function migrateStoryboardSceneTemplate(
  current: SceneSpec,
  template: SceneTemplate,
): { scene: SceneSpec; resetFields: readonly string[] } {
  const target = createDefaultStoryboardSceneSpec(template, {
    id: current.id,
    order: current.order,
    durationSeconds: current.durationSeconds,
  });
  const currentVisual = current.visual as Record<string, unknown>;
  const targetVisual = target.visual as Record<string, unknown>;
  const sharedVisual = Object.fromEntries(
    Object.entries(currentVisual).filter(([key]) => key in targetVisual),
  );
  const candidate = {
    ...target,
    title: current.title,
    narration: current.narration,
    onScreenText: current.onScreenText,
    transition: current.transition,
    assetBindings: current.assetBindings.filter(
      (binding) =>
        binding.slot === undefined ||
        templateAssetSlots[template].includes(binding.slot),
    ),
    sourceRefs: current.sourceRefs,
    generatedAdditions: current.generatedAdditions,
    visual: { ...targetVisual, ...sharedVisual },
  };
  const parsed = sceneSpecSchema.safeParse(candidate);
  const scene = parsed.success ? parsed.data : target;
  const resetFields = Object.keys(currentVisual)
    .filter((key) => !(key in targetVisual) || !parsed.success)
    .map((key) => `visual.${key}`);
  for (const binding of current.assetBindings)
    if (
      binding.slot !== undefined &&
      !templateAssetSlots[template].includes(binding.slot)
    )
      resetFields.push(`assetBindings.${binding.slot}`);
  return { scene, resetFields };
}

/** Returns only the derived artifacts affected by an explicit teacher edit. */
export function sceneEditInvalidation(
  before: SceneSpec,
  after: SceneSpec,
): {
  invalidated: readonly SceneEditInvalidationScope[];
  warning: string | null;
} {
  const changed = (key: keyof SceneSpec): boolean =>
    JSON.stringify(before[key]) !== JSON.stringify(after[key]);
  const scopes = new Set<SceneEditInvalidationScope>(["validation"]);
  if (changed("narration")) {
    scopes.add("audio");
    scopes.add("captions");
  }
  if (changed("durationSeconds")) scopes.add("audio-fit-warning");
  if (
    changed("narration") ||
    changed("durationSeconds") ||
    changed("transition") ||
    changed("visual") ||
    changed("assetBindings") ||
    changed("onScreenText") ||
    changed("title") ||
    before.template !== after.template
  ) {
    scopes.add("preview");
    scopes.add("render");
  }
  return {
    invalidated: [...scopes],
    warning: changed("durationSeconds")
      ? "Duration changed. Existing audio is retained and requires an audio-fit check."
      : null,
  };
}

// ---------------------------------------------------------------------------
// ST-084 — measured-audio duration reconciliation
// ---------------------------------------------------------------------------

/**
 * Per-scene audio-fit tolerance, shared by the validation engine, the audio
 * job's fit warning, and reconciliation so the three cannot drift apart.
 * Scene durations are planned from a word budget before any audio exists, so
 * a conforming TTS engine is expected to land inside this band rather than on
 * the predicted duration exactly.
 */
export const sceneAudioFitToleranceMs = 1_500 as const;

/**
 * Worst-case residual left by rounding a measured duration to whole seconds,
 * which is what reconciliation applies to a scene.
 */
export const sceneDurationRoundingMs = 500 as const;

/**
 * How far a scene's duration may sit from the narration plan it was written
 * against. Both sides are planning estimates and reconciliation moves the
 * scene onto measured audio afterwards, so the band is the audio-fit
 * tolerance widened by the rounding reconciliation introduces. A tighter band
 * would reject a scene that every other rule considers correctly timed.
 */
export const sceneNarrationPlanToleranceMs =
  sceneAudioFitToleranceMs + sceneDurationRoundingMs;

/**
 * Lesson-duration tolerance once scenes have been re-timed from measured audio
 * (ST-084). Reconciliation moves each scene independently: a conforming TTS
 * engine may run up to `sceneAudioFitToleranceMs` long on every scene, and
 * rounding the measurement to whole seconds adds up to `sceneDurationRoundingMs`
 * more, in the same direction. Those per-scene movements do not cancel, so the
 * lesson total can sit that far from the planned sum times the scene count even
 * though every scene individually passes the audio-fit rule. The planned
 * durations sum exactly to the target, so this is the largest lesson-total error
 * a fully conforming lesson can show, and blocking it would name no defect a
 * teacher could act on — redistributing the slack is the recorded follow-up, not
 * a reason to fail preflight here. Never tighter than the storyboard-time band,
 * which still governs a not-yet-reconciled draft.
 */
export function reconciledLessonDurationToleranceSeconds(
  target: number,
  sceneCount: number,
): number {
  const perSceneSeconds =
    (sceneAudioFitToleranceMs + sceneDurationRoundingMs) / 1_000;
  return Math.max(
    storyboardDurationToleranceSeconds(target),
    Math.ceil(Math.max(0, sceneCount) * perSceneSeconds),
  );
}

/** Which side of its planned duration a scene's measured audio landed on. */
export const sceneAudioFitDirectionSchema = z.enum(["overrun", "underrun"]);
export type SceneAudioFitDirection = z.infer<
  typeof sceneAudioFitDirectionSchema
>;

/** Why reconciliation could not apply the measured duration verbatim. */
export const sceneDurationClampReasonSchema = z.enum([
  "scene_minimum",
  "scene_maximum",
]);
export type SceneDurationClampReason = z.infer<
  typeof sceneDurationClampReasonSchema
>;

/** The auditable outcome of reconciling one scene against its measured audio. */
export const sceneDurationReconciliationSchema = z
  .object({
    stableSceneId: identifierSchema,
    previousDurationSeconds: z.number().int().positive(),
    measuredAudioDurationMs: z.number().int().nonnegative(),
    appliedDurationSeconds: z
      .number()
      .int()
      .min(storyboardSceneMinimumSeconds)
      .max(storyboardSceneMaximumSeconds),
    clampReason: sceneDurationClampReasonSchema.nullable(),
    /** True when the clamped duration still cannot contain the audio. */
    unfittable: z.boolean(),
  })
  .strict();
export type SceneDurationReconciliation = z.infer<
  typeof sceneDurationReconciliationSchema
>;

/**
 * Deterministic re-timing of scenes from measured audio. Speech is the hard
 * constraint and visuals are elastic, so a scene takes the duration its audio
 * actually needs, never the reverse. Rounding to whole seconds leaves at most
 * 500ms of residual drift, well inside `sceneAudioFitToleranceMs`; a scene
 * whose audio cannot fit the per-scene bounds is reported as `unfittable`
 * rather than silently truncated. The same measured input always produces the
 * same output, which is what makes re-running reconciliation a no-op.
 */
export function reconcileSceneDurations(
  scenes: readonly {
    stableSceneId: string;
    durationSeconds: number;
    measuredAudioDurationMs: number;
  }[],
): readonly SceneDurationReconciliation[] {
  return scenes.map((scene) => {
    const rounded = Math.round(scene.measuredAudioDurationMs / 1_000);
    const applied = Math.min(
      storyboardSceneMaximumSeconds,
      Math.max(storyboardSceneMinimumSeconds, rounded),
    );
    const clampReason: SceneDurationClampReason | null =
      rounded < storyboardSceneMinimumSeconds
        ? "scene_minimum"
        : rounded > storyboardSceneMaximumSeconds
          ? "scene_maximum"
          : null;
    return {
      stableSceneId: scene.stableSceneId as Identifier,
      previousDurationSeconds: scene.durationSeconds,
      measuredAudioDurationMs: scene.measuredAudioDurationMs,
      appliedDurationSeconds: applied,
      clampReason,
      unfittable:
        scene.measuredAudioDurationMs - applied * 1_000 >
        sceneAudioFitToleranceMs,
    };
  });
}

// ---------------------------------------------------------------------------
// ST-066 — deterministic lesson quality validation
// ---------------------------------------------------------------------------

/**
 * Versioned deterministic rules that decide whether a lesson can be rendered.
 *
 * - `"1"` — initial ruleset.
 * - `"2"` — ST-084: `audio_duration_mismatch` became asymmetric (overrun is an
 *   error, underrun an acknowledgeable warning); `lesson_duration_mismatch`
 *   moved from exact equality to a scene-count-aware band; the
 *   `narration_duration_mismatch` band widened to the audio-fit tolerance plus
 *   reconciliation rounding. The version participates in the render-authorization
 *   input hash, so bumping it forces re-validation of runs that passed under the
 *   old rules.
 * - `"3"` — ST-088: added the advisory `scene_monotony` rule (three or more
 *   consecutive scenes of the same template). It is warning-only and never
 *   changes render authorization; the bump forces previously-passed runs to
 *   recompute so the new advisory surfaces. A run persisted under an earlier
 *   version is read back as `stale` (see `lessonValidationRunSchema`), not
 *   rejected, so the read path and render preflight keep working until the
 *   teacher re-runs validation.
 */
export const lessonValidationRulesetVersion = "3" as const;

export const validationSeveritySchema = z.enum(["error", "warning", "info"]);
export type ValidationSeverity = z.infer<typeof validationSeveritySchema>;

export const validationScopeTypeSchema = z.enum([
  "lesson",
  "objective",
  "scene",
  "asset",
  "audio",
  "captions",
  "grounding",
]);
export type ValidationScopeType = z.infer<typeof validationScopeTypeSchema>;

/**
 * Stable codes are an API contract: clients deep-link with scope/entity/path,
 * rather than parsing human-readable messages.
 */
export const validationIssueCodeSchema = z.enum([
  "objective_uncovered",
  "objective_unknown",
  "unsupported_template",
  "invalid_scene",
  "text_overflow",
  "diagram_collision",
  "asset_required",
  "asset_unresolved",
  "lesson_duration_mismatch",
  "scene_duration_out_of_range",
  "narration_duration_mismatch",
  "audio_missing",
  "audio_not_ready",
  "audio_duration_mismatch",
  "captions_missing",
  "captions_not_ready",
  "caption_timing_invalid",
  "grounding_missing",
  "grounding_recheck_required",
  "generated_addition_unlabelled",
  "scene_monotony",
]);
export type ValidationIssueCode = z.infer<typeof validationIssueCodeSchema>;

export const validationIssueSchema = z
  .object({
    id: identifierSchema,
    severity: validationSeveritySchema,
    code: validationIssueCodeSchema,
    scopeType: validationScopeTypeSchema,
    scopeId: identifierSchema.nullable(),
    sceneId: identifierSchema.nullable(),
    fieldPath: z.string().trim().min(1).max(500),
    message: z.string().trim().min(1).max(1_000),
    details: z.record(z.string(), z.unknown()),
    /** Only advisory warnings can be acknowledged; errors always block. */
    acknowledgeable: z.boolean(),
    acknowledgedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.acknowledgeable && value.severity !== "warning")
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["acknowledgeable"],
        message: "Only validation warnings may be acknowledged.",
      });
  });
export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export const validationRunStatusSchema = z.enum(["passed", "failed"]);
export type ValidationRunStatus = z.infer<typeof validationRunStatusSchema>;

/** A response is valid only while its exact input hash remains current. */
export const lessonValidationRunSchema = z
  .object({
    id: identifierSchema,
    lessonSpecId: identifierSchema,
    lessonSpecRevision: z.number().int().nonnegative(),
    lessonSpecContentHash: z.string().regex(sha256HexPattern),
    inputHash: z.string().regex(sha256HexPattern),
    /**
     * The ruleset the run was computed under. A fresh run always carries
     * `lessonValidationRulesetVersion`, but a persisted run from before a
     * version bump legitimately carries an older value — `stale` (driven by the
     * input hash, which folds in the current ruleset version) is how a
     * superseded run is signalled, so this must not be pinned to the current
     * literal or reading such a run would throw instead of surfacing as stale.
     */
    rulesetVersion: z.string().trim().min(1).max(20),
    sceneLibraryVersion: z.string().trim().min(1).max(100),
    artifactHashes: z.record(z.string(), z.string().regex(sha256HexPattern)),
    status: validationRunStatusSchema,
    stale: z.boolean(),
    startedAt: z.string().datetime({ offset: true }),
    completedAt: z.string().datetime({ offset: true }),
    issues: z.array(validationIssueSchema),
  })
  .strict();
export type LessonValidationRun = z.infer<typeof lessonValidationRunSchema>;

/** Explicit validation remains safe to repeat because its input hash is cached. */
export const lessonValidationRunInputSchema = z.object({}).strict();
export type LessonValidationRunInput = z.infer<
  typeof lessonValidationRunInputSchema
>;

/** The acknowledgement is tied to the immutable validation input it reviewed. */
export const validationIssueAcknowledgementInputSchema = z
  .object({ inputHash: z.string().regex(sha256HexPattern) })
  .strict();
export type ValidationIssueAcknowledgementInput = z.infer<
  typeof validationIssueAcknowledgementInputSchema
>;
