import type { Identifier } from "@avlp/config";
import {
  creativeDesignDrafts,
  lessonSpecs,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import {
  classifyJobError,
  defineJobHandler,
  JobExecutionError,
  type JobMetadata,
  type RegisteredJobHandler,
} from "@avlp/jobs";
import type {
  LanguageModelProvider,
  ModelPricingTable,
  PromptRegistry,
  QuotaGuard,
} from "@avlp/provider-adapters";
import {
  anyCreativeDesignManifestSchema,
  cinemaBeatTargets,
  cinemaCompositionCatalogue,
  cinemaCompositionEligibility,
  creativeDesignHash,
  creativeDesignPackNames,
  eligibleCinemaCompositions,
  groundVisualPlanProposal,
  isCreativeDesignManifestV2,
  lessonStoryboardSchema,
  modelCallJobPayloadSchema,
  narrationSentences,
  planCinemaDesign,
  validateCreativeDesignManifestV2,
  visualPlanProposalSchema,
  type CinemaCompositionId,
  type CinemaSceneImagery,
  type CreativeDesignManifestV2,
  type SceneSpec,
  type VisualPlanProposal,
} from "@avlp/schemas";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  createModelCallGenerationHandler,
  type DeterministicWarning,
  type ModelCallHandlerOptions,
} from "./model-call.js";

export const visualPlanJobType = "creative-design.visual-plan";

/** The draft revision a plan is for; a newer draft is never overwritten. */
export const visualPlanParamsSchema = z
  .object({
    draftId: z.string().uuid(),
    draftRevision: z.number().int().positive(),
  })
  .passthrough();

type Scope = Readonly<{ ownerUserId: Identifier; projectId: Identifier }>;

type VisualPlanContext = Readonly<{
  draftId: Identifier;
  draftRevision: number;
  manifest: CreativeDesignManifestV2;
  scenes: readonly SceneSpec[];
}>;

/**
 * Failures the authored fallback cannot answer: the job itself is malformed
 * or points at a draft this tenant does not have. Everything else — provider,
 * quota, structured-output or grounding failure — keeps a valid authored
 * design instead of stopping the video (ST-110 AC3).
 */
const nonRecoverableCodes = new Set([
  "MODEL_CALL_OPERATION_MISMATCH",
  "PAYLOAD_VALIDATION_FAILED",
  "VISUAL_PLAN_DRAFT_NOT_FOUND",
  "VISUAL_PLAN_REQUIRES_V2",
]);

const supersededCode = "VISUAL_PLAN_DRAFT_SUPERSEDED";

/**
 * Loads the v2 draft and its scenes (keyed by stable scene ID, as v2
 * manifests are) for one tenant. Reads are scoped by owner and project, so a
 * draft ID from another tenant is simply not found.
 */
async function loadVisualPlanContext(
  executor: DatabaseExecutor,
  scope: Scope,
  draftId: Identifier,
): Promise<{ revision: number; context: VisualPlanContext }> {
  const [draft] = await executor
    .select()
    .from(creativeDesignDrafts)
    .where(
      and(
        eq(creativeDesignDrafts.id, draftId),
        eq(creativeDesignDrafts.ownerUserId, scope.ownerUserId),
        eq(creativeDesignDrafts.projectId, scope.projectId),
      ),
    )
    .limit(1);
  if (draft === undefined)
    throw new JobExecutionError(
      "terminal",
      "VISUAL_PLAN_DRAFT_NOT_FOUND",
      "The design draft for this visual plan is unavailable.",
    );
  const manifest = anyCreativeDesignManifestSchema.parse(draft.manifest);
  if (!isCreativeDesignManifestV2(manifest))
    throw new JobExecutionError(
      "terminal",
      "VISUAL_PLAN_REQUIRES_V2",
      "Visual planning applies only to a v2 design draft.",
    );
  const [spec] = await executor
    .select({ payload: lessonSpecs.payload })
    .from(lessonSpecs)
    .where(
      and(
        eq(lessonSpecs.id, draft.lessonSpecId),
        eq(lessonSpecs.ownerUserId, scope.ownerUserId),
        eq(lessonSpecs.projectId, scope.projectId),
      ),
    )
    .limit(1);
  if (spec === undefined)
    throw new JobExecutionError(
      "terminal",
      "VISUAL_PLAN_DRAFT_NOT_FOUND",
      "The storyboard for this visual plan is unavailable.",
    );
  const storyboard = lessonStoryboardSchema.parse(spec.payload);
  return {
    revision: draft.revision,
    context: {
      draftId,
      draftRevision: draft.revision,
      manifest,
      scenes: storyboard.scenes.map((entry) => ({
        ...entry.scene,
        id: entry.stableSceneId,
      })),
    },
  };
}

function hasBoundPicture(scene: SceneSpec): boolean {
  return scene.assetBindings.some(
    (binding) =>
      binding.visualRole !== "grounding_critical" &&
      ["illustration", "photo", "supporting"].includes(binding.role),
  );
}

/**
 * The planner's whole input: approved scene content and numbered narration,
 * the selected identity, which scenes already have a picture, and the
 * registered catalogue with each scene's eligible compositions and the
 * elements each can reveal. No source document text is included.
 */
export function visualPlanInput(context: VisualPlanContext): string {
  const ordered = [...context.scenes].sort((left, right) => left.order - right.order);
  return JSON.stringify({
    identity: {
      style: creativeDesignPackNames[context.manifest.pack.id],
      artDirection: context.manifest.artDirection,
    },
    catalogue: cinemaCompositionCatalogue.map((entry) => ({
      id: entry.id,
      family: entry.family,
      label: entry.label,
      description: entry.description,
      imageUse: entry.imageUse,
      capacity: entry.capacity,
    })),
    scenes: ordered.map((scene) => ({
      sceneId: scene.id,
      order: scene.order,
      template: scene.template,
      ...(scene.title === undefined ? {} : { title: scene.title }),
      narration: narrationSentences(scene.narration).map((text, sentence) => ({
        sentence,
        text,
      })),
      onScreenText: scene.onScreenText,
      content: scene.visual,
      hasPicture:
        (context.manifest.scenes[scene.id]?.imagery.hero ?? null) !== null ||
        hasBoundPicture(scene),
      eligibleCompositions: eligibleCinemaCompositions(scene).map((entry) => ({
        id: entry.id,
        beatTargets: [...cinemaBeatTargets(entry.id, scene)],
      })),
    })),
  });
}

/**
 * Re-plans the draft's design: same pack, settings, preset, seed and art
 * direction; every still-fitting lock and pinned picture kept. With a
 * proposal, only its grounded parts are applied.
 */
export function planVisualDesign(
  context: VisualPlanContext,
  plan?: Readonly<{ proposal: VisualPlanProposal; modelCallId: string }>,
): CreativeDesignManifestV2 {
  const previous = context.manifest;
  const locks: Record<string, CinemaCompositionId> = {};
  const imagery: Record<string, CinemaSceneImagery["hero"]> = {};
  for (const scene of context.scenes) {
    const design = previous.scenes[scene.id];
    if (design === undefined) continue;
    if (design.locked && cinemaCompositionEligibility(design.compositionId, scene).eligible)
      locks[scene.id] = design.compositionId;
    if (design.imagery.hero !== null) imagery[scene.id] = design.imagery.hero;
  }
  return planCinemaDesign({
    packId: previous.pack.id,
    scenes: context.scenes,
    seed: previous.variationSeed,
    settings: previous.settings,
    presetVersionId: previous.presetVersionId,
    artDirection: previous.artDirection,
    imagery,
    locks,
    ...(plan === undefined
      ? {}
      : {
          proposal: groundVisualPlanProposal(plan.proposal, context.scenes).proposal,
          modelCallId: plan.modelCallId,
        }),
  });
}

/** Writes a design under the draft's optimistic revision; false if it moved. */
async function writeDraft(
  database: DatabaseClient,
  scope: Scope,
  context: VisualPlanContext,
  manifest: CreativeDesignManifestV2,
  now: Date,
): Promise<boolean> {
  const [updated] = await database
    .update(creativeDesignDrafts)
    .set({
      manifest,
      manifestHash: creativeDesignHash(manifest),
      revision: context.draftRevision + 1,
      updatedAt: now,
    })
    .where(
      and(
        eq(creativeDesignDrafts.id, context.draftId),
        eq(creativeDesignDrafts.ownerUserId, scope.ownerUserId),
        eq(creativeDesignDrafts.projectId, scope.projectId),
        eq(creativeDesignDrafts.revision, context.draftRevision),
      ),
    )
    .returning({ id: creativeDesignDrafts.id });
  return updated !== undefined;
}

function superseded(): JobExecutionError {
  return new JobExecutionError(
    "terminal",
    supersededCode,
    "The design draft changed after this visual plan was requested.",
  );
}

/**
 * The plan's deterministic check: the grounded proposal must still cover a
 * scene and build a valid design. Dropped fields are reported as warnings;
 * their reasons are authored here, never provider text.
 */
export function checkVisualPlan(
  value: VisualPlanProposal,
  context: VisualPlanContext,
): readonly DeterministicWarning[] {
  const { proposal, dropped } = groundVisualPlanProposal(value, context.scenes);
  if (proposal.scenes.length === 0)
    throw Object.assign(
      new Error("The plan named no scene of this lesson. Use the sceneId values from the input."),
      { code: "VISUAL_PLAN_EMPTY" },
    );
  // The model call is recorded only after this check passes; any identifier
  // stands in for it here, as validation does not read it.
  const issues = validateCreativeDesignManifestV2(
    planVisualDesign(context, { proposal, modelCallId: context.draftId }),
    context.scenes,
  );
  if (issues.length > 0)
    throw Object.assign(new Error(issues.slice(0, 5).join(" ")), {
      code: "VISUAL_PLAN_INVALID",
    });
  const warnings = dropped.slice(0, 20).map((entry) => ({
    code: "VISUAL_PLAN_FIELD_DROPPED",
    message: `${entry.sceneId === null ? "Plan" : `Scene ${entry.sceneId}`} ${entry.field}: ${entry.reason}`,
  }));
  if (dropped.length > warnings.length)
    warnings.push({
      code: "VISUAL_PLAN_FIELD_DROPPED",
      message: `${dropped.length - warnings.length} more unsupported plan fields were dropped.`,
    });
  return warnings;
}

/**
 * ST-110: the bounded `creative-design.visual-plan` job, run between
 * storyboard and illustrations. One metered `ai.creative_design` call
 * proposes compositions, wording, briefs and beats; only grounded parts are
 * applied, as a new revision of the v2 draft the job was queued for.
 *
 * Planning is optional polish, never a gate: when the call is unavailable,
 * fails, exhausts its quota or yields nothing usable, the draft keeps (or is
 * re-planned to) a valid authored v2 design and the job still succeeds, so a
 * video never waits on a person (AC3). Retryable failures retry first; the
 * fallback runs on the final attempt.
 */
export function createVisualPlanJobHandler(input: {
  database: DatabaseClient;
  provider: LanguageModelProvider;
  promptRegistry: PromptRegistry;
  quotaGuard: QuotaGuard;
  pricing?: ModelPricingTable;
  /** The delivery budget the job is enqueued with. */
  maxAttempts?: number;
  now?: () => Date;
  modelCallOverrides?: Pick<
    ModelCallHandlerOptions<VisualPlanProposal>,
    "modelCalls" | "usageMeter" | "auditWriter" | "sourceSnapshotLoader"
  >;
}): RegisteredJobHandler {
  const now = input.now ?? (() => new Date());
  const maxAttempts = input.maxAttempts ?? 3;
  const planned = createModelCallGenerationHandler<VisualPlanProposal>({
    jobType: visualPlanJobType,
    payloadVersion: 2,
    operationType: "ai.creative_design",
    outputSchema: visualPlanProposalSchema,
    provider: input.provider,
    promptRegistry: input.promptRegistry,
    quotaGuard: input.quotaGuard,
    database: input.database,
    now,
    ...input.modelCallOverrides,
    maxDeterministicRepairs: 1,
    loadOperationContext: async ({ params, context }) => {
      const { draftId, draftRevision } = visualPlanParamsSchema.parse(params);
      const loaded = await loadVisualPlanContext(
        input.database,
        context,
        draftId as Identifier,
      );
      // Checked before the provider call, so a superseded plan costs nothing.
      if (loaded.revision !== draftRevision) throw superseded();
      return {
        variables: { visualPlanInput: visualPlanInput(loaded.context) },
        context: loaded.context,
      };
    },
    deterministicChecks: (value, _sourcePackage, operationContext) =>
      checkVisualPlan(value, operationContext as VisualPlanContext),
    persistCandidate: async ({ value, modelCall, operationContext, context, now: at }) => {
      const planContext = operationContext as VisualPlanContext;
      const manifest = planVisualDesign(planContext, {
        proposal: value,
        modelCallId: modelCall.id,
      });
      if (!(await writeDraft(input.database, context, planContext, manifest, at)))
        throw superseded();
      return { id: planContext.draftId };
    },
    ...(input.pricing === undefined ? {} : { pricing: input.pricing }),
  });

  /** Reports a draft that moved on: ours from an earlier attempt, or a teacher edit. */
  const supersededResult = async (
    scope: Scope,
    draftId: Identifier,
    draftRevision: number,
  ): Promise<JobMetadata> => {
    const loaded = await loadVisualPlanContext(input.database, scope, draftId);
    const plan = loaded.context.manifest.plan;
    return loaded.revision === draftRevision + 1 && plan.source === "model"
      ? {
          visualPlan: "model",
          draftId,
          draftRevision: loaded.revision,
          ...(plan.modelCallId === null ? {} : { modelCallId: plan.modelCallId }),
          alreadyApplied: true,
        }
      : { visualPlan: "superseded", draftId, draftRevision: loaded.revision };
  };

  /** Keeps a valid authored design: the current draft if it validates, else a re-plan. */
  const authoredFallback = async (
    scope: Scope,
    draftId: Identifier,
    draftRevision: number,
    reason: string,
  ): Promise<JobMetadata> => {
    const loaded = await loadVisualPlanContext(input.database, scope, draftId);
    if (loaded.revision !== draftRevision)
      return supersededResult(scope, draftId, draftRevision);
    const { context } = loaded;
    if (validateCreativeDesignManifestV2(context.manifest, context.scenes).length === 0)
      return {
        visualPlan: "authored",
        fallbackReason: reason,
        draftId,
        draftRevision,
        replanned: false,
      };
    const manifest = planVisualDesign(context);
    if (validateCreativeDesignManifestV2(manifest, context.scenes).length > 0)
      throw new JobExecutionError(
        "terminal",
        "VISUAL_PLAN_FALLBACK_INVALID",
        "No valid authored design fits this storyboard.",
      );
    if (!(await writeDraft(input.database, scope, context, manifest, now())))
      return supersededResult(scope, draftId, draftRevision);
    return {
      visualPlan: "authored",
      fallbackReason: reason,
      draftId,
      draftRevision: draftRevision + 1,
      replanned: true,
    };
  };

  return defineJobHandler(
    visualPlanJobType,
    2,
    modelCallJobPayloadSchema,
    async (payload, context) => {
      const params = visualPlanParamsSchema.safeParse(payload.params ?? {});
      if (!params.success)
        throw new JobExecutionError(
          "terminal",
          "PAYLOAD_VALIDATION_FAILED",
          "The visual-plan job parameters are invalid.",
        );
      const draftId = params.data.draftId as Identifier;
      const { draftRevision } = params.data;
      try {
        const result = await planned.handler(payload, context);
        return { ...result, visualPlan: "model", draftId, draftRevision: draftRevision + 1 };
      } catch (error) {
        const failure = classifyJobError(error);
        if (failure.code === supersededCode)
          return supersededResult(context, draftId, draftRevision);
        if (nonRecoverableCodes.has(failure.code)) throw error;
        if (failure.classification === "retryable" && context.attempt < maxAttempts)
          throw error;
        return authoredFallback(context, draftId, draftRevision, failure.code);
      }
    },
  );
}
