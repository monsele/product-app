import { createId, PublicError, serializeUtcTimestamp, type Identifier } from "@avlp/config";
import { captionTracks, pronunciationEntries, projects, sceneAudio, voiceConfigurations, type DatabaseClient } from "@avlp/database";
import { PostgresAuditWriter } from "@avlp/observability";
import { voiceCatalogEntrySchema, voiceConfigurationInputSchema, voiceConfigurationResponseSchema, type VoiceCatalogEntry, type VoiceConfiguration, type VoiceConfigurationResponse } from "@avlp/schemas";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

export interface TextToSpeechProvider {
  readonly provider: string;
  approvedVoices(): readonly Omit<VoiceCatalogEntry, "previewUrl">[];
  preview(voiceId: string): { contentType: "audio/wav"; bytes: Uint8Array } | undefined;
}

/** Offline MVP fixture; a production provider adapter can replace it without
 * changing public voice IDs or persisting a provider-specific identifier. */
export class FixtureTextToSpeechProvider implements TextToSpeechProvider {
  public readonly provider = "fixture";
  public approvedVoices(): readonly Omit<VoiceCatalogEntry, "previewUrl">[] {
    return [
      { id: "english-aria", displayName: "Aria", description: "Warm and clear", language: "en-US" },
      { id: "english-james", displayName: "James", description: "Calm and conversational", language: "en-US" },
      { id: "english-luna", displayName: "Luna", description: "Bright and engaging", language: "en-US" },
    ];
  }
  public preview(voiceId: string): { contentType: "audio/wav"; bytes: Uint8Array } | undefined {
    const pitch = ({ "english-aria": 440, "english-james": 330, "english-luna": 523 } as Record<string, number>)[voiceId];
    return pitch === undefined ? undefined : { contentType: "audio/wav", bytes: wavPreview(pitch) };
  }
}
const provider: TextToSpeechProvider = new FixtureTextToSpeechProvider();

/** No provider credential or private storage key is exposed by this catalog. */
export function approvedVoiceCatalog(origin: string, tts: TextToSpeechProvider = provider): VoiceCatalogEntry[] {
  return tts.approvedVoices().map((entry) => voiceCatalogEntrySchema.parse({ ...entry, previewUrl: new URL(`/voices/${entry.id}/preview`, origin).toString() }));
}
export function approvedVoicePreview(voiceId: string, tts: TextToSpeechProvider = provider): { contentType: "audio/wav"; bytes: Uint8Array } | undefined {
  return tts.preview(voiceId);
}

export interface VoiceConfigurationService {
  get(input: { ownerUserId: Identifier; projectId: Identifier }): Promise<VoiceConfigurationResponse>;
  save(input: { ownerUserId: Identifier; projectId: Identifier; body: unknown; correlationId: Identifier }): Promise<VoiceConfigurationResponse>;
}

export class PostgresVoiceConfigurationService implements VoiceConfigurationService {
  public constructor(private readonly database: DatabaseClient, private readonly now: () => Date = () => new Date()) {}
  public async get(input: { ownerUserId: Identifier; projectId: Identifier }): Promise<VoiceConfigurationResponse> {
    const [row] = await this.database.select().from(voiceConfigurations).where(and(eq(voiceConfigurations.ownerUserId, input.ownerUserId), eq(voiceConfigurations.projectId, input.projectId))).limit(1);
    if (!row) return voiceConfigurationResponseSchema.parse({ configuration: null });
    const entries = await this.database.select().from(pronunciationEntries).where(and(eq(pronunciationEntries.ownerUserId, input.ownerUserId), eq(pronunciationEntries.projectId, input.projectId), eq(pronunciationEntries.voiceConfigurationId, row.id)));
    return voiceConfigurationResponseSchema.parse({ configuration: mapConfiguration(row, entries) });
  }
  public async save(input: { ownerUserId: Identifier; projectId: Identifier; body: unknown; correlationId: Identifier }): Promise<VoiceConfigurationResponse> {
    const command = parse(voiceConfigurationInputSchema, input.body);
    const now = this.now();
    return this.database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.projectId}))`);
      const [project] = await tx.select({ id: projects.id }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.ownerUserId, input.ownerUserId), isNull(projects.deletedAt))).limit(1);
      if (project === undefined) throw new PublicError("not_found", "The requested resource was not found.", 404);
      const [current] = await tx.select().from(voiceConfigurations).where(and(eq(voiceConfigurations.ownerUserId, input.ownerUserId), eq(voiceConfigurations.projectId, input.projectId))).limit(1).for("update");
      if ((current === undefined && command.expectedVersion !== 0) || (current !== undefined && current.version !== command.expectedVersion)) throw conflict();
      const version = current === undefined ? 1 : current.version + 1;
      const [saved] = current === undefined
        ? await tx.insert(voiceConfigurations).values({ id: createId(now), ownerUserId: input.ownerUserId, projectId: input.projectId, version, voiceId: command.voiceId, speakingRate: command.speakingRate, createdAt: now, updatedAt: now }).returning()
        : await tx.update(voiceConfigurations).set({ version, voiceId: command.voiceId, speakingRate: command.speakingRate, updatedAt: now }).where(and(eq(voiceConfigurations.id, current.id), eq(voiceConfigurations.version, current.version))).returning();
      if (!saved) throw conflict();
      const before = current === undefined ? [] : await tx.select().from(pronunciationEntries).where(eq(pronunciationEntries.voiceConfigurationId, current.id));
      const changed = voiceConfigurationChanged(current === undefined ? null : { voiceId: voiceCatalogEntrySchema.shape.id.parse(current.voiceId), speakingRate: current.speakingRate, pronunciationOverrides: before.map((entry) => ({ phrase: entry.phrase, replacement: entry.replacement })) }, command);
      if (current !== undefined) await tx.delete(pronunciationEntries).where(eq(pronunciationEntries.voiceConfigurationId, current.id));
      if (command.pronunciationOverrides.length) await tx.insert(pronunciationEntries).values(command.pronunciationOverrides.map((entry) => ({ id: createId(now), ownerUserId: input.ownerUserId, projectId: input.projectId, voiceConfigurationId: saved.id, phrase: entry.phrase, replacement: entry.replacement, createdAt: now })));
      if (changed) {
        await tx.update(sceneAudio).set({ status: "stale", updatedAt: now, voiceConfigurationVersion: version }).where(and(eq(sceneAudio.ownerUserId, input.ownerUserId), eq(sceneAudio.projectId, input.projectId)));
        await tx.update(captionTracks).set({ status: "stale", updatedAt: now }).where(and(eq(captionTracks.ownerUserId, input.ownerUserId), eq(captionTracks.projectId, input.projectId)));
      }
      await new PostgresAuditWriter(tx).write({ ownerUserId: input.ownerUserId, projectId: input.projectId, actor: { type: "user", userId: input.ownerUserId }, eventType: "voice.configuration_saved", target: { type: "voice_configuration", id: saved.id }, correlationId: input.correlationId, metadata: { version, voiceId: saved.voiceId, invalidated: changed ? ["audio", "captions"] : [] }, occurredAt: now });
      return voiceConfigurationResponseSchema.parse({ configuration: { version, voiceId: saved.voiceId as VoiceConfiguration["voiceId"], speakingRate: saved.speakingRate, pronunciationOverrides: command.pronunciationOverrides, updatedAt: serializeUtcTimestamp(saved.updatedAt) } });
    });
  }
}
function mapConfiguration(row: typeof voiceConfigurations.$inferSelect, entries: Array<typeof pronunciationEntries.$inferSelect>): VoiceConfiguration { return { version: row.version, voiceId: voiceCatalogEntrySchema.shape.id.parse(row.voiceId), speakingRate: row.speakingRate, pronunciationOverrides: entries.map((entry) => ({ phrase: entry.phrase, replacement: entry.replacement })), updatedAt: serializeUtcTimestamp(row.updatedAt) }; }
function parse<T>(schema: z.ZodType<T>, body: unknown): T { const result = schema.safeParse(body); if (result.success) return result.data; throw new PublicError("validation_failed", "Request validation failed.", 400, false, Object.fromEntries(result.error.issues.map((issue) => [issue.path.join(".") || "root", issue.message]))); }
function conflict(): PublicError { return new PublicError("bad_request", "The voice configuration changed. Please refresh and try again.", 409); }
/** Voice configuration is a lesson-wide dependency, so every derived audio and
 * caption artifact must be invalidated together. */
export function voiceConfigurationChanged(
  current: Pick<VoiceConfiguration, "voiceId" | "speakingRate" | "pronunciationOverrides"> | null,
  next: Pick<VoiceConfiguration, "voiceId" | "speakingRate" | "pronunciationOverrides">,
): boolean {
  if (current === null || current.voiceId !== next.voiceId || current.speakingRate !== next.speakingRate) return true;
  const canonical = (entries: readonly { phrase: string; replacement: string }[]) => JSON.stringify(entries.map((entry) => ({ phrase: entry.phrase, replacement: entry.replacement })).sort((left, right) => left.phrase.localeCompare(right.phrase)));
  return canonical(current.pronunciationOverrides) !== canonical(next.pronunciationOverrides);
}
function wavPreview(pitch: number): Uint8Array {
  const sampleRate = 8_000; const samples = sampleRate / 2; const bytes = new Uint8Array(44 + samples * 2); const view = new DataView(bytes.buffer);
  const write = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  write(0, "RIFF"); view.setUint32(4, 36 + samples * 2, true); write(8, "WAVEfmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); write(36, "data"); view.setUint32(40, samples * 2, true);
  for (let index = 0; index < samples; index += 1) view.setInt16(44 + index * 2, Math.round(Math.sin((2 * Math.PI * pitch * index) / sampleRate) * 6_000), true);
  return bytes;
}
