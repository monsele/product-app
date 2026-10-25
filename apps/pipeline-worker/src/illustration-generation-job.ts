import { createHash } from "node:crypto";
import { recoveryDispatch } from "./recovery-dispatch.js";
import { createId, type Identifier } from "@avlp/config";
import { loadApprovedDesignGuidance, illustrationPromptWithDesignGuidance } from "./design-system-guidance.js";
import {
  activeIllustrationLibraryEntries,
  copyLibraryIllustrationIntoProject,
  creativeDesignDrafts,
  illustrationGenerationCandidates,
  lessonSpecs,
  projectAssets,
  scenes,
  usageRecords,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import {
  defineJobHandler,
  JobExecutionError,
  type JobMetadata,
  type RegisteredJobHandler,
} from "@avlp/jobs";
import {
  anyCreativeDesignManifestSchema,
  cinemaIllustrationJobPayloadSchema,
  cinemaIllustrationKey,
  cinemaIllustrationPrompt,
  cinemaIllustrationSurface,
  creativeDesignHash,
  illustrationGenerationJobPayloadSchema,
  isCreativeDesignManifestV2,
  lessonStoryboardSchema,
  matchCinemaLibraryIllustration,
  validateCreativeDesignManifestV2,
  type CinemaIllustrationJobPayload,
  type CreativeDesignManifestV2,
} from "@avlp/schemas";
import {
  ApprovedProviderUnavailableError,
  ProviderCallError,
  ProviderEnvelopeViolationError,
  providerSelectionReason,
  resolveJobAdapter,
  type IllustrationProvider,
  type IllustrationRequest,
} from "@avlp/provider-adapters";
import { PostgresAuditWriter } from "@avlp/observability";
import { and, eq, or } from "drizzle-orm";
import sharp from "sharp";
import {
  storageKeySchema,
  storageKeys,
  type ObjectStorage,
} from "@avlp/storage";

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
  const auditWriter = new PostgresAuditWriter(input.database);
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
        .where(
          and(
            eq(scenes.id, candidate.sceneId),
            eq(scenes.ownerUserId, context.ownerUserId),
            eq(scenes.projectId, context.projectId),
          ),
        )
        .limit(1);
      if (scene === undefined)
        throw new JobExecutionError(
          "terminal",
          "ILLUSTRATION_SCENE_NOT_FOUND",
          "The illustration scene was not found.",
        );
      return generateCandidateIllustration({
        database: input.database,
        provider: input.provider,
        storage: input.storage,
        now,
        auditWriter,
        context,
        candidateId: candidate.id as Identifier,
        oneShotRunId: payload.oneShotRunId,
        request: {
          prompt: illustrationPrompt(scene.sceneJson),
          style: "flat-educational-vector",
        },
        onFailure: "throw",
      });
    },
  );
}

/** Bounded scene context only; approved source text is never sent to images. */
function illustrationPrompt(scene: unknown): string {
  const value =
    typeof scene === "object" && scene !== null
      ? (scene as Record<string, unknown>)
      : {};
  const title =
    typeof value.title === "string"
      ? value.title.slice(0, 160)
      : "lesson concept";
  const narration =
    typeof value.narration === "string" ? value.narration.slice(0, 400) : "";
  return `Create a simple flat educational supporting illustration for: ${title}. Context: ${narration}. No text, logos, people, or unsafe content.`;
}

type GenerationContext = Readonly<{
  jobId: string;
  ownerUserId: string;
  projectId: string;
  correlationId: string;
  attempt: number;
}>;

type ProviderUsage = Readonly<{
  providerId: string;
  model?: string | undefined;
  units: number;
  costUsd: number;
  latencyMs?: number | undefined;
  retryCount?: number | undefined;
}>;

/**
 * Claim → generate → moderate → store → meter, shared by both payload
 * versions. A v1 candidate stays `pending_review` for a teacher decision; a
 * v2 hero (ADR-015 §6, before approval only) is activated and bound in the
 * same transaction by `bind`. Usage is keyed by candidate, so a retried or
 * redelivered job meters one image at most once.
 *
 * `onFailure: "throw"` (v1) reports a failed generation as a job failure.
 * `"motif"` (v2) retries retryable failures until the final attempt and then
 * leaves the scene on its authored motif, so a video never waits on a person.
 */
async function generateCandidateIllustration(input: {
  database: DatabaseClient;
  provider: IllustrationProvider;
  storage: Pick<ObjectStorage, "putBytes">;
  now: () => Date;
  auditWriter: Pick<PostgresAuditWriter, "write">;
  context: GenerationContext;
  candidateId: Identifier;
  oneShotRunId: string | undefined;
  request: Pick<IllustrationRequest, "prompt" | "style">;
  onFailure: "throw" | "motif";
  maxAttempts?: number;
  bind?: (
    transaction: DatabaseExecutor,
    assetId: Identifier,
  ) => Promise<JobMetadata>;
  /** ST-113. Tried before the motif when `onFailure` is `"motif"`; returns
   * undefined when no library picture fits. */
  libraryFallback?: () => Promise<JobMetadata | undefined>;
}): Promise<JobMetadata> {
  const { context, now, candidateId } = input;
  const [claimed] = await input.database
    .update(illustrationGenerationCandidates)
    .set({ status: "generating", updatedAt: now() })
    .where(
      and(
        eq(illustrationGenerationCandidates.id, candidateId),
        or(
          eq(illustrationGenerationCandidates.status, "queued"),
          eq(illustrationGenerationCandidates.status, "failed"),
        ),
      ),
    )
    .returning({ id: illustrationGenerationCandidates.id });
  if (claimed === undefined) return { status: "already_processing" };
  // A failed generation never fails the video: a matching library picture is
  // pinned when one exists, otherwise the authored motif stays (AC3).
  const fallback = async (): Promise<JobMetadata> => {
    if (input.libraryFallback === undefined) return { fallback: "motif" };
    try {
      const library = await input.libraryFallback();
      return library === undefined
        ? { fallback: "motif" }
        : { fallback: "library", ...library };
    } catch (error) {
      // Only a code reaches job metadata, never a storage message or key.
      const code = error instanceof Error ? error.message : "";
      return {
        fallback: "motif",
        libraryError: /^[A-Z][A-Z0-9_]{2,63}$/u.test(code)
          ? code
          : "ILLUSTRATION_LIBRARY_UNAVAILABLE",
      };
    }
  };
  const usage = (
    result: ProviderUsage,
    status: "succeeded" | "failed",
    extra: Record<string, string>,
  ) => ({
    id: createId(now()),
    ownerUserId: context.ownerUserId,
    projectId: context.projectId,
    operationType: "image.generation" as const,
    idempotencyKey: `illustration:${candidateId}:${context.jobId}:${context.attempt}`,
    provider: result.providerId,
    model: result.model ?? input.provider.model ?? null,
    unit: "image" as const,
    quantity: result.units.toFixed(4),
    inputUnits: null,
    outputUnits: null,
    estimatedCostUsd: result.costUsd.toFixed(6),
    latencyMs: result.latencyMs ?? null,
    retryCount: result.retryCount ?? 0,
    status,
    correlationId: context.correlationId,
    metadata: {
      candidateId,
      ...extra,
      providerSelection: {
        contractVersion: "provider-envelope-v1",
        ...providerSelectionReason(
          input.oneShotRunId as Identifier | undefined,
        ),
        approvalReference: context.jobId,
        estimatedCostUsd: result.costUsd,
        actualCostUsd: result.costUsd,
      },
    },
    occurredAt: now(),
  });
  let providerDispatched = false;
  let usageRecorded = false;
  let maximumReservedCostUsd = 0;
  try {
    const resolvedProvider = resolveJobAdapter({
      jobType: illustrationGenerationJobType,
      adapterFamily: "illustration",
      adapter: input.provider,
    });
    const recovery = await recoveryDispatch(input.database, context);
    if (recovery) await recovery.authorize("image");
    maximumReservedCostUsd = recovery?.maximumCostUsd ?? 0;
    providerDispatched = true;
    const result = await resolvedProvider.adapter.generate(
      {
        prompt: input.request.prompt,
        size: "1024x1024",
        style: input.request.style,
      },
      recovery ? { disableRetries: true } : undefined,
    );
    // Provider output is billable even when subsequent storage or binding fails.
    await input.database
      .insert(usageRecords)
      .values(
        usage(
          result,
          result.moderation.status === "approved" ? "succeeded" : "failed",
          {},
        ),
      )
      .onConflictDoNothing();
    usageRecorded = true;
    if (result.moderation.status !== "approved") {
      const moderationCode = result.moderation.code;
      await input.database.transaction(async (transaction) => {
        await transaction
          .insert(usageRecords)
          .values(usage(result, "failed", { moderationCode }))
          .onConflictDoNothing();
        await transaction
          .update(illustrationGenerationCandidates)
          .set({
            status: "failed",
            moderationStatus: "rejected",
            failureCode: moderationCode,
            updatedAt: now(),
          })
          .where(eq(illustrationGenerationCandidates.id, candidateId));
      });
      return {
        status: "rejected",
        code: moderationCode,
        ...(input.onFailure === "motif" ? await fallback() : {}),
      };
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
        "candidate-id": candidateId,
        provenance: "ai-generated",
        sha256: imageChecksumSha256,
      },
    });
    const bind = input.bind;
    let bound: JobMetadata = {};
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
        status: bind === undefined ? "pending_review" : "active",
      });
      await transaction
        .insert(usageRecords)
        .values(usage(result, "succeeded", {}))
        .onConflictDoNothing();
      await transaction
        .update(illustrationGenerationCandidates)
        .set({
          assetId,
          status: bind === undefined ? "pending_review" : "accepted",
          moderationStatus: "approved",
          providerCallId: result.providerCallId,
          updatedAt: now(),
        })
        .where(eq(illustrationGenerationCandidates.id, candidateId));
      if (bind !== undefined) bound = await bind(transaction, assetId);
    });
    return bind === undefined
      ? {
          status: "pending_review",
          width: metadata.width,
          height: metadata.height,
        }
      : {
          status: "accepted",
          width: metadata.width,
          height: metadata.height,
          assetId,
          ...bound,
        };
  } catch (error) {
    if (providerDispatched && !usageRecorded) {
      await input.database
        .insert(usageRecords)
        .values({
          ...usage(
            { providerId: input.provider.providerId, units: 1, costUsd: 0 },
            "failed",
            {
              uncertainProviderCharge: "true",
              maximumReservedCostUsd: String(maximumReservedCostUsd),
            },
          ),
          idempotencyKey: `illustration:${candidateId}:${context.jobId}:${context.attempt}:failed`,
        })
        .onConflictDoNothing();
    }
    if (
      error instanceof ProviderEnvelopeViolationError ||
      error instanceof ApprovedProviderUnavailableError
    )
      await input.auditWriter.write({
        ownerUserId: context.ownerUserId as Identifier,
        projectId: context.projectId as Identifier,
        actor: { type: "system" },
        eventType: "ai.generated",
        target: { type: "job", id: context.jobId as Identifier },
        correlationId: context.correlationId as Identifier,
        metadata: {
          event: "provider.envelope_violation",
          jobType: illustrationGenerationJobType,
          requestedAdapter: "illustration",
          code: error.code,
        },
        occurredAt: now(),
      });
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
      .where(eq(illustrationGenerationCandidates.id, candidateId));
    const retryable = error instanceof ProviderCallError && error.retryable;
    const code =
      error instanceof ProviderCallError
        ? error.code
        : "ILLUSTRATION_GENERATION_FAILED";
    if (
      input.onFailure === "throw" ||
      (retryable && context.attempt < (input.maxAttempts ?? 3))
    )
      throw new JobExecutionError(
        retryable ? "retryable" : "terminal",
        code,
        "The illustration could not be generated.",
      );
    return { status: "failed", code, ...(await fallback()) };
  }
}

/**
 * Pins a generated (or, ST-113, library) picture as `imagery.hero` on every scene of the v2 draft
 * it was planned for, when that scene still wants this concept and has no
 * picture yet. Never overwrites a teacher's choice, and never lands where
 * validation refuses it (evidence scenes, AC5). The draft row is locked, so
 * concurrent binds of different concepts compose.
 */
async function bindCinemaHero(
  transaction: DatabaseExecutor,
  context: GenerationContext,
  payload: CinemaIllustrationJobPayload,
  assetId: Identifier,
  now: Date,
  hero: Readonly<{ origin: "generated" | "library"; altText?: string }> = {
    origin: "generated",
  },
): Promise<JobMetadata> {
  const [draft] = await transaction
    .select()
    .from(creativeDesignDrafts)
    .where(
      and(
        eq(creativeDesignDrafts.id, payload.draftId),
        eq(creativeDesignDrafts.ownerUserId, context.ownerUserId),
        eq(creativeDesignDrafts.projectId, context.projectId),
      ),
    )
    .limit(1)
    .for("update");
  if (draft === undefined) return { bound: [], unbound: "draft_missing" };
  const manifest = anyCreativeDesignManifestSchema.parse(draft.manifest);
  if (!isCreativeDesignManifestV2(manifest))
    return { bound: [], unbound: "draft_not_v2" };
  const [spec] = await transaction
    .select({ payload: lessonSpecs.payload })
    .from(lessonSpecs)
    .where(
      and(
        eq(lessonSpecs.id, draft.lessonSpecId),
        eq(lessonSpecs.ownerUserId, context.ownerUserId),
        eq(lessonSpecs.projectId, context.projectId),
      ),
    )
    .limit(1);
  if (spec === undefined) return { bound: [], unbound: "storyboard_missing" };
  const sceneSpecs = lessonStoryboardSchema
    .parse(spec.payload)
    .scenes.map((entry) => ({ ...entry.scene, id: entry.stableSceneId }));
  let next: CreativeDesignManifestV2 = manifest;
  const bound: string[] = [];
  for (const sceneId of payload.sceneIds) {
    const design = next.scenes[sceneId];
    if (
      design === undefined ||
      design.imagery.hero !== null ||
      design.imagery.brief === null ||
      cinemaIllustrationKey(
        design.imagery.brief.concept,
        next.artDirection.treatment,
      ) !== payload.key
    )
      continue;
    const candidate: CreativeDesignManifestV2 = {
      ...next,
      scenes: {
        ...next.scenes,
        [sceneId]: {
          ...design,
          imagery: {
            ...design.imagery,
            hero: {
              assetId,
              origin: hero.origin,
              altText: hero.altText ?? design.imagery.brief.description,
            },
          },
        },
      },
    };
    if (validateCreativeDesignManifestV2(candidate, sceneSpecs).length > 0)
      continue;
    next = candidate;
    bound.push(sceneId);
  }
  if (bound.length > 0)
    await transaction
      .update(creativeDesignDrafts)
      .set({
        manifest: next,
        manifestHash: creativeDesignHash(next),
        revision: draft.revision + 1,
        updatedAt: now,
      })
      .where(eq(creativeDesignDrafts.id, draft.id));
  return {
    bound,
    draftRevision: bound.length > 0 ? draft.revision + 1 : draft.revision,
  };
}

/**
 * ST-110: payload v2 — a deduplicated presentation illustration for a v2
 * design. The prompt is the plan's brief plus the video's shared art
 * direction (never source or lesson text); people may appear when the art
 * direction allows. A success is pinned as `imagery.hero` before approval
 * (ADR-015 §6). A moderation rejection or final-attempt failure takes a
 * matching library picture when `library` is configured (ST-113), otherwise
 * the authored motif, and still succeeds.
 */
export function createCinemaIllustrationJobHandler(input: {
  database: DatabaseClient;
  provider: IllustrationProvider;
  storage: Pick<ObjectStorage, "putBytes">;
  now?: () => Date;
  /** The delivery budget the job is enqueued with. */
  maxAttempts?: number;
  /** ST-113. Read-only client confined to `catalog/illustrations`. */
  library?: Readonly<{ catalog: Pick<ObjectStorage, "getBytes"> }>;
}): RegisteredJobHandler {
  const now = input.now ?? (() => new Date());
  const auditWriter = new PostgresAuditWriter(input.database);
  return defineJobHandler(
    illustrationGenerationJobType,
    2,
    cinemaIllustrationJobPayloadSchema,
    async (payload, context) => {
      const [candidate] = await input.database
        .select({
          id: illustrationGenerationCandidates.id,
          status: illustrationGenerationCandidates.status,
        })
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
      if (candidate.status === "accepted" || candidate.status === "rejected")
        return { status: candidate.status };
      return generateCandidateIllustration({
        database: input.database,
        provider: input.provider,
        storage: input.storage,
        now,
        auditWriter,
        context,
        candidateId: candidate.id as Identifier,
        oneShotRunId: payload.oneShotRunId,
        request: {
          prompt: illustrationPromptWithDesignGuidance(cinemaIllustrationPrompt(payload),await loadApprovedDesignGuidance(input.database,context.ownerUserId,payload.designSystemVersionId)),
          style: `cinema-${payload.artDirection.treatment}`,
        },
        onFailure: "motif",
        ...(input.maxAttempts === undefined
          ? {}
          : { maxAttempts: input.maxAttempts }),
        bind: (transaction, assetId) =>
          bindCinemaHero(transaction, context, payload, assetId, now()),
        ...(input.library === undefined
          ? {}
          : {
              libraryFallback: () =>
                pinLibraryHero({
                  database: input.database,
                  catalog: input.library!.catalog,
                  storage: input.storage,
                  context,
                  payload,
                  now,
                }),
            }),
      });
    },
  );
}

/**
 * ST-113. The library picture for a failed hero: matched on the payload's
 * brief within the video's treatment and surface (people only when the art
 * direction allows them), copied into the project, then pinned with origin
 * `library` through the same validated bind as a generated picture, so it
 * never lands on an evidence scene. No paid call, so nothing is metered.
 */
async function pinLibraryHero(input: {
  database: DatabaseClient;
  catalog: Pick<ObjectStorage, "getBytes">;
  storage: Pick<ObjectStorage, "putBytes">;
  context: GenerationContext;
  payload: CinemaIllustrationJobPayload;
  now: () => Date;
}): Promise<JobMetadata | undefined> {
  const { context, payload } = input;
  const { treatment, humanFigures } = payload.artDirection;
  const surface = cinemaIllustrationSurface(payload.palette.surface);
  const found = matchCinemaLibraryIllustration({
    brief: payload.brief,
    treatment,
    surface,
    humanFigures,
    entries: await activeIllustrationLibraryEntries(input.database, {
      treatment,
      surface,
    }),
  });
  if (found === null) return undefined;
  const copy = await copyLibraryIllustrationIntoProject({
    database: input.database,
    ownerUserId: context.ownerUserId,
    projectId: context.projectId,
    entryId: found.entry.entryId,
    newAssetId: () => createId(input.now()),
    now: input.now(),
    storage: {
      readCatalogBytes: async (key, maxBytes) =>
        (await input.catalog.getBytes(storageKeySchema.parse(key), maxBytes))
          .body,
      writeProjectBytes: async ({ assetId, bytes, sha256 }) => {
        const key = storageKeys.assetOriginal({
          userId: context.ownerUserId as Identifier,
          projectId: context.projectId as Identifier,
          assetId: assetId as Identifier,
          extension: "png",
        });
        await input.storage.putBytes({
          key,
          body: bytes,
          contentType: "image/png",
          metadata: {
            "library-entry-id": found.entry.entryId,
            provenance: "ai-generated",
            sha256,
          },
        });
        return key;
      },
    },
  });
  if (copy === null) return undefined;
  const bound = await input.database.transaction((transaction) =>
    bindCinemaHero(
      transaction,
      context,
      payload,
      copy.assetId as Identifier,
      input.now(),
      {
        origin: "library",
        altText: copy.altText,
      },
    ),
  );
  return {
    assetId: copy.assetId,
    libraryEntryId: found.entry.entryId,
    libraryMatch: found.match,
    libraryScore: Number(found.score.toFixed(3)),
    ...bound,
  };
}
