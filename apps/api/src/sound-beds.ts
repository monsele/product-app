import { PublicError, type Identifier } from "@avlp/config";
import {
  lessonConfigurations,
  soundBedTracks,
  type DatabaseClient,
} from "@avlp/database";
import {
  soundBedCatalogEntrySchema,
  soundBedCatalogResponseSchema,
  type SoundBedCatalogEntry,
  type SoundBedCatalogResponse,
} from "@avlp/schemas";
import { storageKeySchema, type ObjectStorage } from "@avlp/storage";
import { and, asc, eq } from "drizzle-orm";

/** Audition and preview URLs are deliberately short-lived. */
export const soundBedSignedUrlTtlSeconds = 300;

type CatalogStorage = Pick<ObjectStorage, "createSignedDownload">;

export interface SoundBedService {
  list(): Promise<SoundBedCatalogResponse>;
  /** The project's configured bed for preview, or `undefined` for none. */
  previewForProject(scope: {
    ownerUserId: Identifier;
    projectId: Identifier;
  }): Promise<
    | {
        trackId: string;
        url: string;
        expiresAt: string;
        durationMs: number;
        loops: boolean;
      }
    | undefined
  >;
}

function toEntry(row: typeof soundBedTracks.$inferSelect): SoundBedCatalogEntry {
  return soundBedCatalogEntrySchema.parse({
    trackId: row.trackId,
    title: row.title,
    moodTags: row.moodTags,
    durationMs: row.durationMs,
    loops: row.loops,
    integratedLoudnessLufs: row.integratedLoudnessLufs,
    peakDbfs: row.peakDbfs,
    checksumSha256: row.checksumSha256,
    storageKey: row.storageKey,
    contentType: row.contentType,
    licenseId: row.licenseId,
    sourceUrl: row.sourceUrl,
    attributionText: row.attributionText,
  });
}

/**
 * ST-103 — the curated sound-bed catalog.
 *
 * The catalog is platform media shared by every tenant, so listing it needs
 * only an authenticated session. Its bytes are reachable solely through a
 * storage client confined to `catalog/sound-beds/`; each audition URL is
 * signed per request, expires in five minutes, and is never persisted.
 */
export class PostgresSoundBedService implements SoundBedService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly catalogStorage: CatalogStorage,
  ) {}

  public async list(): Promise<SoundBedCatalogResponse> {
    const rows = await this.database
      .select()
      .from(soundBedTracks)
      .where(eq(soundBedTracks.status, "active"))
      .orderBy(asc(soundBedTracks.sortOrder));
    const tracks = await Promise.all(
      rows.map(async (row) => {
        const entry = toEntry(row);
        const signed = await this.sign(entry.storageKey);
        return {
          trackId: entry.trackId,
          title: entry.title,
          moodTags: entry.moodTags,
          durationMs: entry.durationMs,
          loops: entry.loops,
          integratedLoudnessLufs: entry.integratedLoudnessLufs,
          licenseId: entry.licenseId,
          sourceUrl: entry.sourceUrl,
          attributionText: entry.attributionText,
          auditionUrl: signed.url,
          auditionExpiresAt: signed.expiresAt.toISOString(),
        };
      }),
    );
    return soundBedCatalogResponseSchema.parse({ tracks });
  }

  public async previewForProject(scope: {
    ownerUserId: Identifier;
    projectId: Identifier;
  }) {
    const [row] = await this.database
      .select({ track: soundBedTracks })
      .from(lessonConfigurations)
      .innerJoin(
        soundBedTracks,
        eq(soundBedTracks.trackId, lessonConfigurations.soundBedTrackId),
      )
      .where(
        and(
          eq(lessonConfigurations.ownerUserId, scope.ownerUserId),
          eq(lessonConfigurations.projectId, scope.projectId),
        ),
      )
      .limit(1);
    if (row === undefined) return undefined;
    const entry = toEntry(row.track);
    const signed = await this.sign(entry.storageKey);
    return {
      trackId: entry.trackId,
      url: signed.url,
      expiresAt: signed.expiresAt.toISOString(),
      durationMs: entry.durationMs,
      loops: entry.loops,
    };
  }

  private async sign(storageKey: string) {
    try {
      return await this.catalogStorage.createSignedDownload({
        key: storageKeySchema.parse(storageKey),
        expiresInSeconds: soundBedSignedUrlTtlSeconds,
      });
    } catch {
      throw new PublicError(
        "internal_error",
        "The sound bed catalog is temporarily unavailable.",
        503,
        true,
      );
    }
  }
}
