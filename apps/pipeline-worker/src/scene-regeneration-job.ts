import {
  computeNarrationBlockContentHash,
  computeNarrationSetContentHash,
  createId,
  type Identifier,
} from "@avlp/config";
import {
  lessonOutlineItems,
  lessonOutlineSets,
  lessonSpecs,
  narrationBlocks,
  narrationSets,
  scenes,
  sceneCandidates,
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
  sceneRegenerationParamsSchema,
  sceneRegenerationOutputSchema,
  sceneSpecSchema,
  storyboardSceneMaximumSeconds,
  storyboardSceneMinimumSeconds,
  storyboardTemplateCatalog,
  type LessonStoryboard,
  type LessonStoryboardScene,
  type ModelCallParams,
  type ModelCallRecord,
  type SceneRegenerationMode,
  type SceneRegenerationOutput,
  type SceneRegenerationParams,
  type SourcePackage,
} from "@avlp/schemas";
import { validateScene } from "@avlp/scene-library";
import { and, eq } from "drizzle-orm";
import {
  createModelCallGenerationHandler,
  type ModelCallHandlerOptions,
} from "./model-call.js";
import { resolveObjectiveSourceRefs as resolveSourceRefs } from "./objectives-job.js";

/**
 * Deterministic scene-regeneration rule failure. The job classifies this as a
 * terminal deterministic failure so a regenerated scene that changes the
 * narration assignment, breaks grounding, or leaves the supported template or
 * duration bounds is never offered as a candidate.
 */
export class SceneRegenerationDeterministicCheckError extends Error {
  public readonly code:
    | "MODE_MISMATCH"
    | "SCENE_ID_MISMATCH"
    | "NARRATION_ASSIGNMENT_CHANGED"
    | "SCENE_UNGROUNDED"
    | "UNSUPPORTED_SOURCE_BLOCK"
    | "SCENE_TEXT_OVERFLOW"
    | "DURATION_OUT_OF_BOUNDS";

  public constructor(
    code: SceneRegenerationDeterministicCheckError["code"],
    message: string,
  ) {
    super(message);
    this.name = "SceneRegenerationDeterministicCheckError";
    this.code = code;
  }
}

export type SceneRegenerationOperationContext = {
  params: SceneRegenerationParams;
  lessonSpec: {
    id: Identifier;
    revision: number;
  };
  currentScene: LessonStoryboardScene;
  currentSceneRevision: number;
  neighbors: readonly {
    id: Identifier;
    order: number;
    template: string;
    title: string | undefined;
    narration: string;
    onScreenText: readonly string[];
    durationSeconds: number;
  }[];
  narrationBlocks: readonly {
    id: Identifier;
    order: number;
    outlineItemId: Identifier;
    text: string;
  }[];
  outline: readonly {
    id: Identifier;
    order: number;
    kind: string;
    title: string;
    description: string;
    estimatedSeconds: number;
  }[];
  storyboard: LessonStoryboard;
};

export type LoadedSceneRegenerationContext =
  | { status: "ok"; context: SceneRegenerationOperationContext }
  | { status: "lesson_spec_missing" }
  | { status: "lesson_spec_not_draft" }
  | { status: "lesson_spec_revision_mismatch" }
  | { status: "scene_missing" }
  | { status: "scene_revision_mismatch" }
  | { status: "narration_set_mismatch" };

/**
 * Loads the working draft lesson spec, the target scene (by stable scene id),
 * its neighbors, the narration blocks it covers, and the approved outline the
 * storyboard was generated from, all tenant-scoped. The lesson spec revision
 * and the scene revision must match the request; the bound narration set must
 * still carry the content hash the storyboard was generated against.
 */
export async function loadSceneRegenerationContext(input: {
  executor: DatabaseExecutor;
  ownerUserId: Identifier;
  projectId: Identifier;
  params: SceneRegenerationParams;
}): Promise<LoadedSceneRegenerationContext> {
  const [lessonSpecRow] = await input.executor
    .select()
    .from(lessonSpecs)
    .where(
      and(
        eq(lessonSpecs.id, input.params.lessonSpecId),
        eq(lessonSpecs.ownerUserId, input.ownerUserId),
        eq(lessonSpecs.projectId, input.projectId),
      ),
    )
    .limit(1);
  if (lessonSpecRow === undefined) return { status: "lesson_spec_missing" };
  if (lessonSpecRow.status !== "draft")
    return { status: "lesson_spec_not_draft" };
  if (lessonSpecRow.revision !== input.params.lessonSpecRevision)
    return { status: "lesson_spec_revision_mismatch" };
  const storyboard = lessonStoryboardSchema.parse(lessonSpecRow.payload);
  const currentScene = storyboard.scenes.find(
    (scene) => scene.stableSceneId === input.params.sceneId,
  );
  if (currentScene === undefined) return { status: "scene_missing" };
  const [sceneRow] = await input.executor
    .select({ revision: scenes.revision })
    .from(scenes)
    .where(
      and(
        eq(scenes.lessonSpecId, lessonSpecRow.id),
        eq(scenes.stableSceneId, input.params.sceneId),
        eq(scenes.ownerUserId, input.ownerUserId),
        eq(scenes.projectId, input.projectId),
      ),
    )
    .limit(1);
  if (sceneRow === undefined) return { status: "scene_missing" };
  if (sceneRow.revision !== input.params.sceneRevision)
    return { status: "scene_revision_mismatch" };
  const [narrationSetRow] = await input.executor
    .select()
    .from(narrationSets)
    .where(
      and(
        eq(narrationSets.id, storyboard.basedOnNarrationSetId),
        eq(narrationSets.ownerUserId, input.ownerUserId),
        eq(narrationSets.projectId, input.projectId),
      ),
    )
    .limit(1);
  if (narrationSetRow === undefined)
    return { status: "narration_set_mismatch" };
  const narrationSetContentHash =
    await computeNarrationSetContentHashForContext({
      executor: input.executor,
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      setRow: narrationSetRow,
    });
  if (narrationSetContentHash !== storyboard.narrationSetContentHash)
    return { status: "narration_set_mismatch" };
  const narrationBlocksFor = await input.executor
    .select()
    .from(narrationBlocks)
    .where(
      and(
        eq(narrationBlocks.setId, narrationSetRow.id),
        eq(narrationBlocks.ownerUserId, input.ownerUserId),
        eq(narrationBlocks.projectId, input.projectId),
      ),
    )
    .orderBy(narrationBlocks.order);
  const coveredBlockIds = new Set(currentScene.narrationBlockIds);
  const narration = narrationBlocksFor
    .filter((block) => coveredBlockIds.has(block.id))
    .map((block) => ({
      id: block.id as Identifier,
      order: block.order,
      outlineItemId: block.outlineItemId as Identifier,
      text: block.text,
    }));
  const outline = await loadApprovedOutlineForScene({
    executor: input.executor,
    ownerUserId: input.ownerUserId,
    projectId: input.projectId,
    outlineSetId: storyboard.outlineSetId,
  });
  return {
    status: "ok",
    context: {
      params: input.params,
      lessonSpec: {
        id: lessonSpecRow.id as Identifier,
        revision: lessonSpecRow.revision,
      },
      currentScene,
      currentSceneRevision: sceneRow.revision,
      neighbors: storyboard.scenes
        .filter((scene) => scene.stableSceneId !== currentScene.stableSceneId)
        .map((scene) => ({
          id: scene.stableSceneId,
          order: scene.order,
          template: scene.template,
          title: scene.scene.title,
          narration: scene.scene.narration,
          onScreenText: scene.scene.onScreenText,
          durationSeconds: scene.durationSeconds,
        })),
      narrationBlocks: narration,
      outline: outline.items,
      storyboard,
    },
  };
}

type OutlineItemsForScene = {
  items: readonly {
    id: Identifier;
    order: number;
    kind: string;
    title: string;
    description: string;
    estimatedSeconds: number;
  }[];
};

async function loadApprovedOutlineForScene(input: {
  executor: DatabaseExecutor;
  ownerUserId: Identifier;
  projectId: Identifier;
  outlineSetId: Identifier;
}): Promise<OutlineItemsForScene> {
  const [setRow] = await input.executor
    .select({ status: lessonOutlineSets.status })
    .from(lessonOutlineSets)
    .where(
      and(
        eq(lessonOutlineSets.id, input.outlineSetId),
        eq(lessonOutlineSets.ownerUserId, input.ownerUserId),
        eq(lessonOutlineSets.projectId, input.projectId),
      ),
    )
    .limit(1);
  if (setRow === undefined) return { items: [] };
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
        eq(lessonOutlineItems.setId, input.outlineSetId),
        eq(lessonOutlineItems.ownerUserId, input.ownerUserId),
        eq(lessonOutlineItems.projectId, input.projectId),
      ),
    )
    .orderBy(lessonOutlineItems.order);
  return {
    items: itemRows.map((item) => ({
      id: item.id as Identifier,
      order: item.order,
      kind: item.kind,
      title: item.title,
      description: item.description,
      estimatedSeconds: item.estimatedSeconds,
    })),
  };
}

async function computeNarrationSetContentHashForContext(input: {
  executor: DatabaseExecutor;
  ownerUserId: Identifier;
  projectId: Identifier;
  setRow: typeof narrationSets.$inferSelect;
}): Promise<string> {
  const blockRows = await input.executor
    .select()
    .from(narrationBlocks)
    .where(
      and(
        eq(narrationBlocks.setId, input.setRow.id),
        eq(narrationBlocks.ownerUserId, input.ownerUserId),
        eq(narrationBlocks.projectId, input.projectId),
      ),
    )
    .orderBy(narrationBlocks.order);
  return computeNarrationSetContentHash(
    blockRows.map((block) => ({
      contentHash: computeNarrationBlockContentHash({
        text: block.text,
        sourceRefs: block.sourceRefs as readonly unknown[],
        generatedAdditions: block.generatedAdditions as readonly unknown[],
        generated: block.generated,
      }),
    })),
    input.setRow.totalEstimatedSeconds,
  );
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
 * Deterministic scene-regeneration rules: the mode and scene must match the
 * request, the narration-block assignment must be unchanged, every scene must
 * stay grounded (at least one citation), every citation must resolve to the
 * bounded source package, and the estimated duration must fit the scene
 * bounds. Throws on the first violation.
 */
export function assertSceneRegenerationChecks(
  output: SceneRegenerationOutput,
  sourcePackage: SourcePackage,
  operationContext: SceneRegenerationOperationContext | undefined,
): void {
  if (operationContext === undefined)
    throw new SceneRegenerationDeterministicCheckError(
      "SCENE_ID_MISMATCH",
      "The scene regeneration operation context is missing.",
    );
  if (output.mode !== operationContext.params.mode)
    throw new SceneRegenerationDeterministicCheckError(
      "MODE_MISMATCH",
      `The model returned mode ${output.mode} instead of ${operationContext.params.mode}.`,
    );
  const currentBlockIds = [
    ...operationContext.currentScene.narrationBlockIds,
  ].sort();
  const outputBlockIds = [...output.scene.narrationBlockIds].sort();
  if (
    currentBlockIds.length !== outputBlockIds.length ||
    currentBlockIds.some((id, index) => id !== outputBlockIds[index])
  )
    throw new SceneRegenerationDeterministicCheckError(
      "NARRATION_ASSIGNMENT_CHANGED",
      "Scene regeneration must not change the narration-block assignment.",
    );
  if (output.scene.sourceBlockIds.length === 0)
    throw new SceneRegenerationDeterministicCheckError(
      "SCENE_UNGROUNDED",
      "A regenerated scene must cite at least one source block.",
    );
  const valid = collectPackageBlockIds(sourcePackage);
  for (const blockId of output.scene.sourceBlockIds)
    if (!valid.has(blockId))
      throw new SceneRegenerationDeterministicCheckError(
        "UNSUPPORTED_SOURCE_BLOCK",
        `The regenerated scene cites unsupported source block ${blockId}.`,
      );
  const layoutScene = sceneSpecSchema.parse({
    id: operationContext.currentScene.scene.id,
    order: operationContext.currentScene.scene.order,
    narration: operationContext.currentScene.scene.narration,
    durationSeconds: operationContext.currentScene.durationSeconds,
    onScreenText: output.scene.onScreenText,
    transition: output.scene.transition,
    assetBindings: operationContext.currentScene.scene.assetBindings,
    sourceRefs: [],
    generatedAdditions: output.scene.generatedAdditions,
    template: output.scene.template,
    visual: output.scene.visual,
  });
  const overflow = validateScene(layoutScene).find(
    (issue) => issue.code === "text_overflow",
  );
  if (overflow !== undefined)
    throw new SceneRegenerationDeterministicCheckError(
      "SCENE_TEXT_OVERFLOW",
      `${overflow.fieldPath} exceeds the readable layout capacity.`,
    );
  if (
    output.scene.estimatedSeconds < storyboardSceneMinimumSeconds ||
    output.scene.estimatedSeconds > storyboardSceneMaximumSeconds
  )
    throw new SceneRegenerationDeterministicCheckError(
      "DURATION_OUT_OF_BOUNDS",
      `The regenerated scene duration of ${output.scene.estimatedSeconds}s is outside the supported bounds.`,
    );
}

/**
 * Idempotent candidate persistence for one scene-regeneration job: one pending
 * candidate per (tenant, project, scene, job idempotency key). A retried job
 * returns the already-created candidate instead of duplicating the result.
 */
export async function persistSceneCandidate(input: {
  executor: DatabaseExecutor;
  value: SceneRegenerationOutput;
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
  sceneRegenerationParamsSchema.parse(input.params);
  const operationContext = input.operationContext as
    SceneRegenerationOperationContext | undefined;
  if (operationContext === undefined)
    throw new Error("The scene regeneration operation context is missing.");
  const timestamp = input.now;
  const currentScene = operationContext.currentScene;
  const narrationText = currentScene.scene.narration;
  const sceneSpec = sceneSpecSchema.parse({
    id: currentScene.scene.id,
    order: currentScene.scene.order,
    title: input.value.scene.title,
    narration: narrationText,
    durationSeconds: currentScene.durationSeconds,
    onScreenText: input.value.scene.onScreenText,
    transition: input.value.scene.transition,
    assetBindings: currentScene.scene.assetBindings,
    sourceRefs: resolveSourceRefs(
      input.sourcePackage,
      input.value.scene.sourceBlockIds,
    ),
    generatedAdditions: input.value.scene.generatedAdditions,
    template: input.value.scene.template,
    visual: input.value.scene.visual,
  });
  const afterScene = lessonStoryboardSceneSchema.parse({
    id: currentScene.id,
    stableSceneId: currentScene.stableSceneId,
    order: currentScene.order,
    template: input.value.scene.template,
    durationSeconds: currentScene.durationSeconds,
    narrationBlockIds: currentScene.narrationBlockIds,
    assetRequirements: input.value.scene.assetRequirements,
    scene: sceneSpec,
  });
  const beforeScene = lessonStoryboardSceneSchema.parse(currentScene);
  const candidateId = createId(timestamp);
  const [created] = await input.executor
    .insert(sceneCandidates)
    .values({
      id: candidateId,
      projectId: input.context.projectId,
      ownerUserId: input.context.ownerUserId,
      lessonSpecId: operationContext.lessonSpec.id,
      sceneId: currentScene.id,
      mode: input.value.mode,
      beforeScene,
      afterScene,
      status: "pending",
      sceneRevision: operationContext.currentSceneRevision,
      modelCallId: input.modelCall.id,
      idempotencyKey: input.context.idempotencyKey,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoNothing({
      target: [
        sceneCandidates.ownerUserId,
        sceneCandidates.projectId,
        sceneCandidates.sceneId,
        sceneCandidates.idempotencyKey,
      ],
    })
    .returning({ id: sceneCandidates.id });
  if (created !== undefined) return { id: created.id as Identifier };
  const [existing] = await input.executor
    .select({ id: sceneCandidates.id })
    .from(sceneCandidates)
    .where(
      and(
        eq(sceneCandidates.ownerUserId, input.context.ownerUserId),
        eq(sceneCandidates.projectId, input.context.projectId),
        eq(sceneCandidates.sceneId, currentScene.id),
        eq(sceneCandidates.idempotencyKey, input.context.idempotencyKey),
      ),
    )
    .limit(1);
  if (existing === undefined)
    throw new Error("The idempotent scene candidate could not be read.");
  return { id: existing.id as Identifier };
}

function sceneContextError(
  status: Exclude<LoadedSceneRegenerationContext["status"], "ok">,
): JobExecutionError {
  switch (status) {
    case "lesson_spec_missing":
      return new JobExecutionError(
        "terminal",
        "LESSON_SPEC_NOT_FOUND",
        "The referenced storyboard draft does not exist.",
      );
    case "lesson_spec_not_draft":
      return new JobExecutionError(
        "terminal",
        "LESSON_SPEC_NOT_DRAFT",
        "Only draft storyboards can be regenerated scene by scene.",
      );
    case "lesson_spec_revision_mismatch":
      return new JobExecutionError(
        "terminal",
        "LESSON_SPEC_REVISION_MISMATCH",
        "The storyboard changed after this scene regeneration was requested.",
      );
    case "scene_missing":
      return new JobExecutionError(
        "terminal",
        "SCENE_NOT_FOUND",
        "The referenced storyboard scene does not exist.",
      );
    case "scene_revision_mismatch":
      return new JobExecutionError(
        "terminal",
        "SCENE_REVISION_MISMATCH",
        "The scene changed after this regeneration was requested.",
      );
    case "narration_set_mismatch":
      return new JobExecutionError(
        "terminal",
        "NARRATION_SET_MISMATCH",
        "The approved narration changed after this storyboard was generated.",
      );
    default:
      return new JobExecutionError(
        "terminal",
        "SCENE_REGENERATION_INVALID",
        "The scene regeneration request is invalid.",
      );
  }
}

/**
 * The scene regeneration job: the standard model-call lifecycle plus the
 * loaded draft storyboard, the target scene and its neighbors, the narration
 * blocks the scene covers, the outline, single-scene deterministic checks, and
 * idempotent candidate persistence.
 */
export function createSceneRegenerationJobHandler(input: {
  database: DatabaseClient;
  provider: LanguageModelProvider;
  promptRegistry: PromptRegistry;
  quotaGuard: QuotaGuard;
  pricing?: ModelPricingTable;
  maxRepairs?: number;
  now?: () => Date;
}): ReturnType<
  typeof createModelCallGenerationHandler<SceneRegenerationOutput>
> {
  const options: ModelCallHandlerOptions<SceneRegenerationOutput> = {
    jobType: "storyboard.scene-regenerate",
    payloadVersion: 1,
    operationType: "ai.scene_regeneration",
    outputSchema: sceneRegenerationOutputSchema,
    provider: input.provider,
    promptRegistry: input.promptRegistry,
    quotaGuard: input.quotaGuard,
    database: input.database,
    loadOperationContext: async ({ params, context }) => {
      const parsedParams = sceneRegenerationParamsSchema.parse(params);
      const loaded = await loadSceneRegenerationContext({
        executor: input.database,
        ownerUserId: context.ownerUserId,
        projectId: context.projectId,
        params: parsedParams,
      });
      if (loaded.status !== "ok") throw sceneContextError(loaded.status);
      const { context: operationContext } = loaded;
      return {
        variables: {
          templateCatalog: JSON.stringify(storyboardTemplateCatalog),
          currentScene: JSON.stringify({
            id: operationContext.currentScene.stableSceneId,
            order: operationContext.currentScene.order,
            template: operationContext.currentScene.template,
            title: operationContext.currentScene.scene.title,
            narration: operationContext.currentScene.scene.narration,
            onScreenText: operationContext.currentScene.scene.onScreenText,
            durationSeconds: operationContext.currentScene.durationSeconds,
            transition: operationContext.currentScene.scene.transition,
            visual: operationContext.currentScene.scene.visual,
            narrationBlockIds: operationContext.currentScene.narrationBlockIds,
          }),
          neighborScenes: JSON.stringify(operationContext.neighbors),
          narrationBlocks: JSON.stringify(operationContext.narrationBlocks),
          outline: JSON.stringify(operationContext.outline),
          mode: operationContext.params.mode,
          instruction:
            operationContext.params.instruction === null
              ? "No additional instruction."
              : `Teacher instruction: ${operationContext.params.instruction}`,
        },
        context: operationContext,
      };
    },
    deterministicChecks: (value, sourcePackage, operationContext) =>
      assertSceneRegenerationChecks(
        value,
        sourcePackage,
        operationContext as SceneRegenerationOperationContext | undefined,
      ),
    persistCandidate: (candidate) =>
      persistSceneCandidate({
        executor: input.database,
        value: candidate.value,
        sourcePackage: candidate.sourcePackage,
        params: candidate.params,
        modelCall: candidate.modelCall,
        operationContext: candidate.operationContext,
        context: candidate.context,
        now: candidate.now,
      }),
    ...(input.pricing === undefined ? {} : { pricing: input.pricing }),
    ...(input.maxRepairs === undefined ? {} : { maxRepairs: input.maxRepairs }),
    ...(input.now === undefined ? {} : { now: input.now }),
  };
  return createModelCallGenerationHandler<SceneRegenerationOutput>(options);
}

export type { SceneRegenerationMode };
