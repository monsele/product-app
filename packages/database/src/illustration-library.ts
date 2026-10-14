/**
 * ST-113. Reading the platform illustration library and copying one of its
 * pictures into a lesson's project. Storage access is injected so this
 * package keeps no storage dependency: the catalogue reader is confined to
 * `catalog/illustrations`, the project writer to the tenant's own prefix.
 *
 * Nothing here writes the library. A copy is an ordinary active project asset
 * (provenance `ai_generated`, as the library picture was generated), so
 * previews, renders and version snapshots resolve it like any other hero and
 * keep working after the library row is retired.
 */
import { createHash } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { DatabaseClient } from "./client.js";
import { illustrationLibraryEntries, projectAssets } from "./schema.js";

/** Library pictures are generated at 1024×1024; anything larger is refused. */
export const illustrationLibraryMaxBytes = 8 * 1024 * 1024;

export type ActiveIllustrationLibraryEntry = Readonly<{
  entryId: string;
  key: string;
  treatment: "flat" | "ink-sketch" | "editorial";
  surface: "light" | "dark";
  depictsPeople: boolean;
}>;

/** Active entries of one treatment and surface, ordered by key. */
export async function activeIllustrationLibraryEntries(
  database: DatabaseClient,
  input: Readonly<{ treatment: string; surface: string }>,
): Promise<ActiveIllustrationLibraryEntry[]> {
  const rows = await database
    .select({
      entryId: illustrationLibraryEntries.id,
      key: illustrationLibraryEntries.illustrationKey,
      treatment: illustrationLibraryEntries.treatment,
      surface: illustrationLibraryEntries.surface,
      depictsPeople: illustrationLibraryEntries.depictsPeople,
    })
    .from(illustrationLibraryEntries)
    .where(
      and(
        eq(illustrationLibraryEntries.treatment, input.treatment),
        eq(illustrationLibraryEntries.surface, input.surface),
        eq(illustrationLibraryEntries.status, "active"),
      ),
    )
    .orderBy(asc(illustrationLibraryEntries.illustrationKey));
  return rows as ActiveIllustrationLibraryEntry[];
}

export type LibraryCopyStorage = Readonly<{
  /** Reads catalogue bytes; confined to the library prefix. */
  readCatalogBytes: (storageKey: string, maxBytes: number) => Promise<Uint8Array>;
  /** Writes the copy under the project's own prefix and returns its key. */
  writeProjectBytes: (
    input: Readonly<{ assetId: string; bytes: Uint8Array<ArrayBuffer>; sha256: string }>,
  ) => Promise<string>;
}>;

/**
 * The project asset showing library entry `entryId`, copying the bytes in
 * when the project has no active copy yet (matched by checksum, so repeated
 * use stores the picture once). Returns null when the entry is no longer
 * active. Never holds a transaction across the storage calls.
 */
export async function copyLibraryIllustrationIntoProject(
  input: Readonly<{
    database: DatabaseClient;
    storage: LibraryCopyStorage;
    ownerUserId: string;
    projectId: string;
    entryId: string;
    newAssetId: () => string;
    now: Date;
  }>,
): Promise<{ assetId: string; altText: string; copied: boolean } | null> {
  const [entry] = await input.database
    .select()
    .from(illustrationLibraryEntries)
    .where(
      and(
        eq(illustrationLibraryEntries.id, input.entryId),
        eq(illustrationLibraryEntries.status, "active"),
      ),
    )
    .limit(1);
  if (entry === undefined || entry.storageKey === null || entry.checksumSha256 === null)
    return null;
  const [existing] = await input.database
    .select({ id: projectAssets.id })
    .from(projectAssets)
    .where(
      and(
        eq(projectAssets.ownerUserId, input.ownerUserId),
        eq(projectAssets.projectId, input.projectId),
        eq(projectAssets.sha256, entry.checksumSha256),
        eq(projectAssets.provenance, "ai_generated"),
        eq(projectAssets.status, "active"),
        isNull(projectAssets.deletedAt),
      ),
    )
    .limit(1);
  if (existing !== undefined)
    return { assetId: existing.id, altText: entry.altText, copied: false };
  const bytes = new Uint8Array(
    await input.storage.readCatalogBytes(entry.storageKey, illustrationLibraryMaxBytes),
  );
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== entry.checksumSha256)
    throw new Error("ILLUSTRATION_LIBRARY_CHECKSUM_MISMATCH");
  const assetId = input.newAssetId();
  const storageKey = await input.storage.writeProjectBytes({ assetId, bytes, sha256 });
  await input.database.insert(projectAssets).values({
    id: assetId,
    ownerUserId: input.ownerUserId,
    projectId: input.projectId,
    mediaType: "image/png",
    originalName: "library-illustration.png",
    sizeBytes: bytes.byteLength,
    sha256,
    width: entry.width,
    height: entry.height,
    storageKey,
    provenance: "ai_generated",
    status: "active",
    createdAt: input.now,
    updatedAt: input.now,
  });
  return { assetId, altText: entry.altText, copied: true };
}
