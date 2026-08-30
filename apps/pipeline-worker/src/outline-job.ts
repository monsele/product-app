import { createHash } from "node:crypto";
import { createId, serializeUtcTimestamp, type Identifier } from "@avlp/config";
import {
  learningObjectiveSets,
  learningObjectives,
  lessonOutlineItems,
  lessonOutlineSets,
  outlineObjectiveLinks,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import { JobExecutionError } from "@avlp/jobs";
import {
  type LanguageModelProvider,
  type ModelPricingTable,
  type PromptRegistry,
  type QuotaGuard,
} from "@avlp/provider-adapters";
import {
  lessonOutlineSetSchema,
  minimumOutlineItemsForTarget,
  outlineDurationToleranceRatio,
  outlineGenerationParamsSchema,
  outlineOutputV1Schema,
  type LessonOutlineSet,
  type ModelCallParams,
  type ModelCallRecord,
  type OutlineGenerationParams,
  type OutlineOutputV1,
  type SourcePackage,
  type SourceRef,
  type SourceSnapshot,
} from "@avlp/schemas";
import { and, eq } from "drizzle-orm";
import { createModelCallGenerationHandler, type ModelCallHandlerOptions } from "./model-call.js";
import { resolveObjectiveSourceRefs as resolveSourceRefs } from "./objectives-job.js";

/**
 * Deterministic outline rule failure. The job classifies this as a terminal
 * deterministic failure so uncovered objectives, invalid citations, broken
 * sequences, or an out-of-tolerance duration are never silently accepted.
 */
export class OutlineDeterministicCheckError extends Error {
  public readonly code:
    | "OBJECTIVE_UNCOVERED"
    | "UNSUPPORTED_SOURCE_BLOCK"
    | "INVALID_SEQUENCE"
    | "RECALL_QUESTION_MISSING"
    | "DURATION_OUT_OF_TOLERANCE"
    | "ITEM_COUNT_TOO_LOW";

  public constructor(
    code: OutlineDeterministicCheckError["code"],
    message: string,
  ) {
    super(message);
    this.name = "OutlineDeterministicCheckError";
    this.code = code;
  }
}

/** Approved objectives and configuration available to outline checks. */
export type OutlineOperationContext = {
  objectives: readonly { id: Identifier; statement: string }[];
  objectiveSetContentHash: string;
  params: OutlineGenerationParams;
};

export type ApprovedObjectiveSetResult =
  | {
      status: "ok";
      set: {
        id: Identifier;
        contentHash: string;
        sourceSnapshotId: Identifier;
        objectives: readonly { id: Identifier; statement: string }[];
      };
    }
  | {
      status:
        | "missing"
        | "not_approved"
        | "revision_mismatch"
        | "snapshot_mismatch";
    };

/**
 * Deterministic SHA-256 of the approved objective statements, bound to the
 * exact approved objective revision the outline must cover.
 */
export function computeObjectiveSetContentHash(
  objectives: readonly { id: Identifier; statement: string }[],
): string {
  const canonical = JSON.stringify(
    [...objectives]
      .map((objective) => ({
        id: objective.id,
        statement: objective.statement,
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Loads the approved objective set for a tenant and verifies it is the exact
 * approved revision and source snapshot referenced by the outline payload.
 */
export async function loadApprovedObjectiveSet(input: {
  executor: DatabaseExecutor;
  ownerUserId: Identifier;
  projectId: Identifier;
  objectiveSetId: Identifier;
  expectedRevision: number;
  sourceSnapshotId: Identifier;
}): Promise<ApprovedObjectiveSetResult> {
  const [row] = await input.executor
    .select()
    .from(learningObjectiveSets)
    .where(
      and(
        eq(learningObjectiveSets.id, input.objectiveSetId),
        eq(learningObjectiveSets.ownerUserId, input.ownerUserId),
        eq(learningObjectiveSets.projectId, input.projectId),
      ),
    )
    .limit(1);
  if (row === undefined) return { status: "missing" };
  if (row.status !== "approved") return { status: "not_approved" };
  if (row.revision !== input.expectedRevision)
    return { status: "revision_mismatch" };
  if (row.sourceSnapshotId !== input.sourceSnapshotId)
    return { status: "snapshot_mismatch" };
  const objectiveRows = await input.executor
    .select({
      id: learningObjectives.id,
      statement: learningObjectives.statement,
    })
    .from(learningObjectives)
    .where(
      and(
        eq(learningObjectives.setId, row.id),
        eq(learningObjectives.ownerUserId, input.ownerUserId),
        eq(learningObjectives.projectId, input.projectId),
      ),
    )
    .orderBy(learningObjectives.order);
  const objectives = objectiveRows.map((objective) => ({
    id: objective.id as Identifier,
    statement: objective.statement,
  }));
  return {
    status: "ok",
    set: {
      id: row.id as Identifier,
      contentHash: computeObjectiveSetContentHash(objectives),
      sourceSnapshotId: row.sourceSnapshotId as Identifier,
      objectives,
    },
  };
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
 * Deterministic outline rules: every approved objective is covered, every
 * citation resolves to a block in the approved source package, the sequence
 * opens with a hook and closes with a summary with concepts and examples in
 * between, the optional recall question honors the configuration, the item
 * count leaves the lesson storyboardable, and the total estimated duration fits
 * the configured tolerance. Throws on the first violation; a valid draft must
 * clear every rule.
 */
export function assertOutlineDeterministicChecks(
  output: OutlineOutputV1,
  sourcePackage: SourcePackage,
  operationContext: OutlineOperationContext | undefined,
): void {
  if (operationContext === undefined)
    throw new OutlineDeterministicCheckError(
      "OBJECTIVE_UNCOVERED",
      "The outline operation context is missing the approved objectives.",
    );
  const { objectives, params } = operationContext;
  const valid = collectPackageBlockIds(sourcePackage);
  const linkedObjectiveIds = new Set<string>();
  const knownObjectiveIds = new Set(objectives.map((objective) => objective.id));
  for (const [index, item] of output.items.entries()) {
    if (item.objectiveIds.length === 0)
      throw new OutlineDeterministicCheckError(
        "OBJECTIVE_UNCOVERED",
        `items[${index}] does not map to any approved objective.`,
      );
    for (const objectiveId of item.objectiveIds) {
      if (!knownObjectiveIds.has(objectiveId))
        throw new OutlineDeterministicCheckError(
          "OBJECTIVE_UNCOVERED",
          `items[${index}] maps to an unknown objective ${objectiveId}.`,
        );
      linkedObjectiveIds.add(objectiveId);
    }
    for (const blockId of item.sourceBlockIds)
      if (!valid.has(blockId))
        throw new OutlineDeterministicCheckError(
          "UNSUPPORTED_SOURCE_BLOCK",
          `items[${index}] cites unsupported source block ${blockId}.`,
        );
  }
  const uncovered = objectives.filter(
    (objective) => !linkedObjectiveIds.has(objective.id),
  );
  if (uncovered.length > 0)
    throw new OutlineDeterministicCheckError(
      "OBJECTIVE_UNCOVERED",
      `Approved objectives are uncovered: ${uncovered
        .map((objective) => objective.id)
        .join(", ")}.`,
    );
  const first = output.items[0]!;
  const last = output.items[output.items.length - 1]!;
  if (first.kind !== "hook" || last.kind !== "summary")
    throw new OutlineDeterministicCheckError(
      "INVALID_SEQUENCE",
      "The outline must open with a hook and close with a summary.",
    );
  if (!output.items.some((item) => item.kind === "concept"))
    throw new OutlineDeterministicCheckError(
      "INVALID_SEQUENCE",
      "The outline must include at least one concept item.",
    );
  if (!output.items.some((item) => item.kind === "example"))
    throw new OutlineDeterministicCheckError(
      "INVALID_SEQUENCE",
      "The outline must include at least one example item.",
    );
  if (output.targetDurationSeconds !== params.targetDurationSeconds)
    throw new OutlineDeterministicCheckError(
      "INVALID_SEQUENCE",
      "The outline target duration must match the lesson configuration.",
    );
  if (
    params.includeRecallQuestions &&
    !output.items.some((item) => item.kind === "recall_question")
  )
    throw new OutlineDeterministicCheckError(
      "RECALL_QUESTION_MISSING",
      "The configuration requests a recall question.",
    );
  // Each item becomes exactly one narration block and every block lands in one
  // scene of at most 60s, so too few items make the storyboard step impossible
  // however the storyboard model splits them. Catch that here rather than after
  // the outline has been approved and narrated.
  const minimumItems = minimumOutlineItemsForTarget(
    params.targetDurationSeconds,
  );
  if (output.items.length < minimumItems)
    throw new OutlineDeterministicCheckError(
      "ITEM_COUNT_TOO_LOW",
      `The outline has ${output.items.length} items; a ${params.targetDurationSeconds}s lesson needs at least ${minimumItems} to be storyboarded.`,
    );
  const total = output.items.reduce(
    (sum, item) => sum + item.estimatedSeconds,
    0,
  );
  const lower = Math.floor(
    params.targetDurationSeconds * (1 - outlineDurationToleranceRatio),
  );
  const upper = Math.ceil(
    params.targetDurationSeconds * (1 + outlineDurationToleranceRatio),
  );
  if (total < lower || total > upper)
    throw new OutlineDeterministicCheckError(
      "DURATION_OUT_OF_TOLERANCE",
      `Total estimated ${total}s is outside the ${lower}-${upper}s tolerance for the ${params.targetDurationSeconds}s target.`,
    );
}

/**
 * Idempotent draft-set persistence: one set per (owner, project, job
 * idempotency key). A retried job returns the already-created set instead of
 * duplicating the result record.
 */
export async function persistOutlineSet(input: {
  executor: DatabaseExecutor;
  output: OutlineOutputV1;
  sourcePackage: SourcePackage;
  snapshot: SourceSnapshot;
  params: ModelCallParams;
  modelCall: ModelCallRecord;
  operationContext: unknown;
  context: {
    ownerUserId: Identifier;
    projectId: Identifier;
    idempotencyKey: string;
  };
  now: Date;
}): Promise<{ id: Identifier }> {
  const params = outlineGenerationParamsSchema.parse(input.params);
  const operationContext = input.operationContext as
    | OutlineOperationContext
    | undefined;
  if (operationContext === undefined || operationContext.objectives.length === 0)
    throw new Error(
      "The outline operation context is missing the approved objectives.",
    );
  const timestamp = input.now;
  const setId = createId(timestamp);
  const sourceRefsFor = (blockIds: readonly string[]): SourceRef[] =>
    resolveSourceRefs(input.sourcePackage, blockIds);
  const set: LessonOutlineSet = lessonOutlineSetSchema.parse({
    schemaVersion: 1,
    id: setId,
    projectId: input.context.projectId,
    sourceSnapshotId: input.snapshot.id,
    sourceSnapshotContentHash: input.snapshot.contentHash,
    objectiveSetId: params.objectiveSetId,
    objectiveSetContentHash: operationContext.objectiveSetContentHash,
    configurationVersion: params.configurationVersion,
    promptId: input.modelCall.promptId,
    promptVersion: input.modelCall.promptVersion,
    model: input.modelCall.model,
    modelCallId: input.modelCall.id,
    status: "draft",
    revision: 0,
    items: input.output.items.map((item, index) => ({
      id: createId(timestamp),
      order: index + 1,
      kind: item.kind,
      title: item.title,
      description: item.description,
      estimatedSeconds: item.estimatedSeconds,
      sourceRefs: sourceRefsFor(item.sourceBlockIds),
      objectiveIds: item.objectiveIds,
      framingNote: item.framingNote ?? null,
      generated: true,
      revision: 0,
    })),
    totalEstimatedSeconds: input.output.items.reduce(
      (sum, item) => sum + item.estimatedSeconds,
      0,
    ),
    generatedAt: serializeUtcTimestamp(timestamp),
    createdAt: serializeUtcTimestamp(timestamp),
  });

  return input.executor.transaction(async (transaction) => {
    const [created] = await transaction
      .insert(lessonOutlineSets)
      .values({
        id: setId,
        projectId: input.context.projectId,
        ownerUserId: input.context.ownerUserId,
        sourceSnapshotId: input.snapshot.id,
        sourceSnapshotContentHash: input.snapshot.contentHash,
        objectiveSetId: set.objectiveSetId,
        objectiveSetContentHash: set.objectiveSetContentHash,
        configurationVersion: set.configurationVersion,
        promptId: set.promptId,
        promptVersion: set.promptVersion,
        model: set.model,
        modelCallId: set.modelCallId,
        status: set.status,
        revision: 0,
        idempotencyKey: input.context.idempotencyKey,
        totalEstimatedSeconds: set.totalEstimatedSeconds,
        generatedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing({
        target: [
          lessonOutlineSets.ownerUserId,
          lessonOutlineSets.projectId,
          lessonOutlineSets.idempotencyKey,
        ],
      })
      .returning({ id: lessonOutlineSets.id });
    if (created !== undefined) {
      await transaction.insert(lessonOutlineItems).values(
        set.items.map((item) => ({
          id: item.id,
          projectId: input.context.projectId,
          ownerUserId: input.context.ownerUserId,
          setId,
          order: item.order,
          kind: item.kind,
          title: item.title,
          description: item.description,
          estimatedSeconds: item.estimatedSeconds,
          sourceRefs: item.sourceRefs,
          framingNote: item.framingNote,
          generated: item.generated,
          revision: item.revision,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      );
      await transaction.insert(outlineObjectiveLinks).values(
        set.items.flatMap((item) =>
          item.objectiveIds.map((objectiveId) => ({
            id: createId(timestamp),
            projectId: input.context.projectId,
            ownerUserId: input.context.ownerUserId,
            outlineItemId: item.id,
            objectiveId,
            createdAt: timestamp,
            updatedAt: timestamp,
          })),
        ),
      );
    } else {
      const [existing] = await transaction
        .select({ id: lessonOutlineSets.id })
        .from(lessonOutlineSets)
        .where(
          and(
            eq(lessonOutlineSets.ownerUserId, input.context.ownerUserId),
            eq(lessonOutlineSets.projectId, input.context.projectId),
            eq(
              lessonOutlineSets.idempotencyKey,
              input.context.idempotencyKey,
            ),
          ),
        )
        .limit(1);
      if (existing === undefined)
        throw new Error("The idempotent outline set could not be read.");
      return { id: existing.id as Identifier };
    }
    return { id: setId };
  });
}

function objectiveSetError(
  status: ApprovedObjectiveSetResult["status"],
): JobExecutionError {
  switch (status) {
    case "missing":
      return new JobExecutionError(
        "terminal",
        "OBJECTIVE_SET_NOT_FOUND",
        "The referenced approved objective set does not exist.",
      );
    case "not_approved":
      return new JobExecutionError(
        "terminal",
        "OBJECTIVE_SET_NOT_APPROVED",
        "Outline generation requires approved learning objectives.",
      );
    case "revision_mismatch":
      return new JobExecutionError(
        "terminal",
        "OBJECTIVE_SET_REVISION_MISMATCH",
        "The referenced objective set is no longer the approved revision.",
      );
    case "snapshot_mismatch":
      return new JobExecutionError(
        "terminal",
        "OBJECTIVE_SET_SNAPSHOT_MISMATCH",
        "The approved objectives reference a different source snapshot.",
      );
    default:
      return new JobExecutionError(
        "terminal",
        "OBJECTIVE_SET_INVALID",
        "The referenced approved objective set is invalid.",
      );
  }
}

/**
 * The outline generation job: the standard model-call lifecycle plus a
 * loaded approved objective set, deterministic outline rules, and idempotent
 * draft-set persistence.
 */
export function createOutlineGenerationJobHandler(input: {
  database: DatabaseClient;
  provider: LanguageModelProvider;
  promptRegistry: PromptRegistry;
  quotaGuard: QuotaGuard;
  pricing?: ModelPricingTable;
  maxRepairs?: number;
  now?: () => Date;
}): ReturnType<typeof createModelCallGenerationHandler<OutlineOutputV1>> {
  const options: ModelCallHandlerOptions<OutlineOutputV1> = {
    jobType: "outline.generate",
    payloadVersion: 1,
    operationType: "ai.outline",
    outputSchema: outlineOutputV1Schema,
    provider: input.provider,
    promptRegistry: input.promptRegistry,
    quotaGuard: input.quotaGuard,
    database: input.database,
    loadOperationContext: async ({ snapshot, params, context }) => {
      const parsedParams = outlineGenerationParamsSchema.parse(params);
      const loaded = await loadApprovedObjectiveSet({
        executor: input.database,
        ownerUserId: context.ownerUserId,
        projectId: context.projectId,
        objectiveSetId: parsedParams.objectiveSetId,
        expectedRevision: parsedParams.objectiveSetRevision,
        sourceSnapshotId: snapshot.id,
      });
      if (loaded.status !== "ok")
        throw objectiveSetError(loaded.status);
      return {
        variables: {
          objectives: JSON.stringify(loaded.set.objectives),
        },
        context: {
          objectives: loaded.set.objectives,
          objectiveSetContentHash: loaded.set.contentHash,
          params: parsedParams,
        },
      };
    },
    deterministicChecks: (value, sourcePackage, operationContext) =>
      assertOutlineDeterministicChecks(
        value,
        sourcePackage,
        operationContext as OutlineOperationContext | undefined,
      ),
    persistCandidate: (candidate) =>
      persistOutlineSet({
        executor: input.database,
        output: candidate.value,
        sourcePackage: candidate.sourcePackage,
        snapshot: candidate.snapshot,
        params: candidate.params,
        modelCall: candidate.modelCall,
        operationContext: candidate.operationContext,
        context: candidate.context,
        now: candidate.now,
      }),
    ...(input.pricing === undefined ? {} : { pricing: input.pricing }),
    ...(input.maxRepairs === undefined
      ? {}
      : { maxRepairs: input.maxRepairs }),
    ...(input.now === undefined ? {} : { now: input.now }),
  };
  return createModelCallGenerationHandler<OutlineOutputV1>(options);
}
