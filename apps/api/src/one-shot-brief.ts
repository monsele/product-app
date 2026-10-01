/**
 * ST-107 — the prompt-to-video video brief (`ai.one-shot-brief`).
 *
 * One small, structured model call made on the user's explicit "Prepare
 * brief". It is quota-checked, metered and recorded like every other model
 * call, and it runs before any paid generation. It sees only the focus
 * prompt, the audience, the target length, the document title, the section
 * headings and each section's first block. It chooses only from closed lists
 * (the document's section IDs, the registered style packs, and the active
 * sound-bed tracks), and the output schema rejects anything else. Rejections
 * go through the bounded structured-output repair policy; nothing falls back
 * silently.
 *
 * The brief supersedes `ai.lesson-intent` for runs that have one: it returns
 * the same subject and title.
 *
 * Never logged: the focus prompt, headings, block text or the brief itself.
 */

import {
  createId,
  PublicError,
  serializeUtcTimestamp,
  type Identifier,
} from "@avlp/config";
import {
  contentBlocks,
  jobs,
  parsedSections,
  soundBedTracks,
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
  describePromptAudience,
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
  currentOneShotBriefCompatibility,
  modelCallRecordSchema,
  type ModelCallRecord,
} from "@avlp/schemas";
import {
  createOneShotBriefOutputSchema,
  oneShotPlannedSceneRange,
  oneShotStylePackIds,
  type OneShotAudience,
  type OneShotBriefOutput,
} from "@avlp/schemas/one-shot";
import { and, asc, desc, eq } from "drizzle-orm";
import { createModelCallProviderApproval } from "./model-call-approval.js";
import { findLatestProjectParsedDocument } from "./project-parsed-document.js";

const operationType = "ai.one-shot-brief" as const;
/** Bounds on what the brief call may see. */
const maximumSections = 60;
const maximumHeadingLength = 300;
const maximumFirstBlockLength = 400;

/** One-line descriptions the model chooses a style pack from. */
const stylePackDescriptions: Readonly<Record<string, string>> = {
  essential:
    "Warm white, ink black, restrained accent, large type. Strongest for science concepts and foundational lessons.",
  editorial:
    "Charcoal, ivory, amber, bold headlines, annotated evidence. Strongest for history, economics and persuasive explanations.",
  everyday:
    "Cobalt, mint, cream, friendly geometric illustration. Strongest for financial literacy, practical maths and everyday explanations.",
  systems:
    "Ink or pale neutral backgrounds, fine connectors, precise diagrams. Strongest for technology, processes and cause and effect.",
  "field-notes":
    "Paper tones, graphite, rust, olive, clean annotations. Strongest for biology, geography and worked explanations.",
  prism:
    "Saturated colour fields, oversized type, bold cutouts. Strongest for short introductions, revision and younger audiences.",
};

export type PreparedBrief = {
  output: OneShotBriefOutput;
  /** Headings of the sections the coverage cites, for the source chips. */
  sections: { sectionId: Identifier; heading: string }[];
  modelCallId: Identifier;
  costUsd: number;
  model: string;
  promptVersion: string;
};

export interface OneShotBriefGenerator {
  /**
   * Refuses (409, retryable) while the document has not been read yet, and
   * (422, not retryable) once reading it has failed. Called
   * before a brief call is counted, so waiting for ingestion never uses up
   * one of the run's brief calls.
   */
  assertReady(scope: {
    ownerUserId: Identifier;
    projectId: Identifier;
  }): Promise<void>;
  prepare(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    runId: Identifier;
    correlationId: Identifier;
    /** One key per brief call; reusing it is rejected rather than re-billed. */
    idempotencyKey: string;
    focusPrompt: string;
    audience: OneShotAudience;
    targetDurationSeconds: 180 | 300 | 420;
  }): Promise<PreparedBrief>;
}

type Outline = {
  title: string | null;
  sections: { sectionId: string; heading: string; firstBlock: string }[];
};

type CallContext = {
  ownerUserId: Identifier;
  projectId: Identifier;
  correlationId: Identifier;
  modelCallKey: string;
  inputVersion: string;
  inputHash: string;
  timestamp: Date;
  providerSelection: {
    selectionReason: "one_shot_run";
    approvalReference: Identifier;
    oneShotRunId: Identifier;
  };
};

export class ProviderOneShotBriefService implements OneShotBriefGenerator {
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

  public async assertReady(scope: {
    ownerUserId: Identifier;
    projectId: Identifier;
  }): Promise<void> {
    await this.loadOutline(scope.ownerUserId, scope.projectId);
  }

  public async prepare(
    input: Parameters<OneShotBriefGenerator["prepare"]>[0],
  ): Promise<PreparedBrief> {
    const outline = await this.loadOutline(input.ownerUserId, input.projectId);
    const trackRows = await this.options.database
      .select({
        trackId: soundBedTracks.trackId,
        title: soundBedTracks.title,
        moodTags: soundBedTracks.moodTags,
      })
      .from(soundBedTracks)
      .where(eq(soundBedTracks.status, "active"))
      .orderBy(asc(soundBedTracks.sortOrder));
    const compatibility = currentOneShotBriefCompatibility;
    const schema = createOneShotBriefOutputSchema({
      sectionIds: outline.sections.map((section) => section.sectionId),
      soundBedTrackIds: trackRows.map((row) => row.trackId),
      targetDurationSeconds: input.targetDurationSeconds,
    });
    const scenes = oneShotPlannedSceneRange(input.targetDurationSeconds);
    const prompt = this.promptRegistry.get(
      compatibility.promptId,
      compatibility.promptVersion,
    );
    const stylePacks = oneShotStylePackIds.map((id) => ({
      id,
      description: stylePackDescriptions[id] ?? id,
    }));
    const soundBeds = trackRows.map((row) => ({
      trackId: row.trackId,
      title: row.title,
      moods: row.moodTags,
    }));
    const rendered = renderPrompt(prompt, {
      focus: input.focusPrompt,
      audience: describePromptAudience(input.audience),
      targetDurationSeconds: String(input.targetDurationSeconds),
      minScenes: String(scenes.min),
      maxScenes: String(scenes.max),
      documentOutline: JSON.stringify(outline),
      stylePacks: JSON.stringify(stylePacks),
      soundBeds: JSON.stringify(soundBeds),
    });
    const timestamp = this.now();
    const approval = createModelCallProviderApproval({
      jobId: createId(timestamp),
      model: compatibility.model,
      oneShotRunId: input.runId,
    });
    const inputs = {
      focus: input.focusPrompt,
      audience: input.audience,
      targetDurationSeconds: input.targetDurationSeconds,
      outline,
      stylePacks: oneShotStylePackIds,
      soundBeds: soundBeds.map((track) => track.trackId),
    };
    const context: CallContext = {
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      correlationId: input.correlationId,
      modelCallKey: `one-shot-brief:${stableJsonHash({ key: input.idempotencyKey })}`,
      inputVersion: `one-shot-brief:${stableJsonHash({
        promptId: compatibility.promptId,
        promptVersion: compatibility.promptVersion,
        model: compatibility.model,
        ...inputs,
      })}`,
      inputHash: stableJsonHash(inputs),
      timestamp,
      providerSelection: {
        selectionReason: "one_shot_run",
        approvalReference: approval.approvalReference,
        oneShotRunId: input.runId,
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
        oneShotRunId: input.runId,
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
        schema,
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
        // The user asked for the brief: it is their action, not the run's.
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "ai.generated",
        target: { type: "model_call", id: record.id },
        correlationId: input.correlationId,
        // Never the focus, headings or brief: all user or source content.
        metadata: {
          operationType,
          promptId: compatibility.promptId,
          promptVersion: compatibility.promptVersion,
          model: compatibility.model,
          inputVersion: context.inputVersion,
          oneShotRunId: input.runId,
          providerSelection: {
            ...resolved.selection,
            model: compatibility.model,
            actualCostUsd: record.estimatedCostUsd,
          },
        },
        occurredAt: timestamp,
      });
      const cited = new Set(
        structured.value.coverage.flatMap((point) => point.sectionIds),
      );
      return {
        output: structured.value,
        sections: outline.sections
          .filter((section) => cited.has(section.sectionId))
          .map((section) => ({
            sectionId: section.sectionId as Identifier,
            heading: section.heading,
          })),
        modelCallId: record.id as Identifier,
        costUsd: record.estimatedCostUsd,
        model: compatibility.model,
        promptVersion: `${compatibility.promptId}/${compatibility.promptVersion}`,
      };
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
          "The video brief could not be prepared from this document. Try again, or change the request.",
          502,
          true,
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
   * The document title, section headings and each section's first block,
   * tenant-scoped through the project's parsed document. Nothing else of the
   * body is read.
   */
  private async loadOutline(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<Outline> {
    const document = await findLatestProjectParsedDocument(this.options.database, {
      ownerUserId,
      projectId,
    });
    if (document === undefined) {
      // A failed read never produces a parsed document, so waiting for one
      // would never end; say so instead of "still being read".
      const [ingestion] = await this.options.database
        .select({ state: jobs.state })
        .from(jobs)
        .where(
          and(
            eq(jobs.ownerUserId, ownerUserId),
            eq(jobs.projectId, projectId),
            eq(jobs.jobType, "document.ingestion"),
          ),
        )
        .orderBy(desc(jobs.createdAt))
        .limit(1);
      if (ingestion?.state === "failed")
        throw new PublicError(
          "bad_request",
          "We could not read your document, so the brief cannot be prepared. Upload the document again in a new project.",
          422,
        );
      throw new PublicError(
        "bad_request",
        "Your document is still being read. Try preparing the brief again in a moment.",
        409,
        true,
      );
    }
    const sections = await this.options.database
      .select({ id: parsedSections.id, heading: parsedSections.heading })
      .from(parsedSections)
      .where(eq(parsedSections.parsedDocumentId, document.id))
      .orderBy(asc(parsedSections.pageStart), asc(parsedSections.order))
      .limit(maximumSections);
    const clip = (value: string, max: number) =>
      value.replace(/\s+/g, " ").trim().slice(0, max).trim();
    const firstBlocks = new Map<string, string>();
    for (const section of sections) {
      const [block] = await this.options.database
        .select({ content: contentBlocks.content })
        .from(contentBlocks)
        .where(
          and(
            eq(contentBlocks.parsedDocumentId, document.id),
            eq(contentBlocks.sectionId, section.id),
          ),
        )
        .orderBy(asc(contentBlocks.order))
        .limit(1);
      if (block !== undefined)
        firstBlocks.set(section.id, clip(blockText(block.content), maximumFirstBlockLength));
    }
    const usable = sections
      .map((section) => ({
        sectionId: section.id,
        heading: clip(section.heading, maximumHeadingLength),
        firstBlock: firstBlocks.get(section.id) ?? "",
      }))
      // A section with no content (a document-title heading, say) can never
      // be cited by a scene, so a brief point on it could never be covered.
      .filter(
        (section) => section.heading.length > 0 && section.firstBlock.length > 0,
      );
    if (usable.length === 0)
      throw new PublicError(
        "bad_request",
        "Your document has no sections the video could be planned from.",
        409,
      );
    return {
      title:
        document.title === null || clip(document.title, maximumHeadingLength).length === 0
          ? null
          : clip(document.title, maximumHeadingLength),
      sections: usable,
    };
  }

  /** One model-call record and one usage record per provider interaction. */
  private async recordCall(
    context: CallContext,
    responses: readonly ProviderCompletionResponse[],
    outcome:
      | {
          status: "succeeded";
          validationStatus: "validated" | "repaired";
          providerId: string;
        }
      | { status: "failed"; errorCode: string; providerId: string },
  ): Promise<ModelCallRecord> {
    const compatibility = currentOneShotBriefCompatibility;
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
      promptId: compatibility.promptId,
      promptVersion: compatibility.promptVersion,
      provider: outcome.providerId,
      model: compatibility.model,
      inputVersion: context.inputVersion,
      inputHash: context.inputHash,
      inputUnits,
      outputUnits,
      estimatedCostUsd: estimateCostUsd({
        model: compatibility.model,
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
      // A concurrent request with the same key recorded first. This provider
      // call was still made and billed, so it is metered on its own.
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

/** Plain text of a stored content block: paragraph text or list items. */
function blockText(content: unknown): string {
  if (typeof content !== "object" || content === null) return "";
  const record = content as { text?: unknown; items?: unknown };
  if (typeof record.text === "string") return record.text;
  if (Array.isArray(record.items))
    return record.items.filter((item): item is string => typeof item === "string").join("; ");
  return "";
}

function providerUnavailable(): PublicError {
  return new PublicError(
    "internal_error",
    "The configured AI provider is unavailable for this operation.",
    503,
    true,
  );
}
