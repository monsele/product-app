import { createHash } from "node:crypto";
import {
  createId,
  PublicError,
  togetherTtsProviderOptions,
  type Identifier,
} from "@avlp/config";
import {
  captionCues,
  captionTracks,
  jobs,
  lessonSpecs,
  outboxEvents,
  pronunciationEntries,
  projects,
  sceneAudio,
  scenes,
  voiceConfigurations,
  type DatabaseClient,
} from "@avlp/database";
import { createIdempotencyKey, createJobEnvelope } from "@avlp/jobs";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  lessonAudioGenerationResponseSchema,
  sceneAudioGenerationInputSchema,
  sceneAudioGenerationJobPayloadSchema,
  sceneAudioPlaybackResponseSchema,
  sceneAudioStatusResponseSchema,
  type LessonAudioGenerationResponse,
  type SceneAudioPlaybackResponse,
  type SceneAudioStatusResponse,
} from "@avlp/schemas";
import { storageKeySchema, type ObjectStorage } from "@avlp/storage";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";

// A single explicit command must be able to cover the largest storyboard.
// Provider-side concurrency remains serialized by the worker.
const maxGenerationsPerHour = 50;
// BullMQ controls actual provider concurrency. This limit bounds durable queued
// work and must accommodate one complete 50-scene storyboard.
const maxConcurrentGenerations = 50;
const provider =
  process.env.TOGETHER_API_KEY?.trim() === undefined ||
  process.env.TOGETHER_API_KEY.trim().length === 0
    ? ({ providerId: "fixture-v1", outputFormat: "wav" } as const)
    : togetherTtsProviderOptions;
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function sceneAudioRequestAction(
  status: (typeof sceneAudio.$inferSelect)["status"] | undefined,
): "create" | "reuse" | "in_flight" | "retry" {
  if (status === "ready") return "reuse";
  if (status === "queued" || status === "generating") return "in_flight";
  return status === undefined ? "create" : "retry";
}

function parseBoundary<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new PublicError(
    "validation_failed",
    "Request validation failed.",
    400,
    false,
    Object.fromEntries(
      parsed.error.issues.map((issue) => [
        issue.path.join(".") || "root",
        issue.message,
      ]),
    ),
  );
}

/** Explicit, tenant-scoped TTS command writer. It only records and queues work;
 * provider synthesis is exclusively performed by the pipeline worker. */
export class SceneAudioService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly now: () => Date = () => new Date(),
    private readonly storage?: Pick<ObjectStorage, "createSignedDownload">,
  ) {}

  /**
   * Mint a short-lived signed URL so a teacher can listen to one scene's
   * narration before rendering. Ownership is enforced by the row lookup, and
   * the storage key never leaves the API.
   */
  public async playback(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
  }): Promise<SceneAudioPlaybackResponse> {
    if (this.storage === undefined)
      throw new PublicError(
        "internal_error",
        "Audio playback is unavailable.",
        503,
        true,
      );
    const [row] = await this.database
      .select()
      .from(sceneAudio)
      .where(
        and(
          eq(sceneAudio.ownerUserId, input.ownerUserId),
          eq(sceneAudio.projectId, input.projectId),
          eq(sceneAudio.sceneId, input.sceneId),
        ),
      )
      .limit(1);
    if (
      row === undefined ||
      row.status !== "ready" ||
      row.storageKey === null
    )
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    const expiresInSeconds = 300;
    const signed = await this.storage.createSignedDownload({
      key: storageKeySchema.parse(row.storageKey),
      expiresInSeconds,
    });
    return sceneAudioPlaybackResponseSchema.parse({
      sceneId: input.sceneId,
      url: signed.url,
      contentType: row.contentType ?? "audio/wav",
      durationMs: row.durationMs,
      expiresAt: signed.expiresAt.toISOString(),
    });
  }
  public async generateAll(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<LessonAudioGenerationResponse> {
    const command = parseBoundary(sceneAudioGenerationInputSchema, input.body);
    const findSpec = async (status: "draft" | "approved") =>
      (
        await this.database
          .select({ id: lessonSpecs.id })
          .from(lessonSpecs)
          .where(
            and(
              eq(lessonSpecs.ownerUserId, input.ownerUserId),
              eq(lessonSpecs.projectId, input.projectId),
              eq(lessonSpecs.status, status),
            ),
          )
          .orderBy(desc(lessonSpecs.generatedAt))
          .limit(1)
      )[0];
    const spec = (await findSpec("draft")) ?? (await findSpec("approved"));
    if (spec === undefined)
      throw new PublicError(
        "not_found",
        "Generate a storyboard before generating lesson audio.",
        404,
      );
    const sceneRows = await this.database
      .select({ stableSceneId: scenes.stableSceneId })
      .from(scenes)
      .where(
        and(
          eq(scenes.ownerUserId, input.ownerUserId),
          eq(scenes.projectId, input.projectId),
          eq(scenes.lessonSpecId, spec.id),
        ),
      )
      .orderBy(asc(scenes.order));
    if (sceneRows.length === 0)
      throw new PublicError(
        "bad_request",
        "The current storyboard has no scenes to generate.",
        409,
      );
    const recent = await this.database
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.ownerUserId, input.ownerUserId),
          eq(jobs.projectId, input.projectId),
          eq(jobs.jobType, "tts.generate"),
          gte(jobs.createdAt, new Date(this.now().getTime() - 3_600_000)),
        ),
      );
    if (recent.length + sceneRows.length > maxGenerationsPerHour)
      throw new PublicError(
        "rate_limited",
        "Generating every scene would exceed this project's hourly audio limit. Retry when the current window resets.",
        429,
      );

    const results: SceneAudioStatusResponse[] = [];
    for (const scene of sceneRows) {
      results.push(
        await this.generate({
          ...input,
          sceneId: scene.stableSceneId as Identifier,
          body: {
            idempotencyKey: `batch:${hash({
              request: command.idempotencyKey,
              sceneId: scene.stableSceneId,
            })}`,
          },
        }),
      );
    }
    await this.database
      .update(projects)
      .set({ stage: "audio_generation", updatedAt: this.now() })
      .where(
        and(
          eq(projects.id, input.projectId),
          eq(projects.ownerUserId, input.ownerUserId),
          eq(projects.stage, "narration_storyboard_review"),
        ),
      );
    return lessonAudioGenerationResponseSchema.parse({
      totalScenes: results.length,
      readyScenes: results.filter((item) => item.status === "ready").length,
      pendingScenes: results.filter(
        (item) => item.status === "queued" || item.status === "generating",
      ).length,
      failedScenes: results.filter(
        (item) => item.status === "failed" || item.status === "stale",
      ).length,
      scenes: results,
    });
  }

  public async generate(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
    body: unknown;
    correlationId: Identifier;
  }): Promise<SceneAudioStatusResponse> {
    const command = parseBoundary(sceneAudioGenerationInputSchema, input.body);
    const now = this.now();
    return this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${input.projectId}))`,
      );
      const [scene] = await tx
        .select({
          id: scenes.id,
          stableSceneId: scenes.stableSceneId,
          sceneJson: scenes.sceneJson,
        })
        .from(scenes)
        .where(
          and(
            eq(scenes.stableSceneId, input.sceneId),
            eq(scenes.ownerUserId, input.ownerUserId),
            eq(scenes.projectId, input.projectId),
          ),
        )
        .limit(1)
        .for("update");
      if (!scene)
        throw new PublicError(
          "not_found",
          "The requested resource was not found.",
          404,
        );
      const [voice] = await tx
        .select()
        .from(voiceConfigurations)
        .where(
          and(
            eq(voiceConfigurations.ownerUserId, input.ownerUserId),
            eq(voiceConfigurations.projectId, input.projectId),
          ),
        )
        .limit(1)
        .for("update");
      if (!voice)
        throw new PublicError(
          "bad_request",
          "Save a voice configuration before generating audio.",
          409,
        );
      const narration = (scene.sceneJson as { narration?: unknown }).narration;
      if (typeof narration !== "string" || narration.trim().length === 0)
        throw new PublicError(
          "bad_request",
          "This scene has no narration to generate.",
          409,
        );
      const overrides = await tx
        .select({
          phrase: pronunciationEntries.phrase,
          replacement: pronunciationEntries.replacement,
        })
        .from(pronunciationEntries)
        .where(eq(pronunciationEntries.voiceConfigurationId, voice.id));
      const narrationHash = hash(narration.trim());
      const voiceHash = hash({
        voiceId: voice.voiceId,
        speakingRate: voice.speakingRate,
        overrides: overrides.sort((a, b) => a.phrase.localeCompare(b.phrase)),
      });
      const contentHash = hash({
        narrationHash,
        voiceHash,
        provider,
      });
      const [matchingAudio] = await tx
        .select()
        .from(sceneAudio)
        .where(
          and(
            eq(sceneAudio.ownerUserId, input.ownerUserId),
            eq(sceneAudio.projectId, input.projectId),
            eq(sceneAudio.sceneId, scene.id),
            eq(sceneAudio.contentHash, contentHash),
          ),
        )
        .limit(1);
      const action = sceneAudioRequestAction(matchingAudio?.status);
      if (action === "reuse" && matchingAudio !== undefined) {
        const [readyCue] = await tx
          .select({ id: captionCues.id })
          .from(captionTracks)
          .innerJoin(captionCues, eq(captionCues.trackId, captionTracks.id))
          .where(
            and(
              eq(captionTracks.sceneAudioId, matchingAudio.id),
              eq(captionTracks.ownerUserId, input.ownerUserId),
              eq(captionTracks.projectId, input.projectId),
              eq(captionTracks.status, "ready"),
              eq(captionCues.ownerUserId, input.ownerUserId),
              eq(captionCues.projectId, input.projectId),
            ),
          )
          .limit(1);
        // A legacy/interrupted completion may have audio but no captions. Queue
        // the same durable job path so the worker repairs it from saved timing.
        if (readyCue !== undefined)
          return response(scene.stableSceneId as Identifier, matchingAudio);
      }
      if (action === "in_flight" && matchingAudio !== undefined)
        return response(scene.stableSceneId as Identifier, matchingAudio);
      const idempotencyKey = createIdempotencyKey({
        jobType: "tts.generate",
        projectId: input.projectId,
        inputVersion: `${scene.id}:${narrationHash}:${voiceHash}`,
        options: { requestKey: command.idempotencyKey },
      });
      const [existingJob] = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            eq(jobs.ownerUserId, input.ownerUserId),
            eq(jobs.projectId, input.projectId),
            eq(jobs.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (existingJob) {
        const [existing] = await tx
          .select()
          .from(sceneAudio)
          .where(
            and(
              eq(sceneAudio.ownerUserId, input.ownerUserId),
              eq(sceneAudio.projectId, input.projectId),
              eq(sceneAudio.jobId, existingJob.id),
            ),
          )
          .limit(1);
        if (existing)
          return response(scene.stableSceneId as Identifier, existing);
      }
      const recent = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            eq(jobs.ownerUserId, input.ownerUserId),
            eq(jobs.projectId, input.projectId),
            eq(jobs.jobType, "tts.generate"),
            gte(jobs.createdAt, new Date(now.getTime() - 3_600_000)),
          ),
        );
      if (recent.length >= maxGenerationsPerHour)
        throw new PublicError(
          "rate_limited",
          "This project has reached its audio-generation limit.",
          429,
        );
      const active = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            eq(jobs.ownerUserId, input.ownerUserId),
            eq(jobs.projectId, input.projectId),
            eq(jobs.jobType, "tts.generate"),
            inArray(jobs.state, ["queued", "running", "retry_wait"]),
          ),
        );
      if (active.length >= maxConcurrentGenerations)
        throw new PublicError(
          "rate_limited",
          "This project already has the maximum number of audio jobs in progress.",
          429,
        );
      const audioId =
        (matchingAudio?.id as Identifier | undefined) ?? createId(now);
      const jobId = createId(now);
      const payload = sceneAudioGenerationJobPayloadSchema.parse({
        schemaVersion: 1,
        sceneAudioId: audioId,
        narrationHash,
        voiceConfigurationHash: voiceHash,
        provider,
      });
      const envelope = createJobEnvelope(sceneAudioGenerationJobPayloadSchema, {
        jobId,
        jobType: "tts.generate",
        projectId: input.projectId,
        ownerUserId: input.ownerUserId,
        inputVersion: `${scene.id}:${narrationHash}:${voiceHash}`,
        idempotencyKey,
        correlationId: input.correlationId,
        payloadVersion: 1,
        payload,
        requestedAt: now,
      });
      const audioValues = {
        status: "queued" as const,
        voiceConfigurationVersion: voice.version,
        narrationHash,
        voiceConfigurationHash: voiceHash,
        contentHash,
        plannedDurationMs: Math.round(
          ((scene.sceneJson as { durationSeconds?: number }).durationSeconds ??
            10) * 1000,
        ),
        jobId,
        failureCode: null,
        updatedAt: now,
      };
      if (matchingAudio === undefined)
        await tx.insert(sceneAudio).values({
          id: audioId,
          ownerUserId: input.ownerUserId,
          projectId: input.projectId,
          sceneId: scene.id,
          ...audioValues,
          createdAt: now,
        });
      else
        await tx
          .update(sceneAudio)
          .set(audioValues)
          .where(eq(sceneAudio.id, matchingAudio.id));
      await tx.insert(jobs).values({
        id: jobId,
        jobType: envelope.jobType,
        queueName: "pipeline",
        projectId: input.projectId,
        ownerUserId: input.ownerUserId,
        inputVersion: envelope.inputVersion,
        idempotencyKey,
        correlationId: input.correlationId,
        payloadVersion: 1,
        payload,
      });
      await tx.insert(outboxEvents).values({
        id: createId(now),
        jobId,
        eventType: "tts.generation.requested.v1",
        queueName: "pipeline",
        envelope,
        deliveryOptions: { maxAttempts: 3, retryDelayMs: 5000 },
      });
      await new PostgresAuditWriter(tx).write({
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "audio.generation_requested",
        target: { type: "scene_audio", id: audioId },
        correlationId: input.correlationId,
        metadata: {
          sceneId: scene.stableSceneId,
          action: "audio_generation_requested",
        },
        occurredAt: now,
      });
      const [created] = await tx
        .select()
        .from(sceneAudio)
        .where(eq(sceneAudio.id, audioId));
      return response(scene.stableSceneId as Identifier, created!);
    });
  }
  public async status(input: {
    ownerUserId: Identifier;
    projectId: Identifier;
    sceneId: Identifier;
  }): Promise<SceneAudioStatusResponse> {
    const [row] = await this.database
      .select({ stableSceneId: scenes.stableSceneId, audio: sceneAudio })
      .from(scenes)
      .leftJoin(
        sceneAudio,
        and(
          eq(sceneAudio.sceneId, scenes.id),
          eq(sceneAudio.ownerUserId, input.ownerUserId),
          eq(sceneAudio.projectId, input.projectId),
        ),
      )
      .where(
        and(
          eq(scenes.stableSceneId, input.sceneId),
          eq(scenes.ownerUserId, input.ownerUserId),
          eq(scenes.projectId, input.projectId),
        ),
      )
      .orderBy(desc(sceneAudio.updatedAt))
      .limit(1);
    if (!row)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    if (!row.audio)
      return sceneAudioStatusResponseSchema.parse({
        sceneId: row.stableSceneId,
        status: "stale",
        jobId: null,
        durationMs: null,
        fitWarning: null,
        failureCode: null,
        captions: [],
        retryable: false,
      });
    const cues = await this.database
      .select({
        startMs: captionCues.startMs,
        endMs: captionCues.endMs,
        text: captionCues.text,
      })
      .from(captionTracks)
      .innerJoin(captionCues, eq(captionCues.trackId, captionTracks.id))
      .where(
        and(
          eq(captionTracks.sceneAudioId, row.audio.id),
          eq(captionTracks.ownerUserId, input.ownerUserId),
          eq(captionTracks.projectId, input.projectId),
          eq(captionTracks.status, "ready"),
          eq(captionCues.ownerUserId, input.ownerUserId),
          eq(captionCues.projectId, input.projectId),
        ),
      )
      .orderBy(captionCues.position);
    return response(row.stableSceneId as Identifier, row.audio, cues);
  }
}
function response(
  sceneId: Identifier,
  row: typeof sceneAudio.$inferSelect,
  captions: readonly { startMs: number; endMs: number; text: string }[] = [],
): SceneAudioStatusResponse {
  return sceneAudioStatusResponseSchema.parse({
    sceneId,
    status: row.status,
    jobId: row.jobId as Identifier | null,
    durationMs: row.durationMs,
    fitWarning: row.fitWarning,
    failureCode: row.failureCode,
    captions,
    retryable: row.status === "failed" || row.status === "stale",
  });
}
