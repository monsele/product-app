import {
  createId,
  PublicError,
  serializeUtcTimestamp,
  type Identifier,
} from "@avlp/config";
import {
  modelCalls,
  parsedSections,
  type DatabaseClient,
} from "@avlp/database";
import {
  PostgresAuditWriter,
  PostgresModelCallRepository,
  PostgresUsageMeter,
  type ModelCallRepository,
  type UsageMeter,
} from "@avlp/observability";
import {
  ApprovedProviderUnavailableError,
  estimateCostUsd,
  generateStructuredOutput,
  ProviderCallError,
  ProviderEnvelopeViolationError,
  QuotaExceededError,
  renderPrompt,
  repositoryPrompts,
  resolveJobAdapter,
  stableJsonHash,
  StaticPromptRegistry,
  StructuredOutputError,
  type LanguageModelProvider,
  type ModelPricingTable,
  type PromptRegistry,
  type ProviderCompletionResponse,
  type QuotaGuard,
} from "@avlp/provider-adapters";
import {
  currentLessonIntentCompatibility,
  lessonFocusPromptSchema,
  lessonIntentDocumentOutlineSchema,
  lessonIntentOutputV1Schema,
  lessonIntentSchema,
  modelCallRecordSchema,
  type LessonIntent,
  type LessonIntentDocumentOutline,
  type ModelCallProviderApproval,
  type ModelCallRecord,
} from "@avlp/schemas";
import { and, asc, eq } from "drizzle-orm";
import { createModelCallProviderApproval } from "./model-call-approval.js";
import { findLatestProjectParsedDocument } from "./project-parsed-document.js";
import { requestActor } from "./audit-actor.js";

const operationType = "ai.lesson-intent" as const;
const maximumHeadings = 200;
const maximumOutlineTextLength = 300;

/**
 * ST-104. Infers a subject and a lesson title from a focus prompt. Used
 * internally by the prompt-to-video runner (ST-105); there is no public
 * endpoint. The call only ever sees the focus prompt plus the parsed document
 * title and section headings — never body text (ADR-013).
 */
export interface LessonIntentService {
  infer(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    focusPrompt: string;
    /** One key per logical inference. Reusing a key is rejected rather than
     * re-billed, because the result itself is not stored for replay. */
    idempotencyKey: string;
    correlationId: Identifier;
    /** ST-105. The authorising prompt-to-video run. */
    oneShotRunId?: Identifier | undefined;
  }): Promise<LessonIntent>;
}

type Context = {
  ownerUserId: Identifier;
  projectId: Identifier;
  correlationId: Identifier;
  modelCallKey: string;
  promptVersion: string;
  model: string;
  inputVersion: string;
  inputHash: string;
  timestamp: Date;
  /** ST-105. Which authorisation paid for the call, for the usage record. */
  providerSelection: {
    selectionReason: ModelCallProviderApproval["selectionReason"];
    approvalReference: Identifier;
    oneShotRunId?: Identifier;
  };
};

export class ProviderLessonIntentService implements LessonIntentService {
  private readonly promptRegistry: PromptRegistry;
  private readonly modelCallRepository: ModelCallRepository;
  private readonly usageMeter: UsageMeter;
  private readonly now: () => Date;

  public constructor(
    private readonly options: {
      database: DatabaseClient;
      provider: LanguageModelProvider;
      quotaGuard: QuotaGuard;
      promptRegistry?: PromptRegistry;
      modelCalls?: ModelCallRepository;
      usageMeter?: UsageMeter;
      pricing?: ModelPricingTable;
      maxRepairs?: number;
      now?: () => Date;
    },
  ) {
    this.promptRegistry =
      options.promptRegistry ?? new StaticPromptRegistry(repositoryPrompts);
    this.modelCallRepository =
      options.modelCalls ?? new PostgresModelCallRepository(options.database);
    this.usageMeter =
      options.usageMeter ?? new PostgresUsageMeter(options.database);
    this.now = options.now ?? (() => new Date());
  }

  public async infer(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    focusPrompt: string;
    idempotencyKey: string;
    correlationId: Identifier;
    oneShotRunId?: Identifier | undefined;
  }): Promise<LessonIntent> {
    const focus = lessonFocusPromptSchema.safeParse(input.focusPrompt);
    if (!focus.success)
      throw new PublicError(
        "validation_failed",
        "Describe what the lesson should focus on in up to 1,000 characters.",
        400,
        false,
        { focusPrompt: "Enter 1 to 1,000 characters." },
      );
    const idempotencyKey = input.idempotencyKey.trim();
    if (idempotencyKey.length === 0 || idempotencyKey.length > 200)
      throw new PublicError(
        "validation_failed",
        "An idempotency key is required to infer the lesson intent.",
        400,
      );
    const outline = await this.loadDocumentOutline(
      input.ownerUserId,
      input.projectId,
    );
    const compatibility = currentLessonIntentCompatibility;
    const modelCallKey = `lesson-intent:${stableJsonHash({ idempotencyKey })}`;
    await this.assertKeyUnused(input.ownerUserId, input.projectId, modelCallKey);

    const prompt = this.promptRegistry.get(
      compatibility.promptId,
      compatibility.promptVersion,
    );
    const rendered = renderPrompt(prompt, {
      focus: focus.data,
      documentOutline: JSON.stringify(outline),
    });
    const timestamp = this.now();
    const approval = createModelCallProviderApproval({
      jobId: createId(timestamp),
      model: compatibility.model,
      oneShotRunId: input.oneShotRunId,
    });
    const context: Context = {
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      correlationId: input.correlationId,
      modelCallKey,
      promptVersion: compatibility.promptVersion,
      model: compatibility.model,
      // Binds the prompt version, model, and exact inputs, so a changed focus
      // or re-parsed document is a different input version.
      inputVersion: `lesson-intent:${stableJsonHash({
        promptId: compatibility.promptId,
        promptVersion: compatibility.promptVersion,
        model: compatibility.model,
        focus: focus.data,
        outline,
      })}`,
      inputHash: stableJsonHash({ focus: focus.data, outline }),
      timestamp,
      providerSelection: {
        selectionReason: approval.selectionReason,
        approvalReference: approval.approvalReference,
        ...(approval.oneShotRunId === undefined
          ? {}
          : { oneShotRunId: approval.oneShotRunId }),
      },
    };
    try {
      const resolved = resolveJobAdapter({
        jobType: operationType,
        adapterFamily: "language-model",
        adapter: this.options.provider,
        approvedProvider: approval.providerId,
        approvedModel: approval.model,
        executingModel: compatibility.model,
        approvalReference: approval.approvalReference,
        estimatedCostUsd: approval.estimatedCostUsd,
        selectionReason: approval.selectionReason,
        ...(approval.oneShotRunId === undefined
          ? {}
          : { oneShotRunId: approval.oneShotRunId }),
      });
      await this.options.quotaGuard.assertCanGenerate({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        operationType,
        now: timestamp,
      });
      const structured = await generateStructuredOutput({
        provider: resolved.adapter,
        request: {
          model: compatibility.model,
          messages: [
            { role: "system", content: rendered.system },
            { role: "user", content: rendered.user },
          ],
          responseFormat: "json_object",
        },
        schema: lessonIntentOutputV1Schema,
        ...(this.options.maxRepairs === undefined
          ? {}
          : { maxRepairs: this.options.maxRepairs }),
      });
      const executed = structured.responses.at(-1);
      if (
        executed === undefined ||
        executed.providerId !== resolved.adapter.providerId ||
        executed.model !== compatibility.model
      ) {
        await this.recordCall(context, structured.responses, {
          status: "failed",
          errorCode: "APPROVED_PROVIDER_UNAVAILABLE",
          providerId: resolved.adapter.providerId,
        });
        throw providerUnavailable();
      }
      const record = await this.recordCall(context, structured.responses, {
        status: "succeeded",
        validationStatus:
          structured.repairAttempts > 0 ? "repaired" : "validated",
        providerId: resolved.adapter.providerId,
      });
      await new PostgresAuditWriter(this.options.database).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: requestActor(input),
        eventType: "ai.generated",
        target: { type: "model_call", id: record.id },
        correlationId: input.correlationId,
        // Never the focus text or the headings: both are user content.
        metadata: {
          operationType,
          promptId: compatibility.promptId,
          promptVersion: compatibility.promptVersion,
          model: compatibility.model,
          inputVersion: context.inputVersion,
          providerSelection: {
            ...resolved.selection,
            model: compatibility.model,
            actualCostUsd: record.estimatedCostUsd,
          },
        },
        occurredAt: timestamp,
      });
      return lessonIntentSchema.parse({
        subject: structured.value.subject,
        lessonTitle: structured.value.lessonTitle,
        modelCallId: record.id,
      });
    } catch (error) {
      if (error instanceof PublicError) throw error;
      if (error instanceof QuotaExceededError)
        throw new PublicError(
          "rate_limited",
          "The AI generation quota for this project has been reached.",
          429,
          true,
        );
      if (
        error instanceof ProviderEnvelopeViolationError ||
        error instanceof ApprovedProviderUnavailableError
      )
        throw providerUnavailable();
      if (error instanceof StructuredOutputError) {
        await this.recordCall(context, error.responses, {
          status: "failed",
          errorCode: "STRUCTURED_OUTPUT_INVALID",
          providerId: this.options.provider.providerId,
        });
        throw new PublicError(
          "internal_error",
          "The lesson subject and title could not be inferred.",
          502,
          false,
        );
      }
      if (error instanceof ProviderCallError) {
        await this.recordCall(context, [], {
          status: "failed",
          errorCode: error.code,
          providerId: this.options.provider.providerId,
        });
        throw new PublicError(
          "internal_error",
          "The AI provider could not be reached. Try again shortly.",
          502,
          error.retryable,
        );
      }
      throw error;
    }
  }

  /**
   * The parsed title and section headings, tenant-scoped through the
   * project's parsed document. Body text is never selected.
   */
  private async loadDocumentOutline(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<LessonIntentDocumentOutline> {
    const document = await findLatestProjectParsedDocument(
      this.options.database,
      { ownerUserId, projectId },
    );
    if (document === undefined)
      throw new PublicError(
        "bad_request",
        "The source document has not been processed yet.",
        409,
        true,
      );
    const sections = await this.options.database
      .select({ heading: parsedSections.heading })
      .from(parsedSections)
      .where(eq(parsedSections.parsedDocumentId, document.id))
      .orderBy(asc(parsedSections.pageStart), asc(parsedSections.order))
      .limit(maximumHeadings);
    const clip = (value: string) =>
      value.trim().slice(0, maximumOutlineTextLength).trim();
    return lessonIntentDocumentOutlineSchema.parse({
      title:
        document.title === null || clip(document.title).length === 0
          ? null
          : clip(document.title),
      headings: sections
        .map((section) => clip(section.heading))
        .filter((heading) => heading.length > 0),
    });
  }

  private async assertKeyUnused(
    ownerUserId: Identifier,
    projectId: Identifier,
    modelCallKey: string,
  ): Promise<void> {
    const [existing] = await this.options.database
      .select({ id: modelCalls.id })
      .from(modelCalls)
      .where(
        and(
          eq(modelCalls.ownerUserId, ownerUserId),
          eq(modelCalls.projectId, projectId),
          eq(modelCalls.idempotencyKey, modelCallKey),
        ),
      )
      .limit(1);
    if (existing !== undefined)
      throw new PublicError(
        "edit_conflict",
        "This lesson-intent request was already made. Use a new idempotency key.",
        409,
      );
  }

  /** One model-call record and one usage record per provider interaction. */
  private async recordCall(
    context: Context,
    responses: readonly ProviderCompletionResponse[],
    outcome:
      | {
          status: "succeeded";
          validationStatus: "validated" | "repaired";
          providerId: string;
        }
      | { status: "failed"; errorCode: string; providerId: string },
  ): Promise<ModelCallRecord> {
    const inputUnits = responses.reduce(
      (total, response) => total + response.usage.inputTokens,
      0,
    );
    const outputUnits = responses.reduce(
      (total, response) => total + response.usage.outputTokens,
      0,
    );
    const record = modelCallRecordSchema.parse({
      id: createId(context.timestamp),
      projectId: context.projectId,
      ownerUserId: context.ownerUserId,
      operationType,
      idempotencyKey: context.modelCallKey,
      promptId: currentLessonIntentCompatibility.promptId,
      promptVersion: context.promptVersion,
      provider: outcome.providerId,
      model: context.model,
      inputVersion: context.inputVersion,
      inputHash: context.inputHash,
      inputUnits,
      outputUnits,
      estimatedCostUsd: estimateCostUsd({
        model: context.model,
        inputTokens: inputUnits,
        outputTokens: outputUnits,
        ...(this.options.pricing === undefined
          ? {}
          : { pricing: this.options.pricing }),
      }),
      latencyMs: responses.reduce(
        (total, response) => total + response.latencyMs,
        0,
      ),
      retryCount: Math.max(0, responses.length - 1),
      validationStatus:
        outcome.status === "succeeded" ? outcome.validationStatus : "invalid",
      status: outcome.status,
      errorCode: outcome.status === "failed" ? outcome.errorCode : null,
      correlationId: context.correlationId,
      createdAt: serializeUtcTimestamp(context.timestamp),
    });
    let created = await this.modelCallRepository.create({
      record,
      now: context.timestamp,
    });
    let meteringKey = context.modelCallKey;
    if (created.id !== record.id) {
      // A concurrent request with the same key passed `assertKeyUnused` too
      // and recorded first. This provider call was still made and billed, so
      // it gets its own model-call and usage records rather than being
      // silently absorbed by the idempotent insert.
      meteringKey = `${context.modelCallKey}:concurrent:${record.id}`;
      created = await this.modelCallRepository.create({
        record: { ...record, idempotencyKey: meteringKey },
        now: context.timestamp,
      });
    }
    await this.usageMeter.record({
      ownerUserId: context.ownerUserId,
      projectId: context.projectId,
      operationType,
      idempotencyKey: meteringKey,
      provider: record.provider,
      model: record.model,
      unit: "token",
      quantity: inputUnits + outputUnits,
      inputUnits,
      outputUnits,
      estimatedCostUsd: record.estimatedCostUsd,
      latencyMs: record.latencyMs,
      retryCount: record.retryCount,
      status: outcome.status,
      correlationId: context.correlationId,
      metadata: {
        promptId: record.promptId,
        promptVersion: record.promptVersion,
        modelCallId: created.id,
        providerSelection: context.providerSelection,
      },
      occurredAt: context.timestamp,
    });
    return { ...record, id: created.id };
  }
}

function providerUnavailable(): PublicError {
  return new PublicError(
    "internal_error",
    "The configured AI provider is unavailable for this operation.",
    503,
    true,
  );
}
