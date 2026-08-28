import {
  computeLessonStoryboardContentHash,
  computeLessonStoryboardSceneContentHash,
  computeNarrationBlockContentHash,
  computeNarrationSetContentHash,
  createId,
  serializeUtcTimestamp,
  type Identifier,
} from "@avlp/config";
import {
  lessonOutlineItems,
  lessonOutlineSets,
  lessonSpecs,
  narrationBlocks,
  narrationSets,
  outlineObjectiveLinks,
  scenes,
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
  lessonStoryboardSceneSchema,
  lessonStoryboardSchema,
  sceneSpecSchema,
  storyboardGenerationParamsSchema,
  storyboardOutputV1Schema,
  storyboardSceneCountMaximum,
  storyboardSceneCountMinimum,
  storyboardSceneMaximumSeconds,
  storyboardSceneMinimumSeconds,
  storyboardTemplateCatalog,
  type LessonStoryboard,
  type ModelCallParams,
  type ModelCallRecord,
  type SourcePackage,
  type StoryboardGenerationParams,
  type StoryboardOutputV1,
} from "@avlp/schemas";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  createModelCallGenerationHandler,
  type ModelCallHandlerOptions,
} from "./model-call.js";
import { computeOutlineSetContentHash } from "./narration-job.js";
import { resolveObjectiveSourceRefs as resolveSourceRefs } from "./objectives-job.js";

/**
 * Deterministic storyboard rule failure. The job classifies this as a terminal
 * deterministic failure so an invalid scene, uncovered narration block,
 * ungrounded scene, unsupported citation, or unreachable duration is never
 * saved as a draft.
 */
export class StoryboardDeterministicCheckError extends Error {
  public readonly code:
    | "TARGET_DURATION_MISMATCH"
    | "SCENE_COUNT_OUT_OF_BOUNDS"
    | "SCENE_UNGROUNDED"
    | "UNSUPPORTED_SOURCE_BLOCK"
    | "BLOCK_UNASSIGNED"
    | "BLOCK_ASSIGNED_MULTIPLE_TIMES"
    | "BLOCK_ORDER_VIOLATED"
    | "OUTLINE_ITEM_UNCOVERED"
    | "DURATION_UNREACHABLE";

  public constructor(
    code: StoryboardDeterministicCheckError["code"],
    message: string,
  ) {
    super(message);
    this.name = "StoryboardDeterministicCheckError";
    this.code = code;
  }
}

/** Approved narration, its bound outline, and configuration for one storyboard. */
export type StoryboardOperationContext = {
  params: StoryboardGenerationParams;
  narrationSet: {
    id: Identifier;
    revision: number;
    contentHash: string;
    sourceSnapshotId: Identifier;
    blocks: readonly {
      id: Identifier;
      outlineItemId: Identifier;
      order: number;
      text: string;
      estimatedWords: number;
      targetSeconds: number;
    }[];
  };
  outlineSet: {
    id: Identifier;
    contentHash: string;
    items: readonly {
      id: Identifier;
      order: number;
      kind: string;
      title: string;
      description: string;
      estimatedSeconds: number;
      objectiveIds: readonly Identifier[];
    }[];
  };
};

export type LoadedStoryboardContext =
  | { status: "ok"; context: StoryboardOperationContext }
  | { status: "narration_set_missing" }
  | { status: "narration_set_revision_mismatch" }
  | { status: "outline_set_missing" }
  | { status: "outline_set_not_approved" }
  | { status: "outline_set_hash_mismatch" };

/**
 * Loads the working narration set, its ordered blocks, and the approved
 * outline the narration was bound to, all tenant-scoped. The narration set
 * revision must match the request, the outline must still be approved, and its
 * content hash must equal the hash the narration set was bound to.
 */
export async function loadStoryboardOperationContext(input: {
  executor: DatabaseExecutor;
  ownerUserId: Identifier;
  projectId: Identifier;
  params: StoryboardGenerationParams;
}): Promise<LoadedStoryboardContext> {
  const [setRow] = await input.executor
    .select()
    .from(narrationSets)
    .where(
      and(
        eq(narrationSets.id, input.params.narrationSetId),
        eq(narrationSets.ownerUserId, input.ownerUserId),
        eq(narrationSets.projectId, input.projectId),
      ),
    )
    .limit(1);
  if (setRow === undefined) return { status: "narration_set_missing" };
  if (setRow.revision !== input.params.narrationSetRevision)
    return { status: "narration_set_revision_mismatch" };
  const blockRows = await input.executor
    .select()
    .from(narrationBlocks)
    .where(
      and(
        eq(narrationBlocks.setId, setRow.id),
        eq(narrationBlocks.ownerUserId, input.ownerUserId),
        eq(narrationBlocks.projectId, input.projectId),
      ),
    )
    .orderBy(narrationBlocks.order);
  const blocks = blockRows.map((block) => ({
    id: block.id as Identifier,
    outlineItemId: block.outlineItemId as Identifier,
    order: block.order,
    text: block.text,
    estimatedWords: block.estimatedWords,
    targetSeconds: block.targetSeconds,
  }));
  const contentHash = computeNarrationSetContentHash(
    blockRows.map((block) => ({
      contentHash: computeNarrationBlockContentHash({
        text: block.text,
        sourceRefs: block.sourceRefs as readonly unknown[],
        generatedAdditions: block.generatedAdditions as readonly unknown[],
        generated: block.generated,
      }),
    })),
    setRow.totalEstimatedSeconds,
  );
  const outline = await loadApprovedOutlineBoundToNarration({
    executor: input.executor,
    ownerUserId: input.ownerUserId,
    projectId: input.projectId,
    outlineSetId: setRow.outlineSetId,
    expectedContentHash: setRow.outlineSetContentHash,
  });
  if (outline === undefined) {
    const [outlineRow] = await input.executor
      .select({ status: lessonOutlineSets.status })
      .from(lessonOutlineSets)
      .where(
        and(
          eq(lessonOutlineSets.id, setRow.outlineSetId),
          eq(lessonOutlineSets.ownerUserId, input.ownerUserId),
          eq(lessonOutlineSets.projectId, input.projectId),
        ),
      )
      .limit(1);
    if (outlineRow === undefined) return { status: "outline_set_missing" };
    if (outlineRow.status !== "approved")
      return { status: "outline_set_not_approved" };
    return { status: "outline_set_hash_mismatch" };
  }
  return {
    status: "ok",
    context: {
      params: input.params,
      narrationSet: {
        id: setRow.id as Identifier,
        revision: setRow.revision,
        contentHash,
        sourceSnapshotId: setRow.sourceSnapshotId as Identifier,
        blocks,
      },
      outlineSet: {
        id: outline.set.id as Identifier,
        contentHash: outline.set.contentHash,
        items: outline.items,
      },
    },
  };
}

type ApprovedOutlineForStoryboard = {
  set: {
    id: Identifier;
    contentHash: string;
  };
  items: readonly {
    id: Identifier;
    order: number;
    kind: string;
    title: string;
    description: string;
    estimatedSeconds: number;
    objectiveIds: readonly Identifier[];
  }[];
};

async function loadApprovedOutlineBoundToNarration(input: {
  executor: DatabaseExecutor;
  ownerUserId: Identifier;
  projectId: Identifier;
  outlineSetId: Identifier;
  expectedContentHash: string;
}): Promise<ApprovedOutlineForStoryboard | undefined> {
  const [setRow] = await input.executor
    .select()
    .from(lessonOutlineSets)
    .where(
      and(
        eq(lessonOutlineSets.id, input.outlineSetId),
        eq(lessonOutlineSets.ownerUserId, input.ownerUserId),
        eq(lessonOutlineSets.projectId, input.projectId),
        eq(lessonOutlineSets.status, "approved"),
      ),
    )
    .limit(1);
  if (setRow === undefined) return undefined;
  if (setRow.status !== "approved") return undefined;
  const itemRows = await input.executor
    .select({
      id: lessonOutlineItems.id,
      order: lessonOutlineItems.order,
      kind: lessonOutlineItems.kind,
      title: lessonOutlineItems.title,
      description: lessonOutlineItems.description,
      estimatedSeconds: lessonOutlineItems.estimatedSeconds,
    })
    .from(lessonOutlineItems)
    .where(
      and(
        eq(lessonOutlineItems.setId, setRow.id),
        eq(lessonOutlineItems.ownerUserId, input.ownerUserId),
        eq(lessonOutlineItems.projectId, input.projectId),
      ),
    )
    .orderBy(lessonOutlineItems.order);
  const items = itemRows.map((item) => ({
    id: item.id as Identifier,
    order: item.order,
    kind: item.kind,
    title: item.title,
    description: item.description,
    estimatedSeconds: item.estimatedSeconds,
  }));
  if (computeOutlineSetContentHash(items) !== input.expectedContentHash)
    return undefined;
  const objectiveLinks =
    itemRows.length === 0
      ? []
      : await input.executor
          .select({
            outlineItemId: outlineObjectiveLinks.outlineItemId,
            objectiveId: outlineObjectiveLinks.objectiveId,
          })
          .from(outlineObjectiveLinks)
          .where(
            and(
              inArray(outlineObjectiveLinks.outlineItemId, itemRows.map((item) => item.id)),
              eq(outlineObjectiveLinks.ownerUserId, input.ownerUserId),
              eq(outlineObjectiveLinks.projectId, input.projectId),
            ),
          );
  const objectiveIdsByItem = new Map<string, string[]>();
  for (const link of objectiveLinks) {
    const current = objectiveIdsByItem.get(link.outlineItemId) ?? [];
    current.push(link.objectiveId);
    objectiveIdsByItem.set(link.outlineItemId, current);
  }
  return {
    set: { id: setRow.id as Identifier, contentHash: input.expectedContentHash },
    items: items.map((item) => ({
      ...item,
      objectiveIds: (objectiveIdsByItem.get(item.id) ?? []) as readonly Identifier[],
    })),
  };
}

function collectPackageBlockIds(sourcePackage: SourcePackage): Set<string> {
  return new Set(
    sourcePackage.sections.flatMap((section) =>
      section.blocks.map((block) => block.blockId),
    ),
  );
}

/**
 * Deterministic scene-duration allocator. The model's per-scene estimates are
 * clamped to [3, 60]s, scaled to the target total, and rounded so the sum
 * equals the target exactly. The target must be reachable with the scene
 * count; otherwise an impossible duration is rejected before persistence.
 */
export function allocateStoryboardDurations(input: {
  scenes: readonly { estimatedSeconds: number }[];
  target: number;
}): { durations: readonly number[] } {
  const count = input.scenes.length;
  const minimum = storyboardSceneMinimumSeconds;
  const maximum = storyboardSceneMaximumSeconds;
  if (input.target < count * minimum || input.target > count * maximum)
    throw new StoryboardDeterministicCheckError(
      "DURATION_UNREACHABLE",
      `The lesson target of ${input.target}s cannot be split into ${count} scenes of ${minimum}-${maximum}s each.`,
    );
  const sum = (values: readonly number[]): number =>
    values.reduce((total, value) => total + value, 0);
  const clamp = (value: number): number =>
    Math.min(maximum, Math.max(minimum, Math.round(value)));
  let durations = input.scenes.map((scene) => clamp(scene.estimatedSeconds));
  for (let attempt = 0; attempt < 20 && sum(durations) !== input.target; attempt += 1) {
    const factor = input.target / Math.max(1, sum(durations));
    durations = durations.map((duration) => clamp(duration * factor));
  }
  let guard = 0;
  if (sum(durations) > input.target) {
    while (sum(durations) > input.target && guard < 10_000) {
      let largestIndex = -1;
      for (let index = 0; index < durations.length; index += 1)
        if (
          durations[index]! > minimum &&
          (largestIndex === -1 || durations[index]! > durations[largestIndex]!)
        )
          largestIndex = index;
      if (largestIndex === -1) break;
      durations[largestIndex] = durations[largestIndex]! - 1;
      guard += 1;
    }
  } else if (sum(durations) < input.target) {
    while (sum(durations) < input.target && guard < 10_000) {
      let smallestIndex = -1;
      for (let index = 0; index < durations.length; index += 1)
        if (
          durations[index]! < maximum &&
          (smallestIndex === -1 || durations[index]! < durations[smallestIndex]!)
        )
          smallestIndex = index;
      if (smallestIndex === -1) break;
      durations[smallestIndex] = durations[smallestIndex]! + 1;
      guard += 1;
    }
  }
  if (sum(durations) !== input.target)
    throw new StoryboardDeterministicCheckError(
      "DURATION_UNREACHABLE",
      `Scene durations could not be allocated to exactly ${input.target}s.`,
    );
  return { durations };
}

/**
 * Deterministic storyboard rules: the target duration must match the lesson
 * configuration, the scene count must fit the supported bounds, the scenes
 * must cover every approved narration block exactly once in order, every scene
 * must be grounded (citations or a generated addition), every citation must
 * resolve to the bounded source package, and the scene durations must be
 * allocatable to the target. Throws on the first violation.
 */
export function assertStoryboardDeterministicChecks(
  output: StoryboardOutputV1,
  sourcePackage: SourcePackage,
  operationContext: StoryboardOperationContext | undefined,
): void {
  if (operationContext === undefined)
    throw new StoryboardDeterministicCheckError(
      "OUTLINE_ITEM_UNCOVERED",
      "The storyboard operation context is missing the approved narration and outline.",
    );
  if (output.targetDurationSeconds !== operationContext.params.targetDurationSeconds)
    throw new StoryboardDeterministicCheckError(
      "TARGET_DURATION_MISMATCH",
      `The storyboard target (${output.targetDurationSeconds}s) must match the lesson configuration (${operationContext.params.targetDurationSeconds}s).`,
    );
  if (
    output.scenes.length < storyboardSceneCountMinimum ||
    output.scenes.length > storyboardSceneCountMaximum
  )
    throw new StoryboardDeterministicCheckError(
      "SCENE_COUNT_OUT_OF_BOUNDS",
      `The storyboard has ${output.scenes.length} scenes; ${storyboardSceneCountMinimum}-${storyboardSceneCountMaximum} are supported.`,
    );
  const valid = collectPackageBlockIds(sourcePackage);
  const orderedBlockIds = operationContext.narrationSet.blocks.map(
    (block) => block.id,
  );
  const assigned: string[] = [];
  const seen = new Set<string>();
  for (const [sceneIndex, scene] of output.scenes.entries()) {
    for (const blockId of scene.narrationBlockIds) {
      if (!orderedBlockIds.includes(blockId))
        throw new StoryboardDeterministicCheckError(
          "BLOCK_UNASSIGNED",
          `scenes[${sceneIndex}] references narration block ${blockId} that is not in the approved narration set.`,
        );
      if (seen.has(blockId))
        throw new StoryboardDeterministicCheckError(
          "BLOCK_ASSIGNED_MULTIPLE_TIMES",
          `scenes[${sceneIndex}] assigns narration block ${blockId} to more than one scene.`,
        );
      seen.add(blockId);
      assigned.push(blockId);
    }
    if (scene.sourceBlockIds.length === 0)
      throw new StoryboardDeterministicCheckError(
        "SCENE_UNGROUNDED",
        `scenes[${sceneIndex}] must cite at least one source block.`,
      );
    for (const blockId of scene.sourceBlockIds)
      if (!valid.has(blockId))
        throw new StoryboardDeterministicCheckError(
          "UNSUPPORTED_SOURCE_BLOCK",
          `scenes[${sceneIndex}] cites unsupported source block ${blockId}.`,
        );
  }
  if (assigned.length !== orderedBlockIds.length)
    throw new StoryboardDeterministicCheckError(
      "BLOCK_UNASSIGNED",
      `The storyboard assigns ${assigned.length} of ${orderedBlockIds.length} approved narration blocks.`,
    );
  for (let index = 0; index < orderedBlockIds.length; index += 1)
    if (assigned[index] !== orderedBlockIds[index])
      throw new StoryboardDeterministicCheckError(
        "BLOCK_ORDER_VIOLATED",
        `Scenes must cover the narration blocks in order; narration block ${orderedBlockIds[index]} is expected at position ${index + 1}.`,
      );
  const coveredOutlineItemIds = new Set(
    operationContext.narrationSet.blocks.map((block) => block.outlineItemId),
  );
  for (const item of operationContext.outlineSet.items)
    if (!coveredOutlineItemIds.has(item.id))
      throw new StoryboardDeterministicCheckError(
        "OUTLINE_ITEM_UNCOVERED",
        `Approved outline item ${item.id} has no narration in the bound narration set.`,
      );
  allocateStoryboardDurations({
    scenes: output.scenes,
    target: output.targetDurationSeconds,
  });
}

/**
 * Idempotent storyboard persistence: one lesson spec per (owner, project, job
 * idempotency key). A retried job returns the already-created draft instead of
 * duplicating the result. The canonical payload and the normalized scene rows
 * are written in the same transaction.
 */
export async function persistLessonStoryboard(input: {
  executor: DatabaseExecutor;
  output: StoryboardOutputV1;
  sourcePackage: SourcePackage;
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
  try {
    return await persistLessonStoryboardDraft(input);
  } catch (error) {
    // Schema-level failures here are deterministic: the same output will fail
    // on every retry, so classify them terminal instead of retrying forever.
    if (error instanceof z.ZodError)
      throw new JobExecutionError(
        "terminal",
        "STORYBOARD_INVALID_FOR_PERSIST",
        "The validated storyboard scenes could not be persisted.",
      );
    throw error;
  }
}

async function persistLessonStoryboardDraft(input: {
  executor: DatabaseExecutor;
  output: StoryboardOutputV1;
  sourcePackage: SourcePackage;
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
  const params = storyboardGenerationParamsSchema.parse(input.params);
  const operationContext = input.operationContext as
    | StoryboardOperationContext
    | undefined;
  if (
    operationContext === undefined ||
    operationContext.narrationSet.blocks.length === 0
  )
    throw new Error(
      "The storyboard operation context is missing the approved narration blocks.",
    );
  const timestamp = input.now;
  const allocation = allocateStoryboardDurations({
    scenes: input.output.scenes,
    target: input.output.targetDurationSeconds,
  });
  const blockById = new Map(
    operationContext.narrationSet.blocks.map((block) => [block.id, block]),
  );
  const scenesOutput = input.output.scenes.map((scene, index) => {
    const narration = scene.narrationBlockIds
      .map((blockId) => blockById.get(blockId)?.text ?? "")
      .filter((text) => text.length > 0)
      .join(" ");
    const sourceRefs = resolveSourceRefs(
      input.sourcePackage,
      scene.sourceBlockIds,
    );
    const sceneSpec = sceneSpecSchema.parse({
      id: createId(timestamp),
      order: index + 1,
      title: scene.title,
      narration,
      durationSeconds: allocation.durations[index],
      onScreenText: scene.onScreenText,
      transition: scene.transition,
      assetBindings: [],
      sourceRefs,
      generatedAdditions: scene.generatedAdditions,
      template: scene.template,
      visual: scene.visual,
    });
    return lessonStoryboardSceneSchema.parse({
      id: sceneSpec.id,
      stableSceneId: sceneSpec.id,
      order: sceneSpec.order,
      template: sceneSpec.template,
      durationSeconds: sceneSpec.durationSeconds,
      narrationBlockIds: scene.narrationBlockIds,
      assetRequirements: scene.assetRequirements,
      scene: sceneSpec,
    });
  });
  const totalDurationSeconds = scenesOutput.reduce(
    (sum, scene) => sum + scene.durationSeconds,
    0,
  );
  const objectiveIds = [
    ...new Set(
      operationContext.outlineSet.items.flatMap((item) => item.objectiveIds),
    ),
  ];
  if (objectiveIds.length === 0)
    throw new StoryboardDeterministicCheckError(
      "OUTLINE_ITEM_UNCOVERED",
      "The approved outline covers no learning objectives.",
    );
  const storyboard: LessonStoryboard = lessonStoryboardSchema.parse({
    schemaVersion: 1,
    id: createId(timestamp),
    projectId: input.context.projectId,
    basedOnNarrationSetId: params.narrationSetId,
    narrationSetContentHash: operationContext.narrationSet.contentHash,
    outlineSetId: operationContext.outlineSet.id,
    outlineSetContentHash: operationContext.outlineSet.contentHash,
    configurationVersion: params.configurationVersion,
    promptId: input.modelCall.promptId,
    promptVersion: input.modelCall.promptVersion,
    model: input.modelCall.model,
    modelCallId: input.modelCall.id,
    status: "draft",
    revision: 0,
    title: params.lessonTitle,
    subject: params.subject,
    targetDurationSeconds: params.targetDurationSeconds,
    totalDurationSeconds,
    objectiveIds,
    contentHash: computeLessonStoryboardContentHash({
      totalDurationSeconds,
      objectiveIds,
      scenes: scenesOutput.map((scene) => ({
        contentHash: computeLessonStoryboardSceneContentHash({
          template: scene.scene.template,
          title: scene.scene.title,
          narration: scene.scene.narration,
          durationSeconds: scene.scene.durationSeconds,
          onScreenText: scene.scene.onScreenText,
          transition: scene.scene.transition,
          visual: scene.scene.visual,
          sourceRefs: scene.scene.sourceRefs,
          generatedAdditions: scene.scene.generatedAdditions,
          assetBindings: scene.scene.assetBindings,
        }),
        narrationBlockIds: scene.narrationBlockIds,
        assetRequirements: scene.assetRequirements,
      })),
    }),
    scenes: scenesOutput,
    generatedAt: serializeUtcTimestamp(timestamp),
    createdAt: serializeUtcTimestamp(timestamp),
  });

  return input.executor.transaction(async (transaction) => {
    const [created] = await transaction
      .insert(lessonSpecs)
      .values({
        id: storyboard.id,
        projectId: input.context.projectId,
        ownerUserId: input.context.ownerUserId,
        schemaVersion: "storyboard-v1",
        basedOnNarrationSetId: storyboard.basedOnNarrationSetId,
        narrationSetContentHash: storyboard.narrationSetContentHash,
        outlineSetId: storyboard.outlineSetId,
        outlineSetContentHash: storyboard.outlineSetContentHash,
        configurationVersion: storyboard.configurationVersion,
        promptId: storyboard.promptId,
        promptVersion: storyboard.promptVersion,
        model: storyboard.model,
        modelCallId: storyboard.modelCallId,
        status: storyboard.status,
        revision: storyboard.revision,
        idempotencyKey: input.context.idempotencyKey,
        title: storyboard.title,
        subject: storyboard.subject,
        targetDurationSeconds: storyboard.targetDurationSeconds,
        totalDurationSeconds: storyboard.totalDurationSeconds,
        objectiveIds: storyboard.objectiveIds,
        contentHash: storyboard.contentHash,
        payload: storyboard,
        generatedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing({
        target: [
          lessonSpecs.ownerUserId,
          lessonSpecs.projectId,
          lessonSpecs.idempotencyKey,
        ],
      })
      .returning({ id: lessonSpecs.id });
    if (created !== undefined) {
      await transaction.insert(scenes).values(
        storyboard.scenes.map((scene, index) => ({
          id: scene.id,
          projectId: input.context.projectId,
          ownerUserId: input.context.ownerUserId,
          lessonSpecId: storyboard.id,
          stableSceneId: scene.stableSceneId,
          order: index + 1,
          template: scene.template,
          durationSeconds: scene.durationSeconds,
          narrationBlockIds: scene.narrationBlockIds,
          assetRequirements: scene.assetRequirements,
          sceneJson: scene.scene,
          revision: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        })),
      );
    } else {
      const [existing] = await transaction
        .select({ id: lessonSpecs.id })
        .from(lessonSpecs)
        .where(
          and(
            eq(lessonSpecs.ownerUserId, input.context.ownerUserId),
            eq(lessonSpecs.projectId, input.context.projectId),
            eq(lessonSpecs.idempotencyKey, input.context.idempotencyKey),
          ),
        )
        .limit(1);
      if (existing === undefined)
        throw new Error("The idempotent lesson spec could not be read.");
      return { id: existing.id as Identifier };
    }
    return { id: storyboard.id };
  });
}

function storyboardContextError(
  status: Exclude<LoadedStoryboardContext["status"], "ok">,
): JobExecutionError {
  switch (status) {
    case "narration_set_missing":
      return new JobExecutionError(
        "terminal",
        "NARRATION_SET_NOT_FOUND",
        "The referenced narration set does not exist.",
      );
    case "narration_set_revision_mismatch":
      return new JobExecutionError(
        "terminal",
        "NARRATION_SET_REVISION_MISMATCH",
        "The narration changed after this storyboard was requested.",
      );
    case "outline_set_missing":
      return new JobExecutionError(
        "terminal",
        "OUTLINE_SET_NOT_FOUND",
        "The approved outline the narration is bound to does not exist.",
      );
    case "outline_set_not_approved":
      return new JobExecutionError(
        "terminal",
        "OUTLINE_SET_NOT_APPROVED",
        "Storyboard generation requires an approved lesson outline.",
      );
    case "outline_set_hash_mismatch":
      return new JobExecutionError(
        "terminal",
        "OUTLINE_SET_HASH_MISMATCH",
        "The approved outline changed after the narration was generated.",
      );
    default:
      return new JobExecutionError(
        "terminal",
        "STORYBOARD_CONTEXT_INVALID",
        "The storyboard operation context is invalid.",
      );
  }
}

/**
 * The storyboard generation job: the standard model-call lifecycle plus the
 * loaded narration set and bound outline, the ten-template catalog, duration
 * allocation, deterministic storyboard rules, and idempotent draft
 * persistence.
 */
export function createStoryboardGenerationJobHandler(input: {
  database: DatabaseClient;
  provider: LanguageModelProvider;
  promptRegistry: PromptRegistry;
  quotaGuard: QuotaGuard;
  pricing?: ModelPricingTable;
  maxRepairs?: number;
  now?: () => Date;
}): ReturnType<typeof createModelCallGenerationHandler<StoryboardOutputV1>> {
  const options: ModelCallHandlerOptions<StoryboardOutputV1> = {
    jobType: "storyboard.generate",
    payloadVersion: 1,
    operationType: "ai.storyboard",
    outputSchema: storyboardOutputV1Schema,
    provider: input.provider,
    promptRegistry: input.promptRegistry,
    quotaGuard: input.quotaGuard,
    database: input.database,
    loadOperationContext: async ({ params, context }) => {
      const parsedParams = storyboardGenerationParamsSchema.parse(params);
      const loaded = await loadStoryboardOperationContext({
        executor: input.database,
        ownerUserId: context.ownerUserId,
        projectId: context.projectId,
        params: parsedParams,
      });
      if (loaded.status !== "ok")
        throw storyboardContextError(loaded.status);
      const narration = loaded.context.narrationSet.blocks.map((block) => ({
        id: block.id,
        order: block.order,
        outlineItemId: block.outlineItemId,
        text: block.text,
        estimatedWords: block.estimatedWords,
        targetSeconds: block.targetSeconds,
      }));
      const outline = loaded.context.outlineSet.items.map((item) => ({
        id: item.id,
        order: item.order,
        kind: item.kind,
        title: item.title,
        description: item.description,
        estimatedSeconds: item.estimatedSeconds,
        objectiveIds: item.objectiveIds,
      }));
      return {
        variables: {
          templateCatalog: JSON.stringify(storyboardTemplateCatalog),
          narration: JSON.stringify(narration),
          outline: JSON.stringify(outline),
          configuration: JSON.stringify(parsedParams),
        },
        context: loaded.context,
      };
    },
    deterministicChecks: (value, sourcePackage, operationContext) =>
      assertStoryboardDeterministicChecks(
        value,
        sourcePackage,
        operationContext as StoryboardOperationContext | undefined,
      ),
    persistCandidate: (candidate) =>
      persistLessonStoryboard({
        executor: input.database,
        output: candidate.value,
        sourcePackage: candidate.sourcePackage,
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
  return createModelCallGenerationHandler<StoryboardOutputV1>(options);
}
