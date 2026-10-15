import type { Identifier } from "@avlp/config";
import {
  lessonEditMessages,
  loadEditPlanStoryboardContext,
  type DatabaseClient,
  type DatabaseExecutor,
  type EditPlanStoryboardContext,
} from "@avlp/database";
import {
  classifyJobError,
  defineJobHandler,
  JobExecutionError,
  type RegisteredJobHandler,
} from "@avlp/jobs";
import type {
  LanguageModelProvider,
  ModelPricingTable,
  PromptRegistry,
  QuotaGuard,
} from "@avlp/provider-adapters";
import {
  editPlanParamsSchema,
  editPlanOutputSchema,
  editPlanSchema,
  editThreadContextTurns,
  editThreadPlanSchema,
  editThreadScopeSchema,
  modelCallJobPayloadSchema,
  plannableSceneFields,
  validateEditPlan,
  limitEditPlan,
  type EditPlan,
  type EditPlanOutput,
  type EditPlanOperation,
  type EditThreadPlan,
  type EditThreadScope,
} from "@avlp/schemas";
import { and, desc, eq, lt } from "drizzle-orm";
import {
  createModelCallGenerationHandler,
  type ModelCallHandlerOptions,
} from "./model-call.js";

export const editPlanJobType = "storyboard.edit-plan";

/** The message was planned by an earlier attempt, or dismissed meanwhile. */
const alreadyResolvedCode = "EDIT_PLAN_ALREADY_RESOLVED";

type Scope = Readonly<{ ownerUserId: Identifier; projectId: Identifier }>;

type EarlierTurn = Readonly<{
  request: string;
  outcome: string;
  summary: string | null;
  operations: readonly Readonly<{
    type: string;
    sceneId?: string;
    mode?: string;
    path?: string;
  }>[];
}>;

export type EditPlanJobContext = Readonly<{
  messageId: Identifier;
  request: string;
  scope: EditThreadScope;
  storyboard: EditPlanStoryboardContext;
  earlierTurns: readonly EarlierTurn[];
}>;

function planOperationsForContext(plan: unknown): EarlierTurn["operations"] {
  const parsed = editThreadPlanSchema.safeParse(plan);
  if (!parsed.success) return [];
  return parsed.data.operations.map(({ operation }) => ({
    type: operation.type,
    ...("sceneId" in operation ? { sceneId: operation.sceneId } : {}),
    ...("mode" in operation ? { mode: operation.mode } : {}),
    ...("path" in operation ? { path: operation.path } : {}),
  }));
}

/**
 * Loads the assistant message being planned, the teacher request it answers,
 * the last turns of the thread and the storyboard it was requested against.
 * Every read is scoped by owner and project. A message that is no longer
 * planning, or a storyboard that moved on, is refused before any provider
 * call, so neither costs anything.
 */
async function loadEditPlanJobContext(
  executor: DatabaseExecutor,
  scope: Scope,
  params: ReturnType<typeof editPlanParamsSchema.parse>,
): Promise<EditPlanJobContext> {
  const [message] = await executor
    .select()
    .from(lessonEditMessages)
    .where(
      and(
        eq(lessonEditMessages.id, params.messageId),
        eq(lessonEditMessages.threadId, params.threadId),
        eq(lessonEditMessages.ownerUserId, scope.ownerUserId),
        eq(lessonEditMessages.projectId, scope.projectId),
        eq(lessonEditMessages.role, "assistant"),
      ),
    )
    .limit(1);
  if (message === undefined)
    throw new JobExecutionError(
      "terminal",
      "EDIT_PLAN_MESSAGE_NOT_FOUND",
      "The edit request for this plan is unavailable.",
    );
  if (message.status !== "planning")
    throw new JobExecutionError(
      "terminal",
      alreadyResolvedCode,
      "This edit request has already been planned.",
    );
  const earlier = await executor
    .select({
      role: lessonEditMessages.role,
      text: lessonEditMessages.text,
      status: lessonEditMessages.status,
      plan: lessonEditMessages.plan,
      replyToId: lessonEditMessages.replyToId,
      id: lessonEditMessages.id,
    })
    .from(lessonEditMessages)
    .where(
      and(
        eq(lessonEditMessages.threadId, params.threadId),
        eq(lessonEditMessages.ownerUserId, scope.ownerUserId),
        eq(lessonEditMessages.projectId, scope.projectId),
        lt(lessonEditMessages.seq, message.seq),
      ),
    )
    .orderBy(desc(lessonEditMessages.seq))
    .limit(editThreadContextTurns * 2 + 1);
  const teacher = earlier.find(
    (entry) => entry.role === "teacher" && entry.id === message.replyToId,
  );
  if (teacher?.text === undefined || teacher.text === null)
    throw new JobExecutionError(
      "terminal",
      "EDIT_PLAN_MESSAGE_NOT_FOUND",
      "The edit request for this plan is unavailable.",
    );
  const requests = new Map(
    earlier
      .filter((entry) => entry.role === "teacher")
      .map((entry) => [entry.id, entry.text ?? ""]),
  );
  const earlierTurns = earlier
    .filter((entry) => entry.role === "assistant")
    .slice(0, editThreadContextTurns)
    .reverse()
    .map((entry) => ({
      request: (entry.replyToId === null ? "" : requests.get(entry.replyToId)) ?? "",
      outcome: entry.status,
      summary: entry.text,
      operations: planOperationsForContext(entry.plan),
    }));
  const storyboard = await loadEditPlanStoryboardContext(
    executor,
    scope,
    params.lessonSpecId,
  );
  if (storyboard === undefined || storyboard.revision !== params.lessonSpecRevision)
    throw new JobExecutionError(
      "terminal",
      "EDIT_PLAN_STALE",
      "The storyboard changed after this edit was requested.",
    );
  return {
    messageId: params.messageId,
    request: teacher.text,
    scope: editThreadScopeSchema.parse(message.scope),
    storyboard,
    earlierTurns,
  };
}

/**
 * The planner's whole input: the request, its scope, scene summaries, the
 * editable fields of in-scope scenes, measured narration and recent turns. No
 * source document text and no narration text is included.
 */
export function editPlanInput(context: EditPlanJobContext): string {
  const inScope = (sceneId: string): boolean =>
    context.scope.kind === "lesson" || context.scope.sceneIds.includes(sceneId);
  const { storyboard } = context;
  return JSON.stringify({
    request: context.request,
    scope: context.scope,
    narrationEditable: storyboard.narrationEditable,
    scenes: storyboard.scenes.map((entry) => {
      const scene = entry.scene;
      const included = inScope(entry.stableSceneId);
      const blockIds = storyboard.narrationBlocks
        .filter((block) => block.sceneId === entry.stableSceneId)
        .map((block) => block.blockId);
      return {
        sceneId: entry.stableSceneId,
        order: entry.order,
        inScope: included,
        template: scene.template,
        ...(scene.title === undefined ? {} : { title: scene.title }),
        onScreenText: scene.onScreenText,
        durationSeconds: scene.durationSeconds,
        transition: scene.transition,
        measuredNarrationSeconds: entry.measuredSeconds,
        ...(included && storyboard.narrationEditable
          ? { narrationBlockIds: blockIds }
          : {}),
        ...(included
          ? {
              editableFields: plannableSceneFields(scene).map((field) => ({
                path: field.path,
                label: field.label,
                control: field.control,
                ...(field.options === undefined ? {} : { options: field.options }),
                value: field.value,
              })),
            }
          : {}),
      };
    }),
    earlierTurns: context.earlierTurns,
  });
}

/** Rejects a plan that does not fit the storyboard. Messages are authored by
 * `validateEditPlan` from ids, paths and counts, never provider text. */
export function checkEditPlan(plan: EditPlan, context: EditPlanJobContext): [] {
  const issues = validateEditPlan(plan, {
    scope: context.scope,
    scenes: context.storyboard.scenes,
    narrationBlocks: context.storyboard.narrationBlocks,
    narrationEditable: context.storyboard.narrationEditable,
  });
  if (issues.length > 0)
    throw Object.assign(
      new Error(
        issues
          .slice(0, 5)
          .map((issue) => issue.message)
          .join(" "),
      ),
      { code: "EDIT_PLAN_INVALID" },
    );
  return [];
}

/** A duration the planner phrased as text is stored as the number it is. */
function storedOperation(operation: EditPlanOperation): EditPlanOperation {
  if (
    operation.type === "edit-scene-field" &&
    operation.path === "durationSeconds" &&
    typeof operation.value === "string"
  )
    return { ...operation, value: Number(operation.value.trim()) };
  return operation;
}

/**
 * The plan as stored on the assistant message: an id per operation, the
 * revisions it was planned against, and the server-read display context (scene
 * number, field label and current value) for each operation.
 */
export function storedEditPlan(
  plan: EditPlan,
  context: EditPlanJobContext,
  modelCallId: Identifier,
): EditThreadPlan {
  const scenes = new Map(
    context.storyboard.scenes.map((scene) => [scene.stableSceneId, scene]),
  );
  const inScope = new Set(
    context.scope.kind === "lesson"
      ? context.storyboard.scenes.map((scene) => scene.stableSceneId)
      : context.scope.sceneIds,
  );
  return editThreadPlanSchema.parse({
    schemaVersion: "edit-plan-v1",
    summary: plan.summary,
    remainingSceneIds: (plan.remainingSceneIds ?? []).filter((id) =>
      inScope.has(id),
    ),
    expectedRevision: context.storyboard.revision,
    narrationSetRevision: context.storyboard.narrationSetRevision,
    modelCallId,
    operations: plan.operations.map((raw, index) => {
      const operation = storedOperation(raw);
      const sceneId =
        operation.type === "regenerate-scene" ||
        operation.type === "edit-scene-field"
          ? operation.sceneId
          : operation.type === "regenerate-narration-block"
            ? (context.storyboard.narrationBlocks.find(
                (block) => block.blockId === operation.blockId,
              )?.sceneId ?? null)
            : null;
      const scene = sceneId === null ? undefined : scenes.get(sceneId);
      const field =
        operation.type === "edit-scene-field" && scene !== undefined
          ? plannableSceneFields(scene.scene).find(
              (entry) => entry.path === operation.path,
            )
          : undefined;
      return {
        id: `op-${index + 1}`,
        operation,
        display: {
          sceneOrder: scene?.order ?? null,
          fieldLabel: field?.label ?? null,
          before: field?.value ?? null,
        },
      };
    }),
  });
}

async function markPlanFailed(
  database: DatabaseClient,
  scope: Scope,
  messageId: Identifier,
  errorCode: string,
  now: Date,
): Promise<void> {
  await database
    .update(lessonEditMessages)
    .set({ status: "failed", errorCode: errorCode.slice(0, 100), updatedAt: now })
    .where(
      and(
        eq(lessonEditMessages.id, messageId),
        eq(lessonEditMessages.ownerUserId, scope.ownerUserId),
        eq(lessonEditMessages.projectId, scope.projectId),
        eq(lessonEditMessages.status, "planning"),
      ),
    );
}

/**
 * ST-115: the bounded `storyboard.edit-plan` job. One metered `ai.edit-plan`
 * call turns one teacher request into a change plan from the closed operation
 * set. The plan is only stored as a proposal: nothing changes until the
 * teacher applies it through the API. A response over the plan limits is
 * trimmed in code to the first 8 scenes, with the rest listed for a follow-up
 * (AC2). A plan that does not fit the storyboard fails outright, so the
 * teacher sees "couldn't plan that change" and never a partial plan (AC3).
 * Neither path makes a second provider call: there is no schema or
 * deterministic repair round. Retryable failures retry first; the message is
 * marked failed once the job gives up.
 */
export function createEditPlanJobHandler(input: {
  database: DatabaseClient;
  provider: LanguageModelProvider;
  promptRegistry: PromptRegistry;
  quotaGuard: QuotaGuard;
  pricing?: ModelPricingTable;
  /** The delivery budget the job is enqueued with. */
  maxAttempts?: number;
  now?: () => Date;
  modelCallOverrides?: Pick<
    ModelCallHandlerOptions<EditPlanOutput>,
    "modelCalls" | "usageMeter" | "auditWriter" | "sourceSnapshotLoader"
  >;
}): RegisteredJobHandler {
  const now = input.now ?? (() => new Date());
  const maxAttempts = input.maxAttempts ?? 3;
  const planned = createModelCallGenerationHandler<EditPlanOutput>({
    jobType: editPlanJobType,
    payloadVersion: 2,
    operationType: "ai.edit-plan",
    outputSchema: editPlanOutputSchema,
    provider: input.provider,
    promptRegistry: input.promptRegistry,
    quotaGuard: input.quotaGuard,
    database: input.database,
    now,
    ...input.modelCallOverrides,
    // One metered call per message: no repair completions of any kind.
    maxRepairs: 0,
    maxDeterministicRepairs: 0,
    normalizeOutput: (value, operationContext) =>
      limitEditPlan(
        value,
        (operationContext as EditPlanJobContext).storyboard.scenes.map(
          (scene) => scene.stableSceneId,
        ),
      ),
    loadOperationContext: async ({ params, context }) => {
      const loaded = await loadEditPlanJobContext(
        input.database,
        context,
        editPlanParamsSchema.parse(params),
      );
      return {
        variables: { editPlanInput: editPlanInput(loaded) },
        context: loaded,
      };
    },
    deterministicChecks: (value, _sourcePackage, operationContext) =>
      checkEditPlan(
        editPlanSchema.parse(value),
        operationContext as EditPlanJobContext,
      ),
    persistCandidate: async ({
      value,
      modelCall,
      operationContext,
      context,
      now: at,
    }) => {
      const planContext = operationContext as EditPlanJobContext;
      const plan = storedEditPlan(
        editPlanSchema.parse(value),
        planContext,
        modelCall.id as Identifier,
      );
      const answered = plan.operations.every(
        ({ operation }) => operation.type === "answer-only",
      );
      const [updated] = await input.database
        .update(lessonEditMessages)
        .set({
          plan,
          status: answered ? "answered" : "proposed",
          text: plan.summary,
          modelCallId: modelCall.id,
          beforeRevision: plan.expectedRevision,
          operationStates: plan.operations.map(({ id }) => ({
            operationId: id,
            state: "proposed",
            jobId: null,
            candidateId: null,
            errorCode: null,
          })),
          updatedAt: at,
        })
        .where(
          and(
            eq(lessonEditMessages.id, planContext.messageId),
            eq(lessonEditMessages.ownerUserId, context.ownerUserId),
            eq(lessonEditMessages.projectId, context.projectId),
            eq(lessonEditMessages.status, "planning"),
          ),
        )
        .returning({ id: lessonEditMessages.id });
      if (updated === undefined)
        throw new JobExecutionError(
          "terminal",
          alreadyResolvedCode,
          "This edit request has already been planned.",
        );
      return { id: updated.id as Identifier };
    },
    ...(input.pricing === undefined ? {} : { pricing: input.pricing }),
  });

  return defineJobHandler(
    editPlanJobType,
    2,
    modelCallJobPayloadSchema,
    async (payload, context) => {
      const params = editPlanParamsSchema.safeParse(payload.params ?? {});
      if (!params.success)
        throw new JobExecutionError(
          "terminal",
          "PAYLOAD_VALIDATION_FAILED",
          "The edit-plan job parameters are invalid.",
        );
      const messageId = params.data.messageId as Identifier;
      try {
        const result = await planned.handler(payload, context);
        return { ...result, editPlan: "planned", messageId };
      } catch (error) {
        const failure = classifyJobError(error);
        if (failure.code === alreadyResolvedCode)
          return { editPlan: "already_resolved", messageId };
        if (failure.classification === "retryable" && context.attempt < maxAttempts)
          throw error;
        await markPlanFailed(input.database, context, messageId, failure.code, now());
        throw error;
      }
    },
  );
}
