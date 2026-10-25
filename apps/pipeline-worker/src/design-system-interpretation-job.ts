import { Buffer } from "node:buffer";
import { createId } from "@avlp/config";
import {
  designSystems,
  designSystemAssets,
  designSystemInterpretations,
  jobs,
  projects,
  modelCalls,
  usageRecords,
  type DatabaseClient,
} from "@avlp/database";
import {
  defineJobHandler,
  JobExecutionError,
  type RegisteredJobHandler,
} from "@avlp/jobs";
import {
  estimateCostUsd,
  resolveJobAdapter,
  providerCompletionResponseSchema,
  ProviderCallError,
  type LanguageModelProvider,
  type PromptRegistry,
  type QuotaGuard,
  type ModelPricingTable,
  type ProviderCompletionResponse,
} from "@avlp/provider-adapters";
import {
  buildDesignSystemInterpretationProposal,
  designSystemContentHash,
  designSystemInterpretationInputSchema,
  designSystemInterpretationOutputSchema,
  designSystemInterpretationPayloadSchema,
  designSystemInterpretationProposalSchema,
  type DesignInterpretationSource,
} from "@avlp/schemas";
import { type ObjectStorage, storageKeys } from "@avlp/storage";
import { and, eq, isNull } from "drizzle-orm";
import sharp from "sharp";
import { inspectIsolatedDesignSystemPdf } from "./design-system-pdf-isolation.js";

const fail = (code: string, message: string) =>
  new JobExecutionError("terminal", code, message);

export function createDesignSystemInterpretationJobHandler(options: {
  database: DatabaseClient;
  storage: ObjectStorage;
  provider: LanguageModelProvider;
  promptRegistry: PromptRegistry;
  quotaGuard: QuotaGuard;
  pricing?: ModelPricingTable;
}): RegisteredJobHandler {
  const db = options.database;
  return defineJobHandler(
    "design-system.interpret",
    1,
    designSystemInterpretationPayloadSchema,
    async (payload, context) => {
      const predicate = and(
        eq(designSystemInterpretations.id, payload.interpretationId),
        eq(designSystemInterpretations.ownerUserId, context.ownerUserId),
        eq(designSystemInterpretations.projectId, context.projectId),
        eq(designSystemInterpretations.jobId, context.jobId),
      );
      const [row] = await db
        .select()
        .from(designSystemInterpretations)
        .where(predicate)
        .limit(1);
      if (!row)
        throw fail(
          "DESIGN_INTERPRETATION_NOT_FOUND",
          "The interpretation is unavailable.",
        );
      const input = designSystemInterpretationInputSchema.parse(row.input);
      const assertCurrent = async () => {
        const [current] = await db
          .select({
            revision: designSystems.revision,
            archivedAt: designSystems.archivedAt,
          })
          .from(designSystems)
          .innerJoin(
            projects,
            and(
              eq(projects.id, context.projectId),
              eq(projects.ownerUserId, context.ownerUserId),
              isNull(projects.deletedAt),
            ),
          )
          .where(
            and(
              eq(designSystems.id, row.systemId),
              eq(designSystems.ownerUserId, context.ownerUserId),
            ),
          )
          .limit(1);
        if (
          !current ||
          current.archivedAt !== null ||
          current.revision !== row.inputRevision
        )
          throw fail(
            "DESIGN_INTERPRETATION_STALE",
            "The design system changed. Request a new interpretation of the latest revision.",
          );
      };
      if (row.proposal !== null)
        return { interpretationId: row.id, reused: true };
      await assertCurrent();
      if (row.dispatchState === "calling")
        throw fail(
          "DESIGN_DISPATCH_UNCERTAIN",
          "A previous provider dispatch has no confirmed receipt. Review usage before making a new request; it will not be charged again automatically.",
        );
      if (row.dispatchState === "failed")
        throw fail(
          "DESIGN_INTERPRETATION_FAILED",
          "This interpretation failed. Review the materials before requesting another interpretation.",
        );
      const sources: DesignInterpretationSource[] = [
        { id: "request", kind: "request", text: input.request },
      ];
      const images: string[] = [];
      for (const pin of input.assets) {
        const [asset] = await db
          .select()
          .from(designSystemAssets)
          .where(
            and(
              eq(designSystemAssets.id, pin.id),
              eq(designSystemAssets.systemId, row.systemId),
              eq(designSystemAssets.ownerUserId, context.ownerUserId),
              eq(designSystemAssets.status, "active"),
              eq(designSystemAssets.validatedSha256, pin.sha256),
            ),
          )
          .limit(1);
        if (!asset)
          throw fail(
            "DESIGN_IMPORT_UNAVAILABLE",
            "A selected import is no longer available.",
          );
        const key = storageKeys.designSystemAsset({
          userId: context.ownerUserId,
          systemId: row.systemId,
          assetId: asset.id,
          stage: "validated",
          contentHash: pin.sha256,
        });
        if (asset.storageKey !== key)
          throw fail(
            "DESIGN_IMPORT_KEY_MISMATCH",
            "A selected import has an invalid storage identity.",
          );
        const object = await options.storage.getBytes(key, 10 * 1024 * 1024);
        // sha256 over raw bytes, not JSON serialization.
        const { createHash } = await import("node:crypto");
        if (
          createHash("sha256").update(object.body).digest("hex") !== pin.sha256
        )
          throw fail(
            "DESIGN_IMPORT_CHECKSUM_MISMATCH",
            "A selected import failed its checksum check.",
          );
        let text = "";
        if (asset.kind === "guide") {
          text =
            asset.mediaType === "application/pdf"
              ? ((
                  await inspectIsolatedDesignSystemPdf(object.body, {
                    extractText: true,
                  })
                ).text ?? "")
              : new TextDecoder("utf-8", { fatal: true }).decode(object.body);
          if (!text.trim())
            throw fail(
              "DESIGN_GUIDE_NO_TEXT",
              "This guide has no readable text. Upload Markdown or a text PDF, or describe the reference in your own words.",
            );
        } else if (asset.kind === "tokens")
          text = new TextDecoder("utf-8", { fatal: true }).decode(object.body);
        else if (asset.kind === "reference" || asset.kind === "logo") {
          if (images.length === 4)
            throw fail(
              "DESIGN_REFERENCE_LIMIT",
              "Choose at most four raster references.",
            );
          const bytes = await sharp(object.body, { limitInputPixels: 20000000 })
            .resize({
              width: 1024,
              height: 1024,
              fit: "inside",
              withoutEnlargement: true,
            })
            .jpeg({ quality: 80 })
            .toBuffer();
          if (bytes.length > 1000000)
            throw fail(
              "DESIGN_REFERENCE_LIMIT",
              "A reference image is too large. Upload a smaller reference.",
            );
          images.push(
            `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`,
          );
        } else text = JSON.stringify({ fontAssetId: asset.id });
        sources.push({
          id: asset.id,
          kind: asset.kind as DesignInterpretationSource["kind"],
          text,
        });
      }
      if (JSON.stringify(sources).length > 100000)
        throw fail(
          "DESIGN_CONTEXT_LIMIT",
          "The selected guides exceed the interpretation limit. Choose fewer or shorter materials.",
        );
      let response: ProviderCompletionResponse;
      if (row.response !== null)
        response = providerCompletionResponseSchema.parse(row.response);
      else {
        const approval = input.providerApproval;
        const resolved = resolveJobAdapter({
          jobType: "design-system.interpret",
          adapterFamily: "language-model",
          adapter: options.provider,
          approvedProvider: approval.providerId,
          approvedModel: approval.model,
          executingModel: approval.model,
          approvalReference: approval.approvalReference,
          estimatedCostUsd: approval.estimatedCostUsd,
          selectionReason: "explicit_job_request",
        });
        await options.quotaGuard.assertCanGenerate({
          ownerUserId: context.ownerUserId,
          projectId: context.projectId,
          operationType: "ai.creative_design",
        });
        const definition = options.promptRegistry.get(
          input.promptId,
          input.promptVersion,
        );
        // Substitute once; imported template-like text remains literal data.
        const prompt = {
          system: definition.system,
          user: definition.userTemplate.replace("{{designInput}}", () =>
            JSON.stringify({ definition: input.definition, sources }),
          ),
        };
        await context.heartbeat();
        const key = `design-interpret:${row.id}:attempt:${context.attempt}`;
        const claimed = await db.transaction(async (tx) => {
          const [system] = await tx
            .select()
            .from(designSystems)
            .where(
              and(
                eq(designSystems.id, row.systemId),
                eq(designSystems.ownerUserId, context.ownerUserId),
              ),
            )
            .for("update");
          if (
            !system ||
            system.revision !== row.inputRevision ||
            system.archivedAt !== null
          )
            throw fail(
              "DESIGN_INTERPRETATION_STALE",
              "The design system changed before dispatch.",
            );
          const [job] = await tx
            .select()
            .from(jobs)
            .where(
              and(
                eq(jobs.id, context.jobId),
                eq(jobs.ownerUserId, context.ownerUserId),
                eq(jobs.projectId, context.projectId),
              ),
            )
            .limit(1);
          if (!job || job.state === "cancelled" || job.state === "failed")
            throw fail(
              "DESIGN_JOB_CANCELLED",
              "The interpretation was cancelled.",
            );
          const [claim] = await tx
            .update(designSystemInterpretations)
            .set({ dispatchState: "calling", updatedAt: new Date() })
            .where(
              and(
                predicate,
                eq(designSystemInterpretations.dispatchState, "pending"),
              ),
            )
            .returning();
          if (!claim) return false;
          // Conservative durable reservation covers an ambiguous transport/process failure.
          await tx.insert(usageRecords).values({
            id: createId(),
            ownerUserId: context.ownerUserId,
            projectId: context.projectId,
            operationType: "ai.creative_design",
            idempotencyKey: key,
            provider: approval.providerId,
            model: approval.model,
            unit: "tokens",
            quantity: "0",
            estimatedCostUsd: approval.estimatedCostUsd.toFixed(6),
            status: "failed",
            correlationId: context.correlationId,
            metadata: {
              interpretationId: row.id,
              dispatchUncertain: true,
              approvalReference: approval.approvalReference,
            },
          });
          return true;
        });
        if (!claimed)
          throw fail(
            "DESIGN_DISPATCH_CLAIMED",
            "This interpretation has already been dispatched.",
          );
        try {
          response = providerCompletionResponseSchema.parse(
            await resolved.adapter.complete(
              {
                model: approval.model,
                messages: [
                  { role: "system", content: prompt.system },
                  { role: "user", content: prompt.user },
                ],
                referenceImages: images,
                maxOutputTokens: 8000,
                responseFormat: "json_object",
              },
              { disableRetries: true, redactResponse: true },
            ),
          );
        } catch (error) {
          // Only an explicit rate-limit rejection is known not to have generated output.
          const retry =
            error instanceof ProviderCallError &&
            error.code === "PROVIDER_RATE_LIMITED";
          await db.transaction(async (tx) => {
            await tx
              .insert(modelCalls)
              .values({
                id: createId(),
                ownerUserId: context.ownerUserId,
                projectId: context.projectId,
                operationType: "ai.creative_design",
                idempotencyKey: key,
                promptId: input.promptId,
                promptVersion: input.promptVersion,
                provider: approval.providerId,
                model: approval.model,
                inputVersion: row.inputHash,
                inputHash: row.inputHash,
                inputUnits: 0,
                outputUnits: 0,
                estimatedCostUsd: retry
                  ? "0"
                  : approval.estimatedCostUsd.toFixed(6),
                latencyMs: 0,
                retryCount: 0,
                validationStatus: "invalid",
                status: "failed",
                errorCode: retry
                  ? "PROVIDER_RATE_LIMITED"
                  : "DESIGN_DISPATCH_UNCERTAIN",
                correlationId: context.correlationId,
              })
              .onConflictDoNothing();
            await tx
              .update(designSystemInterpretations)
              .set({
                dispatchState: retry ? "pending" : "failed",
                updatedAt: new Date(),
              })
              .where(
                and(
                  predicate,
                  eq(designSystemInterpretations.dispatchState, "calling"),
                ),
              );
            if (retry)
              await tx
                .update(usageRecords)
                .set({
                  estimatedCostUsd: "0",
                  metadata: {
                    interpretationId: row.id,
                    dispatchUncertain: false,
                    errorCode: "PROVIDER_RATE_LIMITED",
                  },
                })
                .where(
                  and(
                    eq(usageRecords.ownerUserId, context.ownerUserId),
                    eq(usageRecords.projectId, context.projectId),
                    eq(usageRecords.idempotencyKey, key),
                  ),
                );
          });
          throw new JobExecutionError(
            retry ? "retryable" : "terminal",
            retry ? "PROVIDER_RATE_LIMITED" : "DESIGN_PROVIDER_DISPATCH_FAILED",
            retry
              ? "The provider rate-limited this request. It will retry."
              : "The provider did not confirm a result. Review usage before requesting another interpretation.",
          );
        }
        const cost =
          response.model !== approval.model
            ? approval.estimatedCostUsd
            : estimateCostUsd({
                model: approval.model,
                ...response.usage,
                ...(options.pricing ? { pricing: options.pricing } : {}),
              });
        await db.transaction(async (tx) => {
          await tx
            .update(designSystemInterpretations)
            .set({ dispatchState: "received", response, updatedAt: new Date() })
            .where(
              and(
                predicate,
                eq(designSystemInterpretations.dispatchState, "calling"),
              ),
            );
          await tx.insert(modelCalls).values({
            id: createId(),
            ownerUserId: context.ownerUserId,
            projectId: context.projectId,
            operationType: "ai.creative_design",
            idempotencyKey: key,
            promptId: input.promptId,
            promptVersion: input.promptVersion,
            provider: response.providerId,
            model: response.model,
            inputVersion: row.inputHash,
            inputHash: row.inputHash,
            inputUnits: response.usage.inputTokens,
            outputUnits: response.usage.outputTokens,
            estimatedCostUsd: cost.toFixed(6),
            latencyMs: response.latencyMs,
            retryCount: response.retries,
            validationStatus: "invalid",
            status: "succeeded",
            errorCode: null,
            correlationId: context.correlationId,
          });
          await tx
            .update(usageRecords)
            .set({
              quantity: String(
                response.usage.inputTokens + response.usage.outputTokens,
              ),
              inputUnits: response.usage.inputTokens,
              outputUnits: response.usage.outputTokens,
              estimatedCostUsd: cost.toFixed(6),
              latencyMs: response.latencyMs,
              retryCount: response.retries,
              status: "succeeded",
              metadata: {
                interpretationId: row.id,
                dispatchUncertain: false,
                approvalReference: approval.approvalReference,
              },
            })
            .where(
              and(
                eq(usageRecords.ownerUserId, context.ownerUserId),
                eq(usageRecords.projectId, context.projectId),
                eq(usageRecords.idempotencyKey, key),
              ),
            );
        });
      }
      if (
        response.providerId !== input.providerApproval.providerId ||
        response.model !== input.providerApproval.model
      )
        throw fail(
          "APPROVED_PROVIDER_UNAVAILABLE",
          "The provider returned a different model than approved.",
        );
      let proposal;
      try {
        if (response.finishReason !== "stop")
          throw new Error("Incomplete output.");
        proposal = buildDesignSystemInterpretationProposal(
          input.definition,
          designSystemInterpretationOutputSchema.parse(
            JSON.parse(response.text),
          ),
          sources,
        );
      } catch {
        throw fail(
          "DESIGN_OUTPUT_INVALID",
          "The interpretation was invalid. Review the materials and request a revised interpretation. Usage is recorded.",
        );
      }
      await db.transaction(async (tx) => {
        const [system] = await tx
          .select()
          .from(designSystems)
          .where(
            and(
              eq(designSystems.id, row.systemId),
              eq(designSystems.ownerUserId, context.ownerUserId),
            ),
          )
          .for("update");
        if (
          !system ||
          system.revision !== row.inputRevision ||
          system.archivedAt !== null
        )
          throw fail(
            "DESIGN_INTERPRETATION_STALE",
            "The design system changed while interpretation was running. Its result cannot replace your draft.",
          );
        const [job] = await tx
          .select({ state: jobs.state })
          .from(jobs)
          .where(
            and(
              eq(jobs.id, context.jobId),
              eq(jobs.ownerUserId, context.ownerUserId),
              eq(jobs.projectId, context.projectId),
            ),
          )
          .limit(1);
        if (!job || job.state === "cancelled" || job.state === "failed")
          throw fail(
            "DESIGN_JOB_CANCELLED",
            "The interpretation was cancelled before its result was saved.",
          );
        await tx
          .update(designSystemInterpretations)
          .set({
            proposal: designSystemInterpretationProposalSchema.parse(proposal),
            updatedAt: new Date(),
          })
          .where(predicate);
        await tx
          .update(modelCalls)
          .set({ validationStatus: "validated" })
          .where(
            and(
              eq(modelCalls.ownerUserId, context.ownerUserId),
              eq(modelCalls.projectId, context.projectId),
              eq(modelCalls.inputHash, row.inputHash),
              eq(modelCalls.status, "succeeded"),
            ),
          );
      });
      return {
        interpretationId: row.id,
        proposalHash: designSystemContentHash(proposal),
      };
    },
  );
}
