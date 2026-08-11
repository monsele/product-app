import { identifierSchema } from "@avlp/config/identifiers";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const lessonSpecVersion = "1.0" as const;
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
const visual = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();

export const sceneSpecSchema = z.discriminatedUnion("template", [
  z
    .object({
      ...sceneBaseShape,
      template: z.literal("hook"),
      visual: visual({
        question: boundedText(500),
        prompt: boundedText(500).optional(),
      }),
    })
    .strict(),
  z
    .object({
      ...sceneBaseShape,
      template: z.literal("definition"),
      visual: visual({
        term: boundedText(200),
        definition: boundedText(1_000),
      }),
    })
    .strict(),
  z
    .object({
      ...sceneBaseShape,
      template: z.literal("process"),
      visual: visual({ steps: labelledItems }),
    })
    .strict(),
  z
    .object({
      ...sceneBaseShape,
      template: z.literal("input-process-output"),
      visual: visual({
        input: boundedText(500),
        process: boundedText(500),
        output: boundedText(500),
      }),
    })
    .strict(),
  z
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
    .strict(),
  z
    .object({
      ...sceneBaseShape,
      template: z.literal("cause-effect"),
      visual: visual({ causes: labelledItems, effects: labelledItems }),
    })
    .strict(),
  z
    .object({
      ...sceneBaseShape,
      template: z.literal("labelled-diagram"),
      visual: visual({
        diagramDescription: boundedText(1_000),
        labels: labelledItems,
      }),
    })
    .strict(),
  z
    .object({
      ...sceneBaseShape,
      template: z.literal("analogy"),
      visual: visual({
        sourceConcept: boundedText(500),
        analogy: boundedText(1_000),
        mapping: labelledItems,
      }),
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
export function parseLessonSpec(input: unknown): LessonSpec {
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
