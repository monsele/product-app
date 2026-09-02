import { createHash } from "node:crypto";
import { createId, type Identifier } from "@avlp/config";
import {
  illustrationGenerationCandidates,
  projectAssets,
  scenes,
  usageRecords,
  type DatabaseClient,
} from "@avlp/database";
import {
  defineJobHandler,
  JobExecutionError,
  type RegisteredJobHandler,
} from "@avlp/jobs";
import { illustrationGenerationJobPayloadSchema } from "@avlp/schemas";
import {
  ProviderCallError,
  type IllustrationProvider,
} from "@avlp/provider-adapters";
import { and, eq, or } from "drizzle-orm";
import sharp from "sharp";
import { storageKeys, type ObjectStorage } from "@avlp/storage";

export const illustrationGenerationJobType = "illustration.generate";

/**
 * Generates no active asset: successful output remains a moderated candidate
 * for an explicit teacher decision. Prompt construction is deliberately
 * scene-minimal and is supplied by the worker composition layer.
 */
export function createIllustrationGenerationJobHandler(input: {
  database: DatabaseClient;
  provider: IllustrationProvider;
  storage: Pick<ObjectStorage, "putBytes">;
  now?: () => Date;
}): RegisteredJobHandler {
  const now = input.now ?? (() => new Date());
  return defineJobHandler(
    illustrationGenerationJobType,
    1,
    illustrationGenerationJobPayloadSchema,
    async (payload, context) => {
      const [candidate] = await input.database
        .select()
        .from(illustrationGenerationCandidates)
        .where(
          and(
            eq(illustrationGenerationCandidates.id, payload.candidateId),
            eq(
              illustrationGenerationCandidates.ownerUserId,
              context.ownerUserId,
            ),
            eq(illustrationGenerationCandidates.projectId, context.projectId),
          ),
        )
        .limit(1);
      if (candidate === undefined)
        throw new JobExecutionError(
          "terminal",
          "ILLUSTRATION_CANDIDATE_NOT_FOUND",
          "The illustration candidate was not found.",
        );
      if (
        candidate.status === "pending_review" ||
        candidate.status === "accepted" ||
        candidate.status === "rejected"
      )
        return { status: candidate.status };
      const [scene] = await input.database
        .select({ sceneJson: scenes.sceneJson })
        .from(scenes)
        .where(and(
          eq(scenes.id, candidate.sceneId),
          eq(scenes.ownerUserId, context.ownerUserId),
          eq(scenes.projectId, context.projectId),
        ))
        .limit(1);
      if (scene === undefined)
        throw new JobExecutionError("terminal", "ILLUSTRATION_SCENE_NOT_FOUND", "The illustration scene was not found.");
      const [claimed] = await input.database
        .update(illustrationGenerationCandidates)
        .set({ status: "generating", updatedAt: now() })
        .where(
          and(
            eq(illustrationGenerationCandidates.id, candidate.id),
            or(
              eq(illustrationGenerationCandidates.status, "queued"),
              eq(illustrationGenerationCandidates.status, "failed"),
            ),
          ),
        )
        .returning({ id: illustrationGenerationCandidates.id });
      if (claimed === undefined) return { status: "already_processing" };
      try {
        const result = await input.provider.generate({
          prompt: illustrationPrompt(scene.sceneJson),
          size: "1024x1024",
          style: "flat-educational-vector",
        });
        if (result.moderation.status !== "approved") {
          await input.database.transaction(async (transaction) => {
            await transaction
              .insert(usageRecords)
              .values({
                id: createId(now()),
                ownerUserId: context.ownerUserId,
                projectId: context.projectId,
                operationType: "image.generation",
                idempotencyKey: `illustration:${candidate.id}`,
                provider: result.providerId,
                model: result.model ?? input.provider.model ?? null,
                unit: "image",
                quantity: result.units.toFixed(4),
                inputUnits: null,
                outputUnits: null,
                estimatedCostUsd: result.costUsd.toFixed(6),
                latencyMs: result.latencyMs ?? null,
                retryCount: result.retryCount ?? 0,
                status: "failed",
                correlationId: context.correlationId,
                metadata: { candidateId: candidate.id, moderationCode: result.moderation.code },
                occurredAt: now(),
              })
              .onConflictDoNothing();
            await transaction
              .update(illustrationGenerationCandidates)
              .set({
                status: "failed",
                moderationStatus: "rejected",
                failureCode: result.moderation.code,
                updatedAt: now(),
              })
              .where(eq(illustrationGenerationCandidates.id, candidate.id));
          });
          return { status: "rejected", code: result.moderation.code };
        }
        const metadata = await sharp(result.bytes, {
          limitInputPixels: 20_000_000,
        }).metadata();
        if (
          metadata.format !== "png" ||
          metadata.width === undefined ||
          metadata.height === undefined
        )
          throw new Error("INVALID_IMAGE_OUTPUT");
        const assetId = createId(now());
        const storageKey = storageKeys.assetOriginal({
          userId: context.ownerUserId as Identifier,
          projectId: context.projectId as Identifier,
          assetId,
          extension: "png",
        });
        const imageChecksumSha256 = createHash("sha256")
          .update(result.bytes)
          .digest("hex");
        await input.storage.putBytes({
          key: storageKey,
          body: result.bytes,
          contentType: "image/png",
          metadata: {
            "candidate-id": candidate.id,
            provenance: "ai-generated",
            sha256: imageChecksumSha256,
          },
        });
        await input.database.transaction(async (transaction) => {
          await transaction.insert(projectAssets).values({
            id: assetId,
            ownerUserId: context.ownerUserId,
            projectId: context.projectId,
            mediaType: "image/png",
            originalName: "generated-illustration.png",
            sizeBytes: result.bytes.byteLength,
            sha256: imageChecksumSha256,
            width: metadata.width,
            height: metadata.height,
            storageKey,
            provenance: "ai_generated",
            status: "pending_review",
          });
          await transaction
            .insert(usageRecords)
            .values({
              id: createId(now()),
              ownerUserId: context.ownerUserId,
              projectId: context.projectId,
              operationType: "image.generation",
              idempotencyKey: `illustration:${candidate.id}`,
              provider: result.providerId,
              model: result.model ?? input.provider.model ?? null,
              unit: "image",
              quantity: result.units.toFixed(4),
              inputUnits: null,
              outputUnits: null,
              estimatedCostUsd: result.costUsd.toFixed(6),
              latencyMs: result.latencyMs ?? null,
              retryCount: result.retryCount ?? 0,
              status: "succeeded",
              correlationId: context.correlationId,
              metadata: { candidateId: candidate.id },
              occurredAt: now(),
            })
            .onConflictDoNothing();
          await transaction
            .update(illustrationGenerationCandidates)
            .set({
              assetId,
              status: "pending_review",
              moderationStatus: "approved",
              providerCallId: result.providerCallId,
              updatedAt: now(),
            })
            .where(eq(illustrationGenerationCandidates.id, candidate.id));
        });
        return {
          status: "pending_review",
          width: metadata.width,
          height: metadata.height,
        };
      } catch (error) {
        await input.database
          .update(illustrationGenerationCandidates)
          .set({
            status: "failed",
            moderationStatus: "rejected",
            failureCode:
              error instanceof Error
                ? "ILLUSTRATION_GENERATION_FAILED"
                : "ILLUSTRATION_UNKNOWN_FAILURE",
            updatedAt: now(),
          })
          .where(eq(illustrationGenerationCandidates.id, candidate.id));
        throw new JobExecutionError(
          error instanceof ProviderCallError && error.retryable
            ? "retryable"
            : "terminal",
          error instanceof ProviderCallError
            ? error.code
            : "ILLUSTRATION_GENERATION_FAILED",
          "The illustration could not be generated.",
        );
      }
    },
  );
}

/** Bounded scene context only; approved source text is never sent to images. */
function illustrationPrompt(scene: unknown): string {
  const value = typeof scene === "object" && scene !== null ? scene as Record<string, unknown> : {};
  const title = typeof value.title === "string" ? value.title.slice(0, 160) : "lesson concept";
  const narration = typeof value.narration === "string" ? value.narration.slice(0, 400) : "";
  return `Create a simple flat educational supporting illustration for: ${title}. Context: ${narration}. No text, logos, people, or unsafe content.`;
}
