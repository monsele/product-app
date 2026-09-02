import { createHash } from "node:crypto";
import { createId, type Identifier } from "@avlp/config";
import {
  captionCues,
  captionTracks,
  lessonSpecs,
  pronunciationEntries,
  projects,
  sceneAudio,
  scenes,
  usageRecords,
  voiceConfigurations,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import {
  defineJobHandler,
  JobExecutionError,
  type RegisteredJobHandler,
} from "@avlp/jobs";
import { ProviderCallError } from "@avlp/provider-adapters";
import {
  narrationPauseReservation,
  narrationWordsPerMinute,
  sceneAudioGenerationJobPayloadSchema,
} from "@avlp/schemas";
import { storageKeys, type ObjectStorage } from "@avlp/storage";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  alignSentences,
  captionContentHash,
  segmentCaptions,
} from "./captions.js";

export const sceneAudioGenerationJobType = "tts.generate";
export type SceneAudioTiming = {
  startMs: number;
  endMs: number;
  text: string;
};
export type SceneAudioSynthesis = {
  bytes: Uint8Array;
  durationMs: number;
  timing: SceneAudioTiming[];
  providerCallId?: string;
  costUsd?: number;
};
/** Application-owned provider boundary. Implementations may be replaced without
 * changing the job envelope, content-addressed artifact identity, or API. */
export interface SceneAudioTtsProvider {
  readonly providerId: string;
  readonly outputFormat: "mp3" | "wav";
  readonly contentType: "audio/mpeg" | "audio/wav";
  readonly model?: string;
  synthesize(input: {
    narration: string;
    speakingRate: number;
    voiceId?: string;
    pronunciationOverrides?: readonly {
      phrase: string;
      replacement: string;
    }[];
  }): SceneAudioSynthesis | Promise<SceneAudioSynthesis>;
}
/** Forced alignment is isolated behind an application-owned boundary so
 * production providers can align narration against the generated waveform. */
export interface SceneAudioAlignmentProvider {
  readonly providerId?: string;
  readonly model?: string;
  align(input: {
    audio: Uint8Array;
    narration: string;
    durationMs: number;
  }):
    | SceneAudioTiming[]
    | SceneAudioAlignmentResult
    | Promise<SceneAudioTiming[] | SceneAudioAlignmentResult>;
}
export type SceneAudioAlignmentResult = {
  timing: SceneAudioTiming[];
  providerCallId?: string;
  costUsd?: number;
  latencyMs?: number;
  retryCount?: number;
};
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function isCurrentAudioCompletion(input: {
  storedNarrationHash: string | null;
  storedVoiceConfigurationHash: string | null;
  payloadNarrationHash: string;
  payloadVoiceConfigurationHash: string;
}): boolean {
  return (
    input.storedNarrationHash === input.payloadNarrationHash &&
    input.storedVoiceConfigurationHash === input.payloadVoiceConfigurationHash
  );
}

/** Fixture adapter is deterministic and produces a valid PCM WAV payload. The
 * provider boundary is isolated here so replacing it never changes API IDs or
 * persisted provider-neutral hashes. */
export function synthesizeFixtureAudio(
  text: string,
  rate: number,
): SceneAudioSynthesis {
  // Narration is written to `narrationWordCountRange`, which speaks at
  // `narrationWordsPerMinute` and reserves `narrationPauseReservation` of the
  // scene for pauses. Synthesizing at any other rate, or without returning that
  // reserved time as silence, makes on-budget narration read as an audio-fit
  // failure on every scene, so the fixture realizes the same duration model.
  const spokenMs =
    (text.trim().split(/\s+/).length / (narrationWordsPerMinute * rate)) *
    60_000;
  const durationMs = Math.max(
    500,
    Math.round(spokenMs / (1 - narrationPauseReservation)),
  );
  const sampleRate = 8000;
  const count = Math.max(1, Math.round((sampleRate * durationMs) / 1000));
  const bytes = new Uint8Array(44 + count * 2);
  const view = new DataView(bytes.buffer);
  const word = (at: number, value: string) =>
    [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  word(0, "RIFF");
  view.setUint32(4, 36 + count * 2, true);
  word(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  word(36, "data");
  view.setUint32(40, count * 2, true);
  for (let i = 0; i < count; i++)
    view.setInt16(
      44 + i * 2,
      Math.round(Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 4000),
      true,
    );
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text];
  const weights = sentences.map((sentence) =>
    Math.max(1, sentence.trim().split(/\s+/).length),
  );
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let startMs = 0;
  const timing = sentences.map((sentence, index) => {
    const endMs =
      index === sentences.length - 1
        ? durationMs
        : startMs + Math.round((durationMs * weights[index]!) / totalWeight);
    const entry = { startMs, endMs, text: sentence.trim() };
    startMs = endMs;
    return entry;
  });
  return { bytes, durationMs, timing };
}
export const fixtureSceneAudioTtsProvider: SceneAudioTtsProvider = {
  providerId: "fixture-v1",
  outputFormat: "wav",
  contentType: "audio/wav",
  synthesize: ({ narration, speakingRate }) =>
    synthesizeFixtureAudio(narration, speakingRate),
};

export function createSceneAudioGenerationJobHandler(input: {
  database: DatabaseClient;
  storage: Pick<ObjectStorage, "putBytes">;
  provider?: SceneAudioTtsProvider;
  alignmentProvider?: SceneAudioAlignmentProvider;
  now?: () => Date;
}): RegisteredJobHandler {
  const now = input.now ?? (() => new Date());
  const provider = input.provider ?? fixtureSceneAudioTtsProvider;
  const alignmentProvider = input.alignmentProvider;
  return defineJobHandler(
    sceneAudioGenerationJobType,
    1,
    sceneAudioGenerationJobPayloadSchema,
    async (payload, context) => {
      const [audio] = await input.database
        .select()
        .from(sceneAudio)
        .where(
          and(
            eq(sceneAudio.id, payload.sceneAudioId),
            eq(sceneAudio.ownerUserId, context.ownerUserId),
            eq(sceneAudio.projectId, context.projectId),
          ),
        )
        .limit(1);
      if (!audio)
        throw new JobExecutionError(
          "terminal",
          "SCENE_AUDIO_NOT_FOUND",
          "The scene audio request was not found.",
        );
      if (audio.status === "ready") {
        if (await hasReadyCaptions(input.database, audio.id, context)) {
          await advanceProjectMediaStage(input.database, context, now());
          return { status: "ready", reused: true };
        }
        const timing = persistedTiming(audio.timing, audio.durationMs);
        if (
          timing === undefined ||
          audio.durationMs === null ||
          audio.narrationHash === null ||
          audio.contentHash === null
        )
          throw new JobExecutionError(
            "terminal",
            "READY_AUDIO_CAPTIONS_UNRECOVERABLE",
            "Ready scene audio is missing the timing metadata required to repair captions.",
          );
        await input.database.transaction(async (tx) => {
          await persistCaptions({
            database: tx,
            ownerUserId: context.ownerUserId,
            projectId: context.projectId,
            sceneAudioId: audio.id,
            narrationHash: audio.narrationHash!,
            audioContentHash: audio.contentHash!,
            timing,
            durationMs: audio.durationMs!,
            now,
          });
        });
        await advanceProjectMediaStage(input.database, context, now());
        return { status: "ready", reused: true, captionsRepaired: true };
      }
      const [claimed] = await input.database
        .update(sceneAudio)
        .set({ status: "generating", updatedAt: now() })
        .where(
          and(
            eq(sceneAudio.id, audio.id),
            or(
              eq(sceneAudio.status, "queued"),
              eq(sceneAudio.status, "failed"),
            ),
          ),
        )
        .returning({ id: sceneAudio.id });
      if (!claimed) return { status: "already_processing" };
      let alignmentAttempted = false;
      try {
        const [scene] = await input.database
          .select({ id: scenes.id, sceneJson: scenes.sceneJson })
          .from(scenes)
          .where(
            and(
              eq(scenes.id, audio.sceneId),
              eq(scenes.ownerUserId, context.ownerUserId),
              eq(scenes.projectId, context.projectId),
            ),
          )
          .limit(1);
        const [voice] = await input.database
          .select()
          .from(voiceConfigurations)
          .where(
            and(
              eq(voiceConfigurations.ownerUserId, context.ownerUserId),
              eq(voiceConfigurations.projectId, context.projectId),
            ),
          )
          .limit(1);
        const narration = (
          scene?.sceneJson as { narration?: unknown } | undefined
        )?.narration;
        if (!scene || !voice || typeof narration !== "string")
          throw new JobExecutionError(
            "terminal",
            "TTS_INPUT_STALE",
            "The narration or voice configuration is no longer available.",
          );
        const overrides = await input.database
          .select({
            phrase: pronunciationEntries.phrase,
            replacement: pronunciationEntries.replacement,
          })
          .from(pronunciationEntries)
          .where(eq(pronunciationEntries.voiceConfigurationId, voice.id));
        const voiceHash = digest({
          voiceId: voice.voiceId,
          speakingRate: voice.speakingRate,
          overrides: overrides.sort((a, b) => a.phrase.localeCompare(b.phrase)),
        });
        if (
          !isCurrentAudioCompletion({
            storedNarrationHash: digest(narration.trim()),
            storedVoiceConfigurationHash: voiceHash,
            payloadNarrationHash: payload.narrationHash,
            payloadVoiceConfigurationHash: payload.voiceConfigurationHash,
          })
        ) {
          await input.database
            .update(sceneAudio)
            .set({ status: "stale", updatedAt: now() })
            .where(eq(sceneAudio.id, audio.id));
          return { status: "stale" };
        }
        const recoverableTiming = persistedTiming(
          audio.timing,
          audio.durationMs,
        );
        if (
          audio.storageKey !== null &&
          audio.durationMs !== null &&
          audio.narrationHash !== null &&
          audio.contentHash !== null &&
          recoverableTiming !== undefined
        ) {
          const recoveredNarrationHash = audio.narrationHash;
          const recoveredContentHash = audio.contentHash;
          const recoveredDurationMs = audio.durationMs;
          await input.database.transaction(async (tx) => {
            await tx
              .update(sceneAudio)
              .set({ status: "ready", failureCode: null, updatedAt: now() })
              .where(
                and(
                  eq(sceneAudio.id, audio.id),
                  eq(sceneAudio.narrationHash, payload.narrationHash),
                  eq(
                    sceneAudio.voiceConfigurationHash,
                    payload.voiceConfigurationHash,
                  ),
                ),
              );
            await persistCaptions({
              database: tx,
              ownerUserId: context.ownerUserId,
              projectId: context.projectId,
              sceneAudioId: audio.id,
              narrationHash: recoveredNarrationHash,
              audioContentHash: recoveredContentHash,
              timing: recoverableTiming,
              durationMs: recoveredDurationMs,
              now,
            });
          });
          await advanceProjectMediaStage(input.database, context, now());
          return { status: "ready", reused: true, captionsRepaired: true };
        }
        if (
          payload.provider.providerId !== provider.providerId ||
          payload.provider.outputFormat !== provider.outputFormat
        )
          throw new JobExecutionError(
            "terminal",
            "TTS_PROVIDER_MISMATCH",
            "The requested TTS provider configuration is unavailable.",
          );
        const output = await provider.synthesize({
          narration,
          speakingRate: voice.speakingRate,
          voiceId: voice.voiceId,
          pronunciationOverrides: overrides,
        });
        const key = storageKeys.sceneAudio({
          userId: context.ownerUserId as Identifier,
          projectId: context.projectId as Identifier,
          sceneId: sceneAudioId(scene.id),
          contentHash: audio.contentHash!,
          extension: provider.outputFormat,
        });
        const stored = await input.storage.putBytes({
          key,
          body: new Uint8Array(output.bytes),
          contentType: provider.contentType,
          metadata: {
            "scene-audio-id": audio.id,
            "content-hash": audio.contentHash!,
          },
        });
        alignmentAttempted = output.timing.length === 0;
        const aligned: SceneAudioAlignmentResult =
          output.timing.length > 0
            ? {
                timing: alignSentences({
                  narration,
                  durationMs: output.durationMs,
                  timing: output.timing,
                }),
              }
            : await alignWithoutProvider(
                alignmentProvider,
                output.bytes,
                narration,
                output.durationMs,
              );
        const warning =
          audio.plannedDurationMs !== null &&
          Math.abs(output.durationMs - audio.plannedDurationMs) > 1000
            ? "Narration audio differs from the planned scene duration by more than one second."
            : null;
        await input.database.transaction(async (tx) => {
          const [completed] = await tx
            .update(sceneAudio)
            .set({
              status: "ready",
              storageKey: key,
              checksumSha256: stored.checksumSha256 ?? null,
              contentType: provider.contentType,
              durationMs: output.durationMs,
              timing: aligned.timing,
              fitWarning: warning,
              failureCode: null,
              updatedAt: now(),
            })
            .where(
              and(
                eq(sceneAudio.id, audio.id),
                eq(sceneAudio.narrationHash, payload.narrationHash),
                eq(
                  sceneAudio.voiceConfigurationHash,
                  payload.voiceConfigurationHash,
                ),
              ),
            )
            .returning({ id: sceneAudio.id });
          if (completed === undefined) return;
          await tx
            .insert(usageRecords)
            .values({
              id: createId(now()),
              ownerUserId: context.ownerUserId,
              projectId: context.projectId,
              operationType: "tts.generation",
              idempotencyKey: `tts:${audio.id}`,
              provider: provider.providerId,
              model: provider.model ?? null,
              unit: "audio_second",
              quantity: (output.durationMs / 1000).toFixed(4),
              inputUnits: narration.length,
              outputUnits: null,
              estimatedCostUsd: (output.costUsd ?? 0).toFixed(6),
              latencyMs: null,
              retryCount: 0,
              status: "succeeded",
              correlationId: context.correlationId,
              metadata: {
                sceneAudioId: audio.id,
                durationMs: output.durationMs,
                ...(output.providerCallId === undefined
                  ? {}
                  : { providerCallId: output.providerCallId }),
              },
              occurredAt: now(),
            })
            .onConflictDoNothing();
          if (
            aligned.providerCallId !== undefined ||
            aligned.costUsd !== undefined ||
            aligned.latencyMs !== undefined
          ) {
            await tx
              .insert(usageRecords)
              .values({
                id: createId(now()),
                ownerUserId: context.ownerUserId,
                projectId: context.projectId,
                operationType: "tts.generation",
                idempotencyKey: `tts-alignment:${audio.id}`,
                provider: alignmentProvider?.providerId ?? "unknown",
                model: alignmentProvider?.model ?? null,
                unit: "audio_minute",
                quantity: (output.durationMs / 60_000).toFixed(6),
                inputUnits: null,
                outputUnits: aligned.timing.length,
                estimatedCostUsd: (aligned.costUsd ?? 0).toFixed(6),
                latencyMs: aligned.latencyMs ?? null,
                retryCount: aligned.retryCount ?? 0,
                status: "succeeded",
                correlationId: context.correlationId,
                metadata: {
                  sceneAudioId: audio.id,
                  phase: "forced_alignment",
                  ...(aligned.providerCallId === undefined
                    ? {}
                    : { providerCallId: aligned.providerCallId }),
                },
                occurredAt: now(),
              })
              .onConflictDoNothing();
          }
          await persistCaptions({
            database: tx,
            ownerUserId: context.ownerUserId,
            projectId: context.projectId,
            sceneAudioId: audio.id,
            narrationHash: payload.narrationHash,
            audioContentHash: audio.contentHash!,
            timing: aligned.timing,
            durationMs: output.durationMs,
            now,
          });
        });
        const [current] = await input.database
          .select({ status: sceneAudio.status })
          .from(sceneAudio)
          .where(eq(sceneAudio.id, audio.id))
          .limit(1);
        if (current?.status !== "ready") return { status: "stale" };
        await advanceProjectMediaStage(input.database, context, now());
        return {
          status: "ready",
          durationMs: output.durationMs,
          fitWarning: warning,
        };
      } catch (error) {
        const failureCode =
          error instanceof JobExecutionError ||
          error instanceof ProviderCallError
            ? error.code
            : "TTS_GENERATION_FAILED";
        await input.database
          .update(sceneAudio)
          .set({
            status: "failed",
            failureCode,
            updatedAt: now(),
          })
          .where(eq(sceneAudio.id, audio.id));
        await input.database
          .insert(usageRecords)
          .values({
            id: createId(now()),
            ownerUserId: context.ownerUserId,
            projectId: context.projectId,
            operationType: "tts.generation",
            idempotencyKey: `tts:${audio.id}:failed:${context.attempt}`,
            provider: provider.providerId,
            model: provider.model ?? null,
            unit: "audio_second",
            quantity: "0",
            inputUnits: null,
            outputUnits: null,
            estimatedCostUsd: "0",
            latencyMs: null,
            retryCount: context.attempt - 1,
            status: "failed",
            correlationId: context.correlationId,
            metadata: { sceneAudioId: audio.id, failureCode },
            occurredAt: now(),
          })
          .onConflictDoNothing();
        if (alignmentProvider?.providerId !== undefined && alignmentAttempted) {
          await input.database
            .insert(usageRecords)
            .values({
              id: createId(now()),
              ownerUserId: context.ownerUserId,
              projectId: context.projectId,
              operationType: "tts.generation",
              idempotencyKey: `tts-alignment:${audio.id}:failed:${context.attempt}`,
              provider: alignmentProvider.providerId,
              model: alignmentProvider.model ?? null,
              unit: "audio_minute",
              quantity: "0",
              inputUnits: null,
              outputUnits: null,
              estimatedCostUsd: "0",
              latencyMs: null,
              retryCount: context.attempt - 1,
              status: "failed",
              correlationId: context.correlationId,
              metadata: {
                sceneAudioId: audio.id,
                phase: "forced_alignment",
                failureCode,
              },
              occurredAt: now(),
            })
            .onConflictDoNothing();
        }
        if (error instanceof JobExecutionError) throw error;
        if (error instanceof ProviderCallError)
          throw new JobExecutionError(
            error.retryable ? "retryable" : "terminal",
            error.code,
            "The configured audio provider could not complete this scene.",
          );
        throw new JobExecutionError(
          "retryable",
          "TTS_GENERATION_FAILED",
          "The scene audio could not be generated.",
        );
      }
    },
  );
}

function alignWithoutProvider(
  provider: SceneAudioAlignmentProvider | undefined,
  audio: Uint8Array,
  narration: string,
  durationMs: number,
): Promise<SceneAudioAlignmentResult> {
  if (provider === undefined)
    throw new JobExecutionError(
      "terminal",
      "FORCED_ALIGNMENT_UNAVAILABLE",
      "The TTS provider returned no timestamps and no forced-alignment provider is configured.",
    );
  return Promise.resolve(provider.align({ audio, narration, durationMs })).then(
    (result) => {
      const alignment = Array.isArray(result) ? { timing: result } : result;
      const validTiming =
        alignment.timing.length > 0 &&
        alignment.timing.every(
          (item, index) =>
            item.startMs >= 0 &&
            item.endMs > item.startMs &&
            item.endMs <= durationMs &&
            (index === 0 || item.startMs >= alignment.timing[index - 1]!.endMs),
        );
      if (!validTiming)
        throw new JobExecutionError(
          "terminal",
          "FORCED_ALIGNMENT_INVALID",
          "The forced-alignment provider returned unusable timestamps.",
        );
      return {
        ...alignment,
        timing: alignSentences({
          narration,
          durationMs,
          timing: alignment.timing,
        }),
      };
    },
  );
}

async function persistCaptions(input: {
  database: DatabaseExecutor;
  ownerUserId: string;
  projectId: string;
  sceneAudioId: string;
  narrationHash: string;
  audioContentHash: string;
  timing: readonly { startMs: number; endMs: number; text: string }[];
  durationMs: number;
  now: () => Date;
}): Promise<void> {
  const contentHash = captionContentHash({
    narrationHash: input.narrationHash,
    audioContentHash: input.audioContentHash,
  });
  await input.database
    .insert(captionTracks)
    .values({
      id: createId(input.now()),
      ownerUserId: input.ownerUserId,
      projectId: input.projectId,
      sceneAudioId: input.sceneAudioId,
      contentHash,
      language: "en",
      status: "ready",
      createdAt: input.now(),
      updatedAt: input.now(),
    })
    .onConflictDoNothing();
  const [track] = await input.database
    .select({ id: captionTracks.id })
    .from(captionTracks)
    .where(
      and(
        eq(captionTracks.sceneAudioId, input.sceneAudioId),
        eq(captionTracks.contentHash, contentHash),
        eq(captionTracks.ownerUserId, input.ownerUserId),
        eq(captionTracks.projectId, input.projectId),
      ),
    )
    .limit(1);
  if (track === undefined) return;
  await input.database
    .update(captionTracks)
    .set({ status: "ready", updatedAt: input.now() })
    .where(eq(captionTracks.id, track.id));
  const cues = segmentCaptions(input.timing, input.durationMs);
  if (cues.length === 0) return;
  await input.database
    .insert(captionCues)
    .values(
      cues.map((cue, position) => ({
        id: createId(new Date(input.now().getTime() + position + 1)),
        ownerUserId: input.ownerUserId,
        projectId: input.projectId,
        trackId: track.id,
        position,
        startMs: cue.startMs,
        endMs: cue.endMs,
        text: cue.text,
        words: null,
        createdAt: input.now(),
      })),
    )
    .onConflictDoNothing();
}

async function hasReadyCaptions(
  database: DatabaseExecutor,
  sceneAudioId: string,
  context: { ownerUserId: string; projectId: string },
): Promise<boolean> {
  const [cue] = await database
    .select({ id: captionCues.id })
    .from(captionTracks)
    .innerJoin(captionCues, eq(captionCues.trackId, captionTracks.id))
    .where(
      and(
        eq(captionTracks.sceneAudioId, sceneAudioId),
        eq(captionTracks.ownerUserId, context.ownerUserId),
        eq(captionTracks.projectId, context.projectId),
        eq(captionTracks.status, "ready"),
        eq(captionCues.ownerUserId, context.ownerUserId),
        eq(captionCues.projectId, context.projectId),
      ),
    )
    .limit(1);
  return cue !== undefined;
}

function persistedTiming(
  value: unknown,
  durationMs: number | null,
): SceneAudioTiming[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || durationMs === null)
    return undefined;
  const timing: SceneAudioTiming[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return undefined;
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.startMs !== "number" ||
      !Number.isInteger(candidate.startMs) ||
      candidate.startMs < 0 ||
      typeof candidate.endMs !== "number" ||
      !Number.isInteger(candidate.endMs) ||
      candidate.endMs <= candidate.startMs ||
      candidate.endMs > durationMs ||
      typeof candidate.text !== "string" ||
      candidate.text.trim().length === 0 ||
      (timing.length > 0 &&
        candidate.startMs < timing[timing.length - 1]!.endMs)
    )
      return undefined;
    timing.push({
      startMs: candidate.startMs,
      endMs: candidate.endMs,
      text: candidate.text,
    });
  }
  return timing;
}

async function advanceProjectMediaStage(
  database: DatabaseClient,
  context: { ownerUserId: string; projectId: string },
  now: Date,
): Promise<void> {
  const findSpec = async (status: "draft" | "approved") =>
    (
      await database
        .select({ id: lessonSpecs.id })
        .from(lessonSpecs)
        .where(
          and(
            eq(lessonSpecs.ownerUserId, context.ownerUserId),
            eq(lessonSpecs.projectId, context.projectId),
            eq(lessonSpecs.status, status),
          ),
        )
        .orderBy(desc(lessonSpecs.generatedAt))
        .limit(1)
    )[0];
  const spec = (await findSpec("draft")) ?? (await findSpec("approved"));
  if (spec === undefined) return;
  const sceneRows = await database
    .select({ id: scenes.id })
    .from(scenes)
    .where(
      and(
        eq(scenes.ownerUserId, context.ownerUserId),
        eq(scenes.projectId, context.projectId),
        eq(scenes.lessonSpecId, spec.id),
      ),
    );
  if (sceneRows.length === 0) return;
  const audioRows = await database
    .select({
      id: sceneAudio.id,
      sceneId: sceneAudio.sceneId,
      status: sceneAudio.status,
      updatedAt: sceneAudio.updatedAt,
    })
    .from(sceneAudio)
    .where(
      and(
        eq(sceneAudio.ownerUserId, context.ownerUserId),
        eq(sceneAudio.projectId, context.projectId),
        inArray(
          sceneAudio.sceneId,
          sceneRows.map((scene) => scene.id),
        ),
      ),
    )
    .orderBy(desc(sceneAudio.updatedAt));
  const currentAudioByScene = new Map<string, (typeof audioRows)[number]>();
  for (const audio of audioRows)
    if (!currentAudioByScene.has(audio.sceneId))
      currentAudioByScene.set(audio.sceneId, audio);
  if (
    sceneRows.some(
      (scene) => currentAudioByScene.get(scene.id)?.status !== "ready",
    )
  )
    return;
  const currentAudioIds = [...currentAudioByScene.values()].map(
    (audio) => audio.id,
  );
  const readyCaptionRows = await database
    .select({ sceneAudioId: captionTracks.sceneAudioId })
    .from(captionTracks)
    .innerJoin(captionCues, eq(captionCues.trackId, captionTracks.id))
    .where(
      and(
        eq(captionTracks.ownerUserId, context.ownerUserId),
        eq(captionTracks.projectId, context.projectId),
        eq(captionTracks.status, "ready"),
        inArray(captionTracks.sceneAudioId, currentAudioIds),
        eq(captionCues.ownerUserId, context.ownerUserId),
        eq(captionCues.projectId, context.projectId),
      ),
    );
  const audioWithCaptions = new Set(
    readyCaptionRows.map((track) => track.sceneAudioId),
  );
  if (currentAudioIds.some((audioId) => !audioWithCaptions.has(audioId)))
    return;
  await database
    .update(projects)
    .set({ stage: "ready_for_validation", updatedAt: now })
    .where(
      and(
        eq(projects.id, context.projectId),
        eq(projects.ownerUserId, context.ownerUserId),
        inArray(projects.stage, [
          "narration_storyboard_review",
          "audio_generation",
        ]),
      ),
    );
}
function sceneAudioId(id: string): Identifier {
  return id as Identifier;
}
