import { createHash } from "node:crypto";
import {
  createId,
  PublicError,
  serializeUtcTimestamp,
  type Identifier,
} from "@avlp/config";
import {
  jobs,
  lessonEditMessages,
  lessonEditThreads,
  lessonSpecs,
  loadEditPlanStoryboardContext,
  narrationSets,
  outboxEvents,
  type DatabaseClient,
  type DatabaseExecutor,
  type EditPlanStoryboardContext,
} from "@avlp/database";
import { createIdempotencyKey, createJobEnvelope } from "@avlp/jobs";
import { PostgresAuditWriter } from "@avlp/observability";
import { QuotaExceededError, type QuotaGuard } from "@avlp/provider-adapters";
import { validateScene } from "@avlp/scene-library";
import {
  currentEditPlanCompatibility,
  editPlanApplyInputSchema,
  editPlanDismissInputSchema,
  editPlanParamsSchema,
  editPlanSceneEdits,
  editPlanUndoInputSchema,
  editThreadMessageInputSchema,
  editThreadMessageSchema,
  editThreadOperationProgressSchema,
  editThreadPageQuerySchema,
  editThreadPageSize,
  editThreadPlanSchema,
  editThreadResponseSchema,
  editThreadScopeSchema,
  editTurnUndoSnapshotSchema,
  modelCallJobPayloadSchema,
  validateEditPlan,
  type EditPlanConflictDetails,
  type EditThreadMessage,
  type EditThreadMessageStatus,
  type EditThreadOperationProgress,
  type EditThreadPlan,
  type EditThreadPlanOperation,
  type EditThreadResponse,
  type EditThreadScope,
  type SceneSpec,
} from "@avlp/schemas";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { requestActor } from "./audit-actor.js";
import { createModelCallProviderApproval } from "./model-call-approval.js";
import type { NarrationService } from "./narration.js";
import type { StoryboardService } from "./storyboard.js";

export const editPlanJobType = "storyboard.edit-plan" as const;

type Scope = { ownerUserId: Identifier; projectId: Identifier };

/**
 * ST-115. The conversational edit layer over the storyboard workspace. A
 * teacher message queues one metered planning job; the plan it returns is a
 * proposal until the teacher applies it, and applying dispatches only to the
 * existing storyboard and narration services (ST-049, ST-051, ST-055,
 * ST-056). Message text is user content: it is stored on the thread, sent to
 * the planner, and never logged or audited (ADR-013 §3).
 */
export interface EditThreadService {
  /** One page of the thread: the latest by default, or the messages
   * before `before` (an `earlierCursor` from a previous page). */
  list(input: Scope & { before?: unknown }): Promise<EditThreadResponse>;
  postMessage(
    input: Scope & {
      body: unknown;
      idempotencyKey: string | undefined;
      correlationId: Identifier;
    },
  ): Promise<EditThreadResponse>;
  applyPlan(
    input: Scope & {
      planId: Identifier;
      body: unknown;
      correlationId: Identifier;
    },
  ): Promise<EditThreadResponse>;
  dismissPlan(
    input: Scope & {
      planId: Identifier;
      body: unknown;
      correlationId: Identifier;
    },
  ): Promise<EditThreadResponse>;
  undoPlan(
    input: Scope & {
      planId: Identifier;
      body: unknown;
      correlationId: Identifier;
    },
  ): Promise<EditThreadResponse>;
}

type MessageRow = typeof lessonEditMessages.$inferSelect;

const operationStatesSchema = z.array(editThreadOperationProgressSchema);
const operationIdsSchema = z.array(z.string());

function parseBoundary<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  throw new PublicError(
    "validation_failed",
    "The request body is invalid.",
    400,
    false,
    Object.fromEntries(
      parsed.error.issues.map((issue) => [
        issue.path.join("."),
        issue.message,
      ]),
    ),
  );
}

function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function planNotFound(): PublicError {
  return new PublicError("not_found", "The requested resource was not found.", 404);
}

function stalePlan(currentRevision: number | null): PublicError {
  const details: EditPlanConflictDetails = { action: "re-plan", currentRevision };
  return new PublicError(
    "edit_conflict",
    "The storyboard changed after this plan was made. Re-plan to apply it to the current storyboard.",
    409,
    false,
    undefined,
    undefined,
    details,
  );
}

function couldNotPlan(): PublicError {
  return new PublicError(
    "validation_failed",
    "We couldn't plan that change. Nothing was applied. Try rephrasing the request or narrowing its scope.",
    400,
  );
}

/** Teacher-facing failure text for a plan that could not be made. */
export function editPlanFailureMessage(code: string | null): string {
  switch (code) {
    case "EDIT_PLAN_INVALID":
    case "STRUCTURED_OUTPUT_INVALID":
    case "MODEL_OUTPUT_DETERMINISTIC_FAILURE":
      return "We couldn't plan that change. Try rephrasing the request or narrowing its scope.";
    case "EDIT_PLAN_STALE":
      return "The storyboard changed while this was being planned. Ask again to plan against the current storyboard.";
    case "AI_QUOTA_EXCEEDED":
      return "This project has reached its AI request limit for now. Try again later.";
    case "SOURCE_SNAPSHOT_STALE":
    case "SOURCE_SNAPSHOT_NOT_FOUND":
      return "The reviewed source changed. Review it again before asking for changes.";
    default:
      return "We couldn't plan that change right now. Try again in a moment.";
  }
}

/** The existing service each plan operation is dispatched to (ST-115 adds no
 * new way to change a lesson). `null` for an answer, which changes nothing. */
export type EditOperationTarget =
  | "storyboard.updateScene"
  | "storyboard.reorderScenes"
  | "storyboard.regenerateScene"
  | "narration.regenerateBlock";

export function editOperationTarget(
  operation: EditThreadPlanOperation["operation"],
): EditOperationTarget | null {
  switch (operation.type) {
    case "edit-scene-field":
      return "storyboard.updateScene";
    case "reorder-scenes":
      return "storyboard.reorderScenes";
    case "regenerate-scene":
      return "storyboard.regenerateScene";
    case "regenerate-narration-block":
      return "narration.regenerateBlock";
    case "answer-only":
      return null;
  }
}

export class PostgresEditThreadService implements EditThreadService {
  private readonly now: () => Date;

  public constructor(
    private readonly options: {
      database: DatabaseClient;
      storyboard: Pick<
        StoryboardService,
        "reorderScenes" | "updateScene" | "regenerateScene" | "restoreEditTurn"
      >;
      narration: Pick<NarrationService, "regenerateBlock">;
      /** Fails a request fast when the project's AI quota is spent. The job
       * enforces the same quota again before its provider call. */
      quotaGuard?: QuotaGuard;
      maxTurnsPerHour: number;
      now?: () => Date;
    },
  ) {
    this.now = options.now ?? (() => new Date());
  }

  public async list(
    input: Scope & { before?: unknown },
  ): Promise<EditThreadResponse> {
    const { before } = parseBoundary(editThreadPageQuerySchema, {
      ...(input.before === undefined ? {} : { before: input.before }),
    });
    const { database } = this.options;
    const [thread] = await database
      .select({ id: lessonEditThreads.id })
      .from(lessonEditThreads)
      .where(
        and(
          eq(lessonEditThreads.ownerUserId, input.ownerUserId),
          eq(lessonEditThreads.projectId, input.projectId),
        ),
      )
      .limit(1);
    const revision = await this.currentRevision(database, input);
    const used =
      thread === undefined
        ? 0
        : await this.turnsThisHour(database, input, thread.id as Identifier);
    const turnLimit = {
      limit: this.options.maxTurnsPerHour,
      used,
      remaining: Math.max(0, this.options.maxTurnsPerHour - used),
    };
    if (thread === undefined)
      return editThreadResponseSchema.parse({
        threadId: null,
        storyboardRevision: revision,
        turnLimit,
        messages: [],
        earlierCursor: null,
      });
    // Every turn takes two consecutive sequence numbers (request, reply), so
    // an even page size read newest-first always holds whole turns.
    const newestFirst = await database
      .select()
      .from(lessonEditMessages)
      .where(
        and(
          eq(lessonEditMessages.threadId, thread.id),
          eq(lessonEditMessages.ownerUserId, input.ownerUserId),
          eq(lessonEditMessages.projectId, input.projectId),
          ...(before === undefined ? [] : [lt(lessonEditMessages.seq, before)]),
        ),
      )
      .orderBy(desc(lessonEditMessages.seq))
      .limit(editThreadPageSize + 1);
    const rows = newestFirst.slice(0, editThreadPageSize).reverse();
    const earlierCursor =
      newestFirst.length > editThreadPageSize ? (rows[0]?.seq ?? null) : null;
    const jobIds = [
      ...new Set(
        rows.flatMap((row) => [
          ...(row.jobId === null ? [] : [row.jobId]),
          ...operationStatesSchema
            .catch([])
            .parse(row.operationStates)
            .flatMap((state) => (state.jobId === null ? [] : [state.jobId])),
        ]),
      ),
    ];
    const jobRows =
      jobIds.length === 0
        ? []
        : await database
            .select({
              id: jobs.id,
              state: jobs.state,
              resultMetadata: jobs.resultMetadata,
              errorMetadata: jobs.errorMetadata,
            })
            .from(jobs)
            .where(
              and(
                eq(jobs.ownerUserId, input.ownerUserId),
                eq(jobs.projectId, input.projectId),
                inArray(jobs.id, jobIds),
              ),
            );
    const jobById = new Map(jobRows.map((row) => [row.id, row]));
    // Read across the whole thread, not just this page.
    const [latestUndoable] = await database
      .select({ id: lessonEditMessages.id })
      .from(lessonEditMessages)
      .where(
        and(
          eq(lessonEditMessages.threadId, thread.id),
          eq(lessonEditMessages.ownerUserId, input.ownerUserId),
          eq(lessonEditMessages.projectId, input.projectId),
          eq(lessonEditMessages.role, "assistant"),
          inArray(lessonEditMessages.status, ["applied", "partly_applied"]),
        ),
      )
      .orderBy(desc(lessonEditMessages.seq))
      .limit(1);
    const messages = rows.map((row) =>
      this.toMessage(row, {
        jobById,
        revision,
        latestUndoableId: latestUndoable?.id ?? null,
      }),
    );
    return editThreadResponseSchema.parse({
      threadId: thread.id,
      storyboardRevision: revision,
      turnLimit,
      messages,
      earlierCursor,
    });
  }

  public async postMessage(
    input: Scope & {
      body: unknown;
      idempotencyKey: string | undefined;
      correlationId: Identifier;
    },
  ): Promise<EditThreadResponse> {
    const parsed = parseBoundary(editThreadMessageInputSchema, input.body);
    const idempotencyKey = input.idempotencyKey?.trim();
    if (
      idempotencyKey === undefined ||
      idempotencyKey.length === 0 ||
      idempotencyKey.length > 200
    )
      throw new PublicError(
        "validation_failed",
        "An idempotency key is required to send an edit request.",
        400,
        false,
        { "idempotency-key": "Provide a non-empty key up to 200 characters." },
      );
    const hash = requestHash({
      text: parsed.text,
      scope: parsed.scope,
      expectedRevision: parsed.expectedRevision,
    });
    const timestamp = this.now();
    await this.options.database.transaction(async (transaction) => {
      // A replay returns the original turn instead of planning (and billing)
      // it again. Checked first so a replay never trips the revision check,
      // and again under the thread lock for two concurrent first deliveries.
      const replayed = async (): Promise<boolean> => {
        const [replay] = await transaction
          .select({ requestHash: lessonEditMessages.requestHash })
          .from(lessonEditMessages)
          .where(
            and(
              eq(lessonEditMessages.ownerUserId, input.ownerUserId),
              eq(lessonEditMessages.projectId, input.projectId),
              eq(lessonEditMessages.idempotencyKey, idempotencyKey),
            ),
          )
          .limit(1);
        if (replay === undefined) return false;
        if (replay.requestHash !== hash)
          throw new PublicError(
            "edit_conflict",
            "This request key was already used for a different request.",
            409,
          );
        return true;
      };
      if (await replayed()) return;
      const context = await loadEditPlanStoryboardContext(transaction, input);
      if (context === undefined)
        throw new PublicError(
          "bad_request",
          "There is no storyboard draft to change. Generate or reopen a draft first.",
          409,
        );
      if (context.revision !== parsed.expectedRevision)
        throw new PublicError(
          "edit_conflict",
          "The storyboard changed. Refresh it and send your request again.",
          409,
        );
      const known = new Set(context.scenes.map((scene) => scene.stableSceneId));
      if (parsed.scope.sceneIds.some((sceneId) => !known.has(sceneId)))
        throw new PublicError(
          "validation_failed",
          "The selected scenes are not in this storyboard.",
          400,
          false,
          { "scope.sceneIds": "Select scenes from the current storyboard." },
        );
      const thread = await this.lockThread(transaction, input, timestamp);
      if (await replayed()) return;
      if (
        (await this.turnsThisHour(transaction, input, thread.id)) >=
        this.options.maxTurnsPerHour
      )
        throw new PublicError(
          "rate_limited",
          `You can send ${this.options.maxTurnsPerHour} change requests an hour. Try again later.`,
          429,
          true,
        );
      try {
        await this.options.quotaGuard?.assertCanGenerate({
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          operationType: "ai.edit-plan",
          now: timestamp,
        });
      } catch (error) {
        if (error instanceof QuotaExceededError)
          throw new PublicError(
            "rate_limited",
            "This project has reached its AI request limit for now. Try again later.",
            429,
            true,
          );
        throw error;
      }
      const [narrationSet] = await transaction
        .select({ sourceSnapshotId: narrationSets.sourceSnapshotId })
        .from(narrationSets)
        .where(
          and(
            eq(narrationSets.id, context.storyboard.basedOnNarrationSetId),
            eq(narrationSets.ownerUserId, input.ownerUserId),
            eq(narrationSets.projectId, input.projectId),
          ),
        )
        .limit(1);
      if (narrationSet === undefined)
        throw new PublicError(
          "bad_request",
          "Generate narration before asking for changes.",
          409,
        );
      const teacherId = createId(timestamp);
      const assistantId = createId(timestamp);
      const jobId = createId(timestamp);
      const params = editPlanParamsSchema.parse({
        threadId: thread.id,
        messageId: assistantId,
        lessonSpecId: context.lessonSpecId,
        lessonSpecRevision: context.revision,
      });
      const payload = modelCallJobPayloadSchema.parse({
        schemaVersion: 2,
        operationType: "ai.edit-plan",
        sourceSnapshotId: narrationSet.sourceSnapshotId,
        promptId: currentEditPlanCompatibility.promptId,
        promptVersion: currentEditPlanCompatibility.promptVersion,
        model: currentEditPlanCompatibility.model,
        providerApproval: createModelCallProviderApproval({
          jobId,
          model: currentEditPlanCompatibility.model,
        }),
        params,
      });
      const inputVersion = [
        "edit-plan",
        assistantId,
        currentEditPlanCompatibility.promptVersion,
      ].join(":");
      const envelope = createJobEnvelope(modelCallJobPayloadSchema, {
        jobId,
        jobType: editPlanJobType,
        projectId: input.projectId,
        ownerUserId: input.ownerUserId,
        inputVersion,
        idempotencyKey: createIdempotencyKey({
          jobType: editPlanJobType,
          projectId: input.projectId,
          inputVersion,
          options: { requestKey: idempotencyKey },
        }),
        correlationId: input.correlationId,
        payloadVersion: 2,
        payload,
        requestedAt: timestamp,
      });
      await transaction.insert(jobs).values({
        id: envelope.jobId,
        jobType: envelope.jobType,
        queueName: "pipeline",
        projectId: envelope.projectId,
        ownerUserId: envelope.ownerUserId,
        inputVersion: envelope.inputVersion,
        idempotencyKey: envelope.idempotencyKey,
        correlationId: envelope.correlationId,
        payloadVersion: envelope.payloadVersion,
        payload: envelope.payload,
      });
      await transaction.insert(outboxEvents).values({
        id: createId(timestamp),
        jobId: envelope.jobId,
        eventType: "storyboard.edit_plan_requested.v1",
        queueName: "pipeline",
        envelope,
        deliveryOptions: { maxAttempts: 3, retryDelayMs: 5_000 },
      });
      const seq = thread.messageSequence;
      await transaction.insert(lessonEditMessages).values([
        {
          id: teacherId,
          projectId: input.projectId,
          ownerUserId: input.ownerUserId,
          threadId: thread.id,
          seq: seq + 1,
          role: "teacher",
          replyToId: assistantId,
          text: parsed.text,
          scope: parsed.scope,
          status: "sent",
          idempotencyKey,
          requestHash: hash,
          beforeRevision: context.revision,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        {
          id: assistantId,
          projectId: input.projectId,
          ownerUserId: input.ownerUserId,
          threadId: thread.id,
          seq: seq + 2,
          role: "assistant",
          replyToId: teacherId,
          scope: parsed.scope,
          status: "planning",
          jobId: envelope.jobId,
          beforeRevision: context.revision,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ]);
      await transaction
        .update(lessonEditThreads)
        .set({ messageSequence: seq + 2, updatedAt: timestamp })
        .where(
          and(
            eq(lessonEditThreads.id, thread.id),
            eq(lessonEditThreads.ownerUserId, input.ownerUserId),
            eq(lessonEditThreads.projectId, input.projectId),
          ),
        );
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: requestActor(input),
        eventType: "edit_thread.message_posted",
        target: { type: "lesson_edit_message", id: teacherId },
        correlationId: input.correlationId,
        // AC8: lengths and counts only, never the message.
        metadata: {
          messageLength: parsed.text.length,
          scope: parsed.scope.kind,
          sceneCount: parsed.scope.sceneIds.length,
          lessonSpecRevision: context.revision,
          jobId: envelope.jobId,
          promptVersion: payload.promptVersion,
        },
        occurredAt: timestamp,
      });
    });
    return this.list(input);
  }

  public async applyPlan(
    input: Scope & {
      planId: Identifier;
      body: unknown;
      correlationId: Identifier;
    },
  ): Promise<EditThreadResponse> {
    const parsed = parseBoundary(editPlanApplyInputSchema, input.body);
    const { database } = this.options;
    const message = await this.assistantMessage(database, input, input.planId);
    if (message.status === "applied" || message.status === "partly_applied")
      return this.list(input);
    if (message.status !== "proposed")
      throw new PublicError(
        "bad_request",
        "This plan can no longer be applied.",
        409,
      );
    const plan = editThreadPlanSchema.parse(message.plan);
    const scope = editThreadScopeSchema.parse(message.scope);
    const actionable = plan.operations.filter(
      ({ operation }) => operation.type !== "answer-only",
    );
    const requested = new Set(
      parsed.operationIds ?? actionable.map(({ id }) => id),
    );
    if ([...requested].some((id) => !actionable.some((entry) => entry.id === id)))
      throw new PublicError(
        "validation_failed",
        "Choose operations from this plan.",
        400,
        false,
        { operationIds: "Unknown operation." },
      );
    const selected = actionable.filter(({ id }) => requested.has(id));
    const context = await loadEditPlanStoryboardContext(database, input);
    if (
      context === undefined ||
      context.revision !== parsed.expectedRevision ||
      context.revision !== plan.expectedRevision
    )
      throw stalePlan(context?.revision ?? null);
    if (
      selected.some(
        ({ operation }) => operation.type === "regenerate-narration-block",
      ) &&
      context.narrationSetRevision !== plan.narrationSetRevision
    )
      throw stalePlan(context.revision);
    // AC3: the whole selection is checked before anything runs.
    if (
      validateEditPlan(
        { operations: selected.map(({ operation }) => operation) },
        { ...context, scope },
      ).length > 0
    )
      throw couldNotPlan();
    const edits = editPlanSceneEdits(
      selected.map(({ operation }) => operation),
      context.scenes,
    );
    for (const [sceneId, edited] of edits) {
      const before = context.scenes.find(
        (scene) => scene.stableSceneId === sceneId,
      )!.scene;
      if (
        validateScene(edited).some((issue) => issue.code === "text_overflow") &&
        !validateScene(before).some((issue) => issue.code === "text_overflow")
      )
        throw couldNotPlan();
    }
    const timestamp = this.now();
    const [claimed] = await database
      .update(lessonEditMessages)
      .set({ status: "applying", updatedAt: timestamp })
      .where(
        and(
          eq(lessonEditMessages.id, message.id),
          eq(lessonEditMessages.ownerUserId, input.ownerUserId),
          eq(lessonEditMessages.projectId, input.projectId),
          eq(lessonEditMessages.status, "proposed"),
        ),
      )
      .returning({ id: lessonEditMessages.id });
    if (claimed === undefined) return this.list(input);

    const outcome = await this.dispatch({
      scope: input,
      correlationId: input.correlationId,
      messageId: message.id as Identifier,
      plan,
      selected,
      edits,
      context,
    });
    const succeeded = outcome.states.filter(
      (state) => state.state === "applied" || state.state === "queued",
    );
    const failed = outcome.states.filter((state) => state.state === "failed");
    if (succeeded.length === 0) {
      await database
        .update(lessonEditMessages)
        .set({ status: "proposed", updatedAt: this.now() })
        .where(
          and(
            eq(lessonEditMessages.id, message.id),
            eq(lessonEditMessages.ownerUserId, input.ownerUserId),
            eq(lessonEditMessages.projectId, input.projectId),
            eq(lessonEditMessages.status, "applying"),
          ),
        );
      throw outcome.error ?? couldNotPlan();
    }
    const status: EditThreadMessageStatus =
      failed.length === 0 && succeeded.length === actionable.length
        ? "applied"
        : "partly_applied";
    const changed = outcome.revision !== context.revision;
    await database
      .update(lessonEditMessages)
      .set({
        status,
        operationStates: outcome.states,
        appliedOperationIds: succeeded.map((state) => state.operationId),
        beforeRevision: context.revision,
        afterRevision: outcome.revision,
        undoSnapshot: changed ? outcome.snapshot : null,
        errorCode: failed[0]?.errorCode ?? null,
        updatedAt: this.now(),
      })
      .where(
        and(
          eq(lessonEditMessages.id, message.id),
          eq(lessonEditMessages.ownerUserId, input.ownerUserId),
          eq(lessonEditMessages.projectId, input.projectId),
        ),
      );
    await new PostgresAuditWriter(database).write({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      actor: requestActor(input),
      eventType: "edit_thread.plan_applied",
      target: { type: "lesson_edit_message", id: message.id },
      correlationId: input.correlationId,
      metadata: {
        operationCount: plan.operations.length,
        selectedCount: selected.length,
        appliedCount: succeeded.length,
        queuedCount: outcome.states.filter((state) => state.state === "queued")
          .length,
        failedCount: failed.length,
        beforeRevision: context.revision,
        afterRevision: outcome.revision,
      },
      occurredAt: this.now(),
    });
    return this.list(input);
  }

  /**
   * Runs the selected operations through the existing services, one after
   * another, each against the revision the previous one produced. Field edits
   * run first (one ST-056 edit per scene), then the reorder, then generated
   * operations, so a reorder never invalidates a scene edit and regeneration
   * jobs see the final revision. Generated operations only queue a job whose
   * candidate the teacher reviews; nothing generated is applied here.
   */
  private async dispatch(input: {
    scope: Scope;
    correlationId: Identifier;
    messageId: Identifier;
    plan: EditThreadPlan;
    selected: readonly EditThreadPlanOperation[];
    edits: ReadonlyMap<string, SceneSpec>;
    context: EditPlanStoryboardContext;
  }): Promise<{
    states: EditThreadOperationProgress[];
    revision: number;
    snapshot: unknown;
    error: unknown;
  }> {
    const { storyboard, narration } = this.options;
    const states = new Map<string, EditThreadOperationProgress>(
      input.plan.operations.map(({ id }) => [
        id,
        {
          operationId: id,
          state: "skipped",
          jobId: null,
          candidateId: null,
          errorCode: null,
        },
      ]),
    );
    const set = (id: string, patch: Partial<EditThreadOperationProgress>) =>
      states.set(id, { ...states.get(id)!, ...patch });
    let revision = input.context.revision;
    let error: unknown;
    const target = (entry: EditThreadPlanOperation) =>
      editOperationTarget(entry.operation);
    const fieldOperations = input.selected.filter(
      (entry) => target(entry) === "storyboard.updateScene",
    );
    const reorder = input.selected.find(
      (entry) => target(entry) === "storyboard.reorderScenes",
    );
    const generated = input.selected.filter(
      (entry) =>
        target(entry) === "storyboard.regenerateScene" ||
        target(entry) === "narration.regenerateBlock",
    );
    const touched = new Set(input.edits.keys());
    const snapshot = editTurnUndoSnapshotSchema.parse({
      revision: input.context.revision,
      sceneOrder: input.context.storyboard.scenes
        .slice()
        .sort((left, right) => left.order - right.order)
        .map((scene) => scene.stableSceneId),
      scenes: input.context.storyboard.scenes.filter((scene) =>
        touched.has(scene.stableSceneId),
      ),
    });
    const failure = (cause: unknown): string =>
      cause instanceof PublicError ? cause.code : "unexpected_error";

    for (const [sceneId, scene] of input.edits) {
      const ids = fieldOperations
        .filter(
          ({ operation }) =>
            operation.type === "edit-scene-field" &&
            operation.sceneId === sceneId,
        )
        .map(({ id }) => id);
      if (error !== undefined) continue;
      try {
        const result = await storyboard.updateScene({
          ...input.scope,
          sceneId: sceneId as Identifier,
          body: { expectedRevision: revision, scene },
          correlationId: input.correlationId,
        });
        revision = result.revision;
        for (const id of ids) set(id, { state: "applied" });
      } catch (cause) {
        error = cause;
        for (const id of ids) set(id, { state: "failed", errorCode: failure(cause) });
      }
    }
    if (reorder !== undefined && error === undefined) {
      try {
        const result = await storyboard.reorderScenes({
          ...input.scope,
          body: {
            expectedRevision: revision,
            sceneIds:
              reorder.operation.type === "reorder-scenes"
                ? reorder.operation.sceneIds
                : [],
          },
          correlationId: input.correlationId,
        });
        revision = result.revision;
        set(reorder.id, { state: "applied" });
      } catch (cause) {
        error = cause;
        set(reorder.id, { state: "failed", errorCode: failure(cause) });
      }
    }
    for (const entry of generated) {
      if (error !== undefined) break;
      const { operation } = entry;
      const idempotencyKey = `edit-plan:${input.messageId}:${entry.id}`;
      try {
        if (operation.type === "regenerate-scene") {
          const result = await storyboard.regenerateScene({
            ...input.scope,
            sceneId: operation.sceneId as Identifier,
            body: {
              mode: operation.mode,
              ...(operation.instruction === undefined
                ? {}
                : { instruction: operation.instruction }),
              expectedRevision: revision,
            },
            idempotencyKey,
            correlationId: input.correlationId,
          });
          set(entry.id, { state: "queued", jobId: result.jobId });
        } else if (operation.type === "regenerate-narration-block") {
          const result = await narration.regenerateBlock({
            ...input.scope,
            blockId: operation.blockId as Identifier,
            body: {
              mode: operation.mode,
              ...(operation.instruction === undefined
                ? {}
                : { instruction: operation.instruction }),
              expectedRevision: input.plan.narrationSetRevision ?? 0,
            },
            idempotencyKey,
            correlationId: input.correlationId,
          });
          set(entry.id, { state: "queued", jobId: result.jobId });
        }
      } catch (cause) {
        error = cause;
        set(entry.id, { state: "failed", errorCode: failure(cause) });
      }
    }
    if (
      error instanceof PublicError &&
      error.code === "edit_conflict" &&
      [...states.values()].every(
        (state) => state.state !== "applied" && state.state !== "queued",
      )
    )
      error = stalePlan(await this.currentRevision(this.options.database, input.scope));
    return { states: [...states.values()], revision, snapshot, error };
  }

  public async dismissPlan(
    input: Scope & {
      planId: Identifier;
      body: unknown;
      correlationId: Identifier;
    },
  ): Promise<EditThreadResponse> {
    parseBoundary(editPlanDismissInputSchema, input.body ?? {});
    const { database } = this.options;
    const message = await this.assistantMessage(database, input, input.planId);
    if (message.status === "dismissed") return this.list(input);
    const timestamp = this.now();
    const [updated] = await database
      .update(lessonEditMessages)
      .set({ status: "dismissed", updatedAt: timestamp })
      .where(
        and(
          eq(lessonEditMessages.id, message.id),
          eq(lessonEditMessages.ownerUserId, input.ownerUserId),
          eq(lessonEditMessages.projectId, input.projectId),
          eq(lessonEditMessages.status, "proposed"),
        ),
      )
      .returning({ id: lessonEditMessages.id });
    if (updated === undefined)
      throw new PublicError(
        "bad_request",
        "Only a proposed plan can be dismissed.",
        409,
      );
    await new PostgresAuditWriter(database).write({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      actor: requestActor(input),
      eventType: "edit_thread.plan_dismissed",
      target: { type: "lesson_edit_message", id: message.id },
      correlationId: input.correlationId,
      metadata: {
        operationCount: editThreadPlanSchema.safeParse(message.plan).data
          ?.operations.length ?? 0,
      },
      occurredAt: timestamp,
    });
    return this.list(input);
  }

  public async undoPlan(
    input: Scope & {
      planId: Identifier;
      body: unknown;
      correlationId: Identifier;
    },
  ): Promise<EditThreadResponse> {
    const parsed = parseBoundary(editPlanUndoInputSchema, input.body);
    const { database } = this.options;
    const message = await this.assistantMessage(database, input, input.planId);
    if (message.status === "undone") return this.list(input);
    if (
      (message.status !== "applied" && message.status !== "partly_applied") ||
      message.undoSnapshot === null ||
      message.afterRevision === null
    )
      throw new PublicError(
        "bad_request",
        "This turn made no storyboard change to undo.",
        409,
      );
    const [later] = await database
      .select({ id: lessonEditMessages.id })
      .from(lessonEditMessages)
      .where(
        and(
          eq(lessonEditMessages.threadId, message.threadId),
          eq(lessonEditMessages.ownerUserId, input.ownerUserId),
          eq(lessonEditMessages.projectId, input.projectId),
          eq(lessonEditMessages.role, "assistant"),
          inArray(lessonEditMessages.status, ["applied", "partly_applied"]),
          sql`${lessonEditMessages.seq} > ${message.seq}`,
        ),
      )
      .limit(1);
    if (later !== undefined)
      throw new PublicError(
        "bad_request",
        "Only the most recent applied change can be undone.",
        409,
      );
    const revision = await this.currentRevision(database, input);
    if (
      revision === null ||
      revision !== parsed.expectedRevision ||
      revision !== message.afterRevision
    )
      throw new PublicError(
        "edit_conflict",
        "The storyboard changed after this turn, so it can no longer be undone.",
        409,
      );
    const restored = await this.options.storyboard.restoreEditTurn({
      ...input,
      expectedRevision: revision,
      snapshot: message.undoSnapshot,
    });
    const timestamp = this.now();
    await database
      .update(lessonEditMessages)
      .set({ status: "undone", afterRevision: restored.revision, updatedAt: timestamp })
      .where(
        and(
          eq(lessonEditMessages.id, message.id),
          eq(lessonEditMessages.ownerUserId, input.ownerUserId),
          eq(lessonEditMessages.projectId, input.projectId),
        ),
      );
    await new PostgresAuditWriter(database).write({
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      actor: requestActor(input),
      eventType: "edit_thread.plan_undone",
      target: { type: "lesson_edit_message", id: message.id },
      correlationId: input.correlationId,
      metadata: {
        restoredRevision: message.beforeRevision,
        lessonSpecRevision: restored.revision,
      },
      occurredAt: timestamp,
    });
    return this.list(input);
  }

  private async assistantMessage(
    executor: DatabaseExecutor,
    scope: Scope,
    messageId: Identifier,
  ): Promise<MessageRow> {
    const [row] = await executor
      .select()
      .from(lessonEditMessages)
      .where(
        and(
          eq(lessonEditMessages.id, messageId),
          eq(lessonEditMessages.ownerUserId, scope.ownerUserId),
          eq(lessonEditMessages.projectId, scope.projectId),
          eq(lessonEditMessages.role, "assistant"),
        ),
      )
      .limit(1);
    if (row === undefined) throw planNotFound();
    return row;
  }

  /** Creates the project's thread on first use and locks it, so concurrent
   * requests take message sequence numbers one at a time. */
  private async lockThread(
    executor: DatabaseExecutor,
    scope: Scope,
    timestamp: Date,
  ): Promise<{ id: Identifier; messageSequence: number }> {
    await executor
      .insert(lessonEditThreads)
      .values({
        id: createId(timestamp),
        projectId: scope.projectId,
        ownerUserId: scope.ownerUserId,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing();
    const [thread] = await executor
      .select({
        id: lessonEditThreads.id,
        messageSequence: lessonEditThreads.messageSequence,
      })
      .from(lessonEditThreads)
      .where(
        and(
          eq(lessonEditThreads.ownerUserId, scope.ownerUserId),
          eq(lessonEditThreads.projectId, scope.projectId),
        ),
      )
      .limit(1)
      .for("update");
    if (thread === undefined)
      throw new Error("The edit thread could not be read.");
    return { id: thread.id as Identifier, messageSequence: thread.messageSequence };
  }

  private async turnsThisHour(
    executor: DatabaseExecutor,
    scope: Scope,
    threadId: Identifier,
  ): Promise<number> {
    const since = new Date(this.now().getTime() - 60 * 60 * 1000);
    const [row] = await executor
      .select({ count: sql<number>`count(*)::int` })
      .from(lessonEditMessages)
      .where(
        and(
          eq(lessonEditMessages.threadId, threadId),
          eq(lessonEditMessages.ownerUserId, scope.ownerUserId),
          eq(lessonEditMessages.projectId, scope.projectId),
          eq(lessonEditMessages.role, "teacher"),
          gte(lessonEditMessages.createdAt, since),
        ),
      );
    return Number(row?.count ?? 0);
  }

  private async currentRevision(
    executor: DatabaseExecutor,
    scope: Scope,
  ): Promise<number | null> {
    const [row] = await executor
      .select({ revision: lessonSpecs.revision })
      .from(lessonSpecs)
      .where(
        and(
          eq(lessonSpecs.ownerUserId, scope.ownerUserId),
          eq(lessonSpecs.projectId, scope.projectId),
          eq(lessonSpecs.status, "draft"),
        ),
      )
      .orderBy(desc(lessonSpecs.generatedAt))
      .limit(1);
    return row?.revision ?? null;
  }

  /**
   * One stored message as the client sees it. A planning message whose job
   * has failed is reported failed even if the worker could not record it,
   * and a queued generated operation is `ready` once its candidate exists.
   */
  private toMessage(
    row: MessageRow,
    context: {
      jobById: ReadonlyMap<
        string,
        {
          state: string;
          resultMetadata: unknown;
          errorMetadata: unknown;
        }
      >;
      revision: number | null;
      latestUndoableId: string | null;
    },
  ): EditThreadMessage {
    let status = row.status as EditThreadMessageStatus;
    let errorCode = row.errorCode;
    if (status === "planning" && row.jobId !== null) {
      const job = context.jobById.get(row.jobId);
      if (job?.state === "failed" || job?.state === "cancelled") {
        status = "failed";
        errorCode = errorCodeOf(job.errorMetadata) ?? "EDIT_PLAN_FAILED";
      }
    }
    const operations = operationStatesSchema
      .catch([])
      .parse(row.operationStates)
      .map((state) => {
        if (state.state !== "queued" || state.jobId === null) return state;
        const job = context.jobById.get(state.jobId);
        if (job?.state === "succeeded")
          return {
            ...state,
            state: "ready" as const,
            candidateId: candidateIdOf(job.resultMetadata),
          };
        if (job?.state === "failed" || job?.state === "cancelled")
          return {
            ...state,
            state: "failed" as const,
            errorCode: errorCodeOf(job.errorMetadata) ?? "JOB_FAILED",
          };
        return state;
      });
    const plan = row.plan === null ? null : editThreadPlanSchema.parse(row.plan);
    return editThreadMessageSchema.parse({
      id: row.id,
      seq: row.seq,
      role: row.role,
      replyToId: row.replyToId,
      text: row.text,
      scope: editThreadScopeSchema.parse(row.scope) satisfies EditThreadScope,
      status,
      plan,
      operations,
      appliedOperationIds: operationIdsSchema
        .catch([])
        .parse(row.appliedOperationIds),
      beforeRevision: row.beforeRevision,
      afterRevision: row.afterRevision,
      failure:
        status === "failed"
          ? { code: errorCode ?? "EDIT_PLAN_FAILED", message: editPlanFailureMessage(errorCode) }
          : null,
      canUndo:
        row.id === context.latestUndoableId &&
        row.undoSnapshot !== null &&
        row.afterRevision !== null &&
        row.afterRevision !== row.beforeRevision &&
        row.afterRevision === context.revision,
      createdAt: serializeUtcTimestamp(row.createdAt),
    });
  }
}

function errorCodeOf(metadata: unknown): string | null {
  const parsed = z
    .object({ code: z.string().max(100) })
    .passthrough()
    .safeParse(metadata);
  return parsed.success ? parsed.data.code : null;
}

function candidateIdOf(metadata: unknown): string | null {
  const parsed = z
    .object({ candidateId: z.string().uuid() })
    .passthrough()
    .safeParse(metadata);
  return parsed.success ? parsed.data.candidateId : null;
}
