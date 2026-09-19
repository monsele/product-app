import { createId, type Identifier } from "@avlp/config";
import {
  creativeDesignDrafts,
  creativeDesignProposals,
  type DatabaseClient,
} from "@avlp/database";
import {
  creativeDesignProposalPatchSchema,
  type CreativeDesignProposalPatch,
} from "@avlp/schemas";
import type {
  LanguageModelProvider,
  ModelPricingTable,
  PromptRegistry,
  QuotaGuard,
} from "@avlp/provider-adapters";
import { and, eq } from "drizzle-orm";
import { createModelCallGenerationHandler } from "./model-call.js";

export function unsupportedRequestParts(request: string): readonly string[] {
  const normalized = request.toLowerCase();
  const unsupported: string[] = [];
  if (/\b(rewrite|summari[sz]e|delete|remove)\b/.test(normalized))
    unsupported.push("Educational text is not rewritten or removed by design changes.");
  if (/\b(generate|create|make)\b.{0,40}\b(image|photo|illustration|asset)\b/.test(normalized))
    unsupported.push("A design request cannot generate new images or incur an asset-generation charge.");
  if (/\b(upload|custom|google)\b.{0,40}\bfont\b/.test(normalized))
    unsupported.push("Only the pinned font pairs are available in this pilot.");
  if (/\b(url|website|svg|html)\b/.test(normalized))
    unsupported.push("External URLs and executable design instructions are not supported.");
  return Object.freeze(unsupported);
}

/**
 * Explicit, queued design interpretation. The teacher's request is retained
 * only in the job payload needed for execution; the durable proposal holds
 * the validated patch and provider metadata, never raw output or source text.
 */
export function createCreativeDesignInterpretationJobHandler(input: {
  database: DatabaseClient;
  provider: LanguageModelProvider;
  promptRegistry: PromptRegistry;
  quotaGuard: QuotaGuard;
  pricing?: ModelPricingTable;
}) {
  return createModelCallGenerationHandler<CreativeDesignProposalPatch>({
    jobType: "creative-design.interpret",
    payloadVersion: 2,
    operationType: "ai.creative_design",
    outputSchema: creativeDesignProposalPatchSchema,
    provider: input.provider,
    promptRegistry: input.promptRegistry,
    quotaGuard: input.quotaGuard,
    database: input.database,
    loadOperationContext: async ({ params, context }) => {
      const draftId = params.draftId as Identifier | undefined;
      const draftRevision = params.draftRevision;
      const request = params.request;
      if (
        draftId === undefined ||
        typeof draftRevision !== "number" ||
        typeof request !== "string"
      )
        throw new Error("Creative-design interpretation parameters are invalid.");
      const [draft] = await input.database
        .select()
        .from(creativeDesignDrafts)
        .where(
          and(
            eq(creativeDesignDrafts.id, draftId),
            eq(creativeDesignDrafts.ownerUserId, context.ownerUserId),
            eq(creativeDesignDrafts.projectId, context.projectId),
            eq(creativeDesignDrafts.revision, draftRevision),
          ),
        )
        .limit(1);
      if (draft === undefined)
        throw new Error("The creative-design draft changed before interpretation.");
      return {
        variables: {
          creativeDesignInput: JSON.stringify({ request, manifest: draft.manifest }),
        },
        context: { draftId, draftRevision, unsupported: unsupportedRequestParts(request) },
      };
    },
    persistCandidate: async ({ value, modelCall, operationContext, context, now }) => {
      const draft = operationContext as {
        draftId: Identifier;
        draftRevision: number;
        unsupported: readonly string[];
      };
      const [created] = await input.database
        .insert(creativeDesignProposals)
        .values({
          id: createId(now),
          ownerUserId: context.ownerUserId,
          projectId: context.projectId,
          draftId: draft.draftId,
          draftRevision: draft.draftRevision,
          modelCallId: modelCall.id,
          patch: value,
          unsupported: draft.unsupported,
          createdAt: now,
        })
        .onConflictDoNothing({ target: creativeDesignProposals.modelCallId })
        .returning({ id: creativeDesignProposals.id });
      if (created !== undefined) return { id: created.id as Identifier };
      const [existing] = await input.database
        .select({ id: creativeDesignProposals.id })
        .from(creativeDesignProposals)
        .where(
          and(
            eq(creativeDesignProposals.modelCallId, modelCall.id),
            eq(creativeDesignProposals.ownerUserId, context.ownerUserId),
            eq(creativeDesignProposals.projectId, context.projectId),
          ),
        )
        .limit(1);
      if (existing === undefined)
        throw new Error("The idempotent creative-design proposal could not be read.");
      return { id: existing.id as Identifier };
    },
    ...(input.pricing === undefined ? {} : { pricing: input.pricing }),
  });
}
