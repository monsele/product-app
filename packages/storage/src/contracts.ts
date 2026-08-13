import { z } from "zod";

const sha256HexPattern = /^[0-9a-f]{64}$/i;

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}

export const storageKeySchema = z
  .string()
  .min(1)
  .max(1024)
  .refine((key) => !key.startsWith("/"), "Storage keys must be relative.")
  .refine((key) => !key.includes("\\"), "Backslashes are not allowed.")
  .refine(
    (key) => key.split("/").every((segment) => segment !== ""),
    "Storage keys cannot contain empty path segments.",
  )
  .refine(
    (key) =>
      key.split("/").every((segment) => segment !== "." && segment !== ".."),
    "Storage keys cannot contain traversal segments.",
  )
  .refine(
    (key) => !/[%](?:2e|2f|5c)/i.test(key),
    "Encoded path separators and traversal fragments are not allowed.",
  )
  .refine(
    (key) => !containsControlCharacter(key),
    "Storage keys cannot contain control characters.",
  );
export type StorageKey = z.infer<typeof storageKeySchema>;

export const sha256ChecksumSchema = z
  .string()
  .regex(sha256HexPattern, "Expected a hexadecimal SHA-256 checksum.")
  .transform((value) => value.toLowerCase());
export type Sha256Checksum = z.infer<typeof sha256ChecksumSchema>;

export const storageObjectRefSchema = z.object({
  bucket: z.string().min(1),
  key: storageKeySchema,
  versionId: z.string().min(1).optional(),
});
export type StorageObjectRef = z.infer<typeof storageObjectRefSchema>;

export const signedUploadRequestSchema = z.object({
  key: storageKeySchema,
  contentType: z.string().min(1).max(255),
  contentLength: z.number().int().positive(),
  checksumSha256: sha256ChecksumSchema,
  expiresInSeconds: z.number().int().positive().optional(),
  metadata: z
    .record(z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/), z.string().max(2048))
    .optional(),
});
export type SignedUploadRequest = z.input<typeof signedUploadRequestSchema>;

export const signedDownloadRequestSchema = z.object({
  key: storageKeySchema,
  expiresInSeconds: z.number().int().positive().optional(),
  downloadFileName: z.string().min(1).max(255).optional(),
});
export type SignedDownloadRequest = z.infer<typeof signedDownloadRequestSchema>;

export type SignedStorageRequest = {
  object: StorageObjectRef;
  url: string;
  method: "GET" | "PUT";
  expiresAt: Date;
  requiredHeaders: Readonly<Record<string, string>>;
};

export type StorageObjectMetadata = {
  object: StorageObjectRef;
  sizeBytes: number;
  contentType: string | undefined;
  checksumSha256: Sha256Checksum | undefined;
  etag: string | undefined;
  lastModified: Date | undefined;
  metadata: Readonly<Record<string, string>>;
};

export const lifecycleRuleSchema = z
  .object({
    id: z.string().min(1).max(255),
    prefix: storageKeySchema,
    expireAfterDays: z.number().int().positive().optional(),
    abortIncompleteMultipartUploadAfterDays: z
      .number()
      .int()
      .positive()
      .optional(),
  })
  .refine(
    (rule) =>
      rule.expireAfterDays !== undefined ||
      rule.abortIncompleteMultipartUploadAfterDays !== undefined,
    "A lifecycle rule must configure at least one action.",
  );
export type StorageLifecycleRule = z.infer<typeof lifecycleRuleSchema>;

export interface ObjectStorage {
  assertPrivateBucket(): Promise<void>;
  createSignedUpload(
    request: SignedUploadRequest,
  ): Promise<SignedStorageRequest>;
  createSignedDownload(
    request: SignedDownloadRequest,
  ): Promise<SignedStorageRequest>;
  getMetadata(key: StorageKey): Promise<StorageObjectMetadata>;
  exists(key: StorageKey): Promise<boolean>;
  delete(key: StorageKey): Promise<void>;
  deletePrefix(prefix: StorageKey): Promise<number>;
  replaceLifecycleConfiguration(
    completeRules: readonly StorageLifecycleRule[],
  ): Promise<void>;
}
