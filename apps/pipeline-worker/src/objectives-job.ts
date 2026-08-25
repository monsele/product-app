import { createId, serializeUtcTimestamp, type Identifier } from "@avlp/config";
import {
  learningObjectives,
  learningObjectiveSets,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import {
  type LanguageModelProvider,
  type ModelPricingTable,
  type PromptRegistry,
  type QuotaGuard,
} from "@avlp/provider-adapters";
import {
  learningObjectiveSetSchema,
  objectiveGenerationParamsSchema,
  objectiveOutputV1Schema,
  sourceRefSchema,
  type LearningObjectiveSet,
  type ModelCallParams,
  type ModelCallRecord,
  type ObjectiveOutputV1,
  type SourcePackage,
  type SourceRef,
  type SourceSnapshot,
} from "@avlp/schemas";
import { and, eq } from "drizzle-orm";
import {
  createModelCallGenerationHandler,
  type ModelCallHandlerOptions,
} from "./model-call.js";

/**
 * Deterministic objective rule failure. The job classifies this as a terminal
 * deterministic failure so unsupported or uncited objectives are never
 * silently accepted as a draft.
 */
export class ObjectiveDeterministicCheckError extends Error {
  public readonly code:
    | "UNSUPPORTED_SOURCE_BLOCK"
    | "DUPLICATE_OBJECTIVE"
    | "UNSUPPORTED_OBJECTIVE";

  public constructor(
    code: ObjectiveDeterministicCheckError["code"],
    message: string,
  ) {
    super(message);
    this.name = "ObjectiveDeterministicCheckError";
    this.code = code;
  }
}

/** All block IDs present in a bounded source package. */
function collectPackageBlockIds(sourcePackage: SourcePackage): Set<string> {
  return new Set(
    sourcePackage.sections.flatMap((section) =>
      section.blocks.map((block) => block.blockId),
    ),
  );
}

/**
 * Resolves a set of model-provided block IDs into {@link SourceRef} entries.
 * Application code derives document, page, and section labels: the model's
 * page numbers are never trusted. Unknown block IDs are rejected.
 */
export function resolveObjectiveSourceRefs(
  sourcePackage: SourcePackage,
  blockIds: readonly string[],
): SourceRef[] {
  const valid = collectPackageBlockIds(sourcePackage);
  for (const blockId of blockIds)
    if (!valid.has(blockId))
      throw new ObjectiveDeterministicCheckError(
        "UNSUPPORTED_SOURCE_BLOCK",
        `Objective cites unsupported source block ${blockId}.`,
      );
  const pagesByBlock = new Map<string, number>();
  const sectionByBlock = new Map<string, string>();
  for (const section of sourcePackage.sections)
    for (const block of section.blocks) {
      pagesByBlock.set(block.blockId, block.page);
      sectionByBlock.set(block.blockId, section.sectionId);
    }
  const refsBySection = new Map<string, SourceRef>();
  const orderedSectionIds: string[] = [];
  for (const blockId of [...new Set(blockIds)]) {
    const sectionId = sectionByBlock.get(blockId)!;
    let ref = refsBySection.get(sectionId);
    if (ref === undefined) {
      ref = {
        documentId: sourcePackage.normalizedDocumentId,
        parsedDocumentVersion: sourcePackage.parsedDocumentVersion,
        pageStart: pagesByBlock.get(blockId)!,
        sectionId,
        blockIds: [],
      };
      refsBySection.set(sectionId, ref);
      orderedSectionIds.push(sectionId);
    }
    ref.pageStart = Math.min(ref.pageStart, pagesByBlock.get(blockId)!);
    if (ref.pageEnd === undefined) ref.pageEnd = pagesByBlock.get(blockId)!;
    else ref.pageEnd = Math.max(ref.pageEnd, pagesByBlock.get(blockId)!);
    ref.blockIds.push(blockId);
  }
  return orderedSectionIds.map((sectionId) => {
    const ref = refsBySection.get(sectionId)!;
    ref.blockIds.sort();
    return sourceRefSchema.parse(ref);
  });
}

const nonMeasurableVerbPattern =
  /^(?:know|understand|learn|appreciate|be aware of|realize|believe)\b/i;

function isMeasurableVerb(verb: string): boolean {
  return verb.length > 0 && !nonMeasurableVerbPattern.test(verb.trim());
}

/**
 * Deterministic objective rules (the objectives evaluation cases): bounded
 * count, measurable verbs, no duplicate objective statements, and every
 * citation must resolve to a real block in the approved source package.
 * Throws on the first violation; a valid draft must clear every rule.
 */
export function assertObjectiveDeterministicChecks(
  output: ObjectiveOutputV1,
  sourcePackage: SourcePackage,
): void {
  const valid = collectPackageBlockIds(sourcePackage);
  const seenStatements = new Set<string>();
  const checkItem = (
    path: string,
    statement: string,
    verb: string | undefined,
    blockIds: readonly string[],
  ): void => {
    if (verb !== undefined && !isMeasurableVerb(verb))
      throw new ObjectiveDeterministicCheckError(
        "UNSUPPORTED_OBJECTIVE",
        `${path} uses a non-measurable verb.`,
      );
    if (blockIds.length === 0)
      throw new ObjectiveDeterministicCheckError(
        "UNSUPPORTED_OBJECTIVE",
        `${path} does not cite any source block.`,
      );
    for (const blockId of blockIds)
      if (!valid.has(blockId))
        throw new ObjectiveDeterministicCheckError(
          "UNSUPPORTED_SOURCE_BLOCK",
          `${path} cites unsupported source block ${blockId}.`,
        );
  };
  for (const [index, objective] of output.objectives.entries()) {
    checkItem(
      `objectives[${index}]`,
      objective.statement,
      objective.verb,
      objective.sourceBlockIds,
    );
    const normalized = objective.statement
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (seenStatements.has(normalized))
      throw new ObjectiveDeterministicCheckError(
        "DUPLICATE_OBJECTIVE",
        `objectives[${index}] duplicates an existing objective statement.`,
      );
    seenStatements.add(normalized);
  }
  const checkPlanning = (
    path: string,
    items: readonly { text?: string; sourceBlockIds: readonly string[] }[],
  ): void => {
    for (const [index, item] of items.entries())
      checkItem(
        `${path}[${index}]`,
        item.text ?? "",
        undefined,
        item.sourceBlockIds,
      );
  };
  checkPlanning("keyConcepts", output.keyConcepts);
  checkPlanning("prerequisiteKnowledge", output.prerequisiteKnowledge);
  for (const [index, item] of output.vocabulary.entries())
    checkItem(
      `vocabulary[${index}]`,
      item.term,
      undefined,
      item.sourceBlockIds,
    );
  for (const [index, item] of output.misconceptions.entries())
    checkItem(
      `misconceptions[${index}]`,
      item.misconception,
      undefined,
      item.sourceBlockIds,
    );
  for (const [index, item] of output.assessmentQuestions.entries())
    checkItem(
      `assessmentQuestions[${index}]`,
      item.question,
      undefined,
      item.sourceBlockIds,
    );
}

/**
 * Idempotent draft-set persistence: one set per (owner, project, job
 * idempotency key). A retried job returns the already-created set instead of
 * duplicating the result record.
 */
export async function persistObjectiveSet(input: {
  executor: DatabaseExecutor;
  output: ObjectiveOutputV1;
  sourcePackage: SourcePackage;
  snapshot: SourceSnapshot;
  params: ModelCallParams;
  modelCall: ModelCallRecord;
  context: {
    ownerUserId: Identifier;
    projectId: Identifier;
    idempotencyKey: string;
  };
  now: Date;
}): Promise<{ id: Identifier }> {
  const params = objectiveGenerationParamsSchema.parse(input.params);
  const timestamp = input.now;
  const setId = createId(timestamp);
  const sourceRefsById = (
    blockIds: readonly string[],
  ): SourceRef[] => resolveObjectiveSourceRefs(input.sourcePackage, blockIds);
  const set: LearningObjectiveSet = learningObjectiveSetSchema.parse({
    schemaVersion: 1,
    id: setId,
    projectId: input.context.projectId,
    sourceSnapshotId: input.snapshot.id,
    sourceSnapshotContentHash: input.snapshot.contentHash,
    configurationVersion: params.configurationVersion,
    promptId: input.modelCall.promptId,
    promptVersion: input.modelCall.promptVersion,
    model: input.modelCall.model,
    modelCallId: input.modelCall.id,
    status: "draft",
    revision: 0,
    objectives: input.output.objectives.map((objective, index) => ({
      id: createId(timestamp),
      order: index + 1,
      statement: objective.statement,
      verb: objective.verb,
      confidence: objective.confidence,
      sourceRefs: sourceRefsById(objective.sourceBlockIds),
      generated: true,
      revision: 0,
      groundingStatus: "supported",
    })),
    keyConcepts: input.output.keyConcepts.map((item, index) => ({
      id: createId(timestamp),
      order: index + 1,
      text: item.text,
      sourceRefs: sourceRefsById(item.sourceBlockIds),
    })),
    prerequisiteKnowledge: input.output.prerequisiteKnowledge.map(
      (item, index) => ({
        id: createId(timestamp),
        order: index + 1,
        text: item.text,
        sourceRefs: sourceRefsById(item.sourceBlockIds),
      }),
    ),
    vocabulary: input.output.vocabulary.map((item, index) => ({
      id: createId(timestamp),
      order: index + 1,
      term: item.term,
      definition: item.definition,
      sourceRefs: sourceRefsById(item.sourceBlockIds),
    })),
    misconceptions: input.output.misconceptions.map((item, index) => ({
      id: createId(timestamp),
      order: index + 1,
      misconception: item.misconception,
      correction: item.correction,
      sourceRefs: sourceRefsById(item.sourceBlockIds),
    })),
    assessmentQuestions: input.output.assessmentQuestions.map((item, index) => ({
      id: createId(timestamp),
      order: index + 1,
      question: item.question,
      sourceRefs: sourceRefsById(item.sourceBlockIds),
    })),
    generatedAt: serializeUtcTimestamp(timestamp),
    createdAt: serializeUtcTimestamp(timestamp),
  });

  return input.executor.transaction(async (transaction) => {
    const [created] = await transaction
      .insert(learningObjectiveSets)
      .values({
        id: setId,
        projectId: input.context.projectId,
        ownerUserId: input.context.ownerUserId,
        sourceSnapshotId: input.snapshot.id,
        sourceSnapshotContentHash: input.snapshot.contentHash,
        configurationVersion: set.configurationVersion,
        promptId: set.promptId,
        promptVersion: set.promptVersion,
        model: set.model,
        modelCallId: set.modelCallId,
        status: set.status,
        revision: 0,
        idempotencyKey: input.context.idempotencyKey,
        keyConcepts: set.keyConcepts,
        prerequisiteKnowledge: set.prerequisiteKnowledge,
        vocabulary: set.vocabulary,
        misconceptions: set.misconceptions,
        assessmentQuestions: set.assessmentQuestions,
        generatedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing({
        target: [
          learningObjectiveSets.ownerUserId,
          learningObjectiveSets.projectId,
          learningObjectiveSets.idempotencyKey,
        ],
      })
      .returning({ id: learningObjectiveSets.id });
    if (created !== undefined) {
      await transaction.insert(learningObjectives).values(
        set.objectives.map((objective) => ({
          id: objective.id,
          projectId: input.context.projectId,
          ownerUserId: input.context.ownerUserId,
          setId,
          order: objective.order,
          statement: objective.statement,
          verb: objective.verb,
          confidence: objective.confidence,
          sourceRefs: objective.sourceRefs,
          generated: objective.generated,
          revision: objective.revision,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      );
    } else {
      const [existing] = await transaction
        .select({ id: learningObjectiveSets.id })
        .from(learningObjectiveSets)
        .where(
          and(
            eq(learningObjectiveSets.ownerUserId, input.context.ownerUserId),
            eq(learningObjectiveSets.projectId, input.context.projectId),
            eq(learningObjectiveSets.idempotencyKey, input.context.idempotencyKey),
          ),
        )
        .limit(1);
      if (existing === undefined)
        throw new Error("The idempotent objective set could not be read.");
      return { id: existing.id as Identifier };
    }
    return { id: setId };
  });
}

/**
 * The objectives generation job: the standard model-call lifecycle plus
 * deterministic objective rules and idempotent draft-set persistence.
 */
export function createObjectivesGenerationJobHandler(input: {
  database: DatabaseClient;
  provider: LanguageModelProvider;
  promptRegistry: PromptRegistry;
  quotaGuard: QuotaGuard;
  pricing?: ModelPricingTable;
  maxRepairs?: number;
  now?: () => Date;
}): ReturnType<typeof createModelCallGenerationHandler<ObjectiveOutputV1>> {
  const options: ModelCallHandlerOptions<ObjectiveOutputV1> = {
    jobType: "objectives.generate",
    payloadVersion: 1,
    operationType: "ai.objectives",
    outputSchema: objectiveOutputV1Schema,
    provider: input.provider,
    promptRegistry: input.promptRegistry,
    quotaGuard: input.quotaGuard,
    database: input.database,
    deterministicChecks: assertObjectiveDeterministicChecks,
    persistCandidate: (candidate) =>
      persistObjectiveSet({
        executor: input.database,
        output: candidate.value,
        sourcePackage: candidate.sourcePackage,
        snapshot: candidate.snapshot,
        params: candidate.params,
        modelCall: candidate.modelCall,
        context: candidate.context,
        now: candidate.now,
      }),
    ...(input.pricing === undefined ? {} : { pricing: input.pricing }),
    ...(input.maxRepairs === undefined
      ? {}
      : { maxRepairs: input.maxRepairs }),
    ...(input.now === undefined ? {} : { now: input.now }),
  };
  return createModelCallGenerationHandler<ObjectiveOutputV1>(options);
}
