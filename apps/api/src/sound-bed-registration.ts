/**
 * ST-103 — registers the committed sound-bed catalog bytes in object storage.
 *
 * `pnpm --filter @avlp/api sound-beds:register`
 *
 * For each record in `sound-beds/catalog.json` this verifies the committed
 * WAV's checksum, then uploads it to its checksum-addressed key with a
 * storage-verified SHA-256. An object that already exists with the same
 * checksum is left alone, so the script is idempotent. Loudness was
 * normalised when the tracks were authored; nothing is re-encoded here.
 */
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { storageEnvironmentSchema } from "@avlp/config";
import {
  soundBedCatalogEntrySchema,
  soundBedCatalogPrefix,
  type SoundBedCatalogEntry,
} from "@avlp/schemas";
import {
  createS3CompatibleObjectStorage,
  storageKeySchema,
  type ObjectStorage,
} from "@avlp/storage";
import { z } from "zod";

const catalogFileSchema = z
  .object({
    generator: z.string(),
    tracks: z.array(soundBedCatalogEntrySchema).min(6).max(10),
  })
  .strict();

export async function loadCommittedCatalog(
  directory: URL = new URL("../sound-beds/", import.meta.url),
): Promise<Array<{ entry: SoundBedCatalogEntry; bytes: Uint8Array }>> {
  const catalog = catalogFileSchema.parse(
    JSON.parse(await readFile(new URL("catalog.json", directory), "utf8")),
  );
  return Promise.all(
    catalog.tracks.map(async (entry) => {
      const bytes = await readFile(
        fileURLToPath(new URL(`tracks/${entry.trackId}.wav`, directory)),
      );
      const checksum = createHash("sha256").update(bytes).digest("hex");
      if (checksum !== entry.checksumSha256)
        throw new Error(
          `The committed ${entry.trackId} track does not match its registered checksum.`,
        );
      return { entry, bytes: new Uint8Array(bytes) };
    }),
  );
}

export async function registerSoundBeds(
  storage: Pick<ObjectStorage, "createSignedUpload" | "exists" | "getMetadata">,
  tracks: Awaited<ReturnType<typeof loadCommittedCatalog>>,
  upload: (input: {
    url: string;
    method: string;
    headers: Readonly<Record<string, string>>;
    body: Uint8Array;
  }) => Promise<void> = async (input) => {
    const response = await fetch(input.url, {
      body: new Blob([Buffer.from(input.body)]),
      headers: input.headers,
      method: input.method,
    });
    if (!response.ok)
      throw new Error(`Catalog storage rejected an upload (${response.status}).`);
  },
): Promise<{ uploaded: string[]; present: string[] }> {
  const uploaded: string[] = [];
  const present: string[] = [];
  for (const { entry, bytes } of tracks) {
    const key = storageKeySchema.parse(entry.storageKey);
    if (!key.startsWith(`${soundBedCatalogPrefix}/`))
      throw new Error("A catalog key is outside the sound-bed prefix.");
    if (await storage.exists(key)) {
      const stored = await storage.getMetadata(key);
      if (stored.checksumSha256 !== entry.checksumSha256)
        throw new Error(
          `The stored ${entry.trackId} object has different bytes; registered checksums are immutable.`,
        );
      present.push(entry.trackId);
      continue;
    }
    const signed = await storage.createSignedUpload({
      checksumSha256: entry.checksumSha256,
      contentLength: bytes.byteLength,
      contentType: entry.contentType,
      key,
      metadata: { "track-id": entry.trackId, license: entry.licenseId },
    });
    await upload({
      body: bytes,
      headers: signed.requiredHeaders,
      method: signed.method,
      url: signed.url,
    });
    const stored = await storage.getMetadata(key);
    if (
      stored.checksumSha256 !== entry.checksumSha256 ||
      stored.sizeBytes !== bytes.byteLength
    )
      throw new Error(`Catalog storage did not verify ${entry.trackId}.`);
    uploaded.push(entry.trackId);
  }
  return { uploaded, present };
}

async function main(): Promise<void> {
  const environment = storageEnvironmentSchema
    .and(z.object({ OBJECT_STORAGE_BUCKET: z.string().min(1) }))
    .parse(process.env);
  const storage = await createS3CompatibleObjectStorage({
    bucket: environment.OBJECT_STORAGE_BUCKET,
    allowedPrefix: soundBedCatalogPrefix,
    allowedUploadContentTypes: ["audio/wav"],
    maxUploadBytes: 20 * 1024 * 1024,
    region: environment.OBJECT_STORAGE_REGION,
    forcePathStyle: environment.OBJECT_STORAGE_FORCE_PATH_STYLE,
    allowInsecureEndpoint: environment.OBJECT_STORAGE_ALLOW_INSECURE_ENDPOINT,
    runtimeEnvironment: environment.NODE_ENV,
    ...(environment.OBJECT_STORAGE_ACCESS_KEY === undefined
      ? {}
      : {
          credentials: {
            accessKeyId: environment.OBJECT_STORAGE_ACCESS_KEY,
            secretAccessKey: environment.OBJECT_STORAGE_SECRET_KEY!,
          },
        }),
    ...(environment.OBJECT_STORAGE_ENDPOINT === undefined
      ? {}
      : { endpoint: environment.OBJECT_STORAGE_ENDPOINT }),
  });
  const result = await registerSoundBeds(storage, await loadCommittedCatalog());
  console.log(
    `Sound beds registered: ${result.uploaded.length} uploaded, ${result.present.length} already present.`,
  );
}

if (
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url
)
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Registration failed.");
    process.exitCode = 1;
  });
