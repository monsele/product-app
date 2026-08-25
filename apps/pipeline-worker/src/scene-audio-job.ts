import { createHash } from "node:crypto";
import { createId, type Identifier } from "@avlp/config";
import {
  captionCues,
  captionTracks,
  pronunciationEntries,
  sceneAudio,
  scenes,
  usageRecords,
  voiceConfigurations,
  type DatabaseClient,
} from "@avlp/database";
import {
  defineJobHandler,
  JobExecutionError,
  type RegisteredJobHandler,
} from "@avlp/jobs";
import { sceneAudioGenerationJobPayloadSchema } from "@avlp/schemas";
import { storageKeys, type ObjectStorage } from "@avlp/storage";
import { and, eq, or } from "drizzle-orm";
import {
  alignSentences,
  captionContentHash,
  segmentCaptions,
} from "./captions.js";

export const sceneAudioGenerationJobType = "tts.generate";
export type SceneAudioSynthesis = {
  bytes: Uint8Array;
  durationMs: number;
  timing: Array<{ startMs: number; endMs: number; text: string }>;
};
/** Application-owned provider boundary. Implementations may be replaced without
 * changing the job envelope, content-addressed artifact identity, or API. */
export interface SceneAudioTtsProvider {
  readonly providerId: string;
  readonly outputFormat: "mp3" | "wav";
  readonly contentType: "audio/mpeg" | "audio/wav";
  synthesize(input: {
    narration: string;
    speakingRate: number;
  }): SceneAudioSynthesis;
}
/** Forced alignment is isolated behind an application-owned boundary so
 * production providers can align narration against the generated waveform. */
export interface SceneAudioAlignmentProvider {
  align(input: {
    audio: Uint8Array;
    narration: string;
    durationMs: number;
  }): Array<{ startMs: number; endMs: number; text: string }>;
}
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
  const durationMs = Math.max(
    500,
    Math.round((text.trim().split(/\s+/).length / (150 * rate)) * 60_000),
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
      if (audio.status === "ready") return { status: "ready", reused: true };
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
      try {
        if (
          payload.provider.providerId !== provider.providerId ||
          payload.provider.outputFormat !== provider.outputFormat
        )
          throw new JobExecutionError(
            "terminal",
            "TTS_PROVIDER_MISMATCH",
            "The requested TTS provider configuration is unavailable.",
          );
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
        const output = provider.synthesize({
          narration,
          speakingRate: voice.speakingRate,
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
              timing: output.timing,
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
              provider: "fixture",
              model: null,
              unit: "audio_second",
              quantity: (output.durationMs / 1000).toFixed(4),
              inputUnits: null,
              outputUnits: null,
              estimatedCostUsd: "0",
              latencyMs: null,
              retryCount: 0,
              status: "succeeded",
              correlationId: context.correlationId,
              metadata: {
                sceneAudioId: audio.id,
                durationMs: output.durationMs,
              },
              occurredAt: now(),
            })
            .onConflictDoNothing();
        });
        const [current] = await input.database
          .select({ status: sceneAudio.status })
          .from(sceneAudio)
          .where(eq(sceneAudio.id, audio.id))
          .limit(1);
        if (current?.status !== "ready") return { status: "stale" };
        await persistCaptions({
          database: input.database,
          ownerUserId: context.ownerUserId,
          projectId: context.projectId,
          sceneAudioId: audio.id,
          narrationHash: payload.narrationHash,
          audioContentHash: audio.contentHash!,
          timing:
            output.timing.length > 0
              ? alignSentences({
                  narration,
                  durationMs: output.durationMs,
                  timing: output.timing,
                })
              : alignWithoutProvider(
                  alignmentProvider,
                  output.bytes,
                  narration,
                  output.durationMs,
                ),
          durationMs: output.durationMs,
          now,
        });
        return {
          status: "ready",
          durationMs: output.durationMs,
          fitWarning: warning,
        };
      } catch (error) {
        const failureCode =
          error instanceof JobExecutionError
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
            provider: "fixture",
            model: null,
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
        if (error instanceof JobExecutionError) throw error;
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
): Array<{ startMs: number; endMs: number; text: string }> {
  if (provider === undefined)
    throw new JobExecutionError(
      "terminal",
      "FORCED_ALIGNMENT_UNAVAILABLE",
      "The TTS provider returned no timestamps and no forced-alignment provider is configured.",
    );
  return alignSentences({
    narration,
    durationMs,
    timing: provider.align({ audio, narration, durationMs }),
  });
}

async function persistCaptions(input: {
  database: DatabaseClient;
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
  await input.database.transaction(async (tx) => {
    await tx
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
    const [track] = await tx
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
    await tx
      .update(captionTracks)
      .set({ status: "ready", updatedAt: input.now() })
      .where(eq(captionTracks.id, track.id));
    const cues = segmentCaptions(input.timing, input.durationMs);
    if (cues.length === 0) return;
    await tx
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
  });
}
function sceneAudioId(id: string): Identifier {
  return id as Identifier;
}
