import { Buffer } from "node:buffer";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  GetBucketAclCommand,
  GetBucketPolicyStatusCommand,
  HeadObjectCommand,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import {
  lifecycleRuleSchema,
  sha256ChecksumSchema,
  signedDownloadRequestSchema,
  signedUploadRequestSchema,
  storageKeySchema,
  type ObjectStorage,
  type Sha256Checksum,
  type SignedDownloadRequest,
  type SignedStorageRequest,
  type SignedUploadRequest,
  type StorageKey,
  type StorageLifecycleRule,
  type StorageObjectMetadata,
} from "./contracts.js";

type SignableCommand = PutObjectCommand | GetObjectCommand;
type CommandSigner = (
  client: S3Client,
  command: SignableCommand,
  options: { expiresIn: number },
) => Promise<string>;

const defaultCommandSigner: CommandSigner = (client, command, options) =>
  getSignedUrl(client, command, {
    ...options,
    signableHeaders: new Set(["content-type"]),
  });

export type S3CompatibleObjectStorageOptions = {
  client: S3Client;
  bucket: string;
  allowedPrefix: string;
  allowedUploadContentTypes: readonly string[];
  maxUploadBytes: number;
  defaultSignedUrlTtlSeconds?: number;
  maxSignedUrlTtlSeconds?: number;
  signer?: CommandSigner;
  now?: () => Date;
};

export type S3CompatibleClientOptions = Omit<
  S3CompatibleObjectStorageOptions,
  "client"
> & {
  endpoint?: string;
  region?: string;
  forcePathStyle?: boolean;
  credentials?: { accessKeyId: string; secretAccessKey: string };
  allowInsecureEndpoint?: boolean;
  runtimeEnvironment?: "development" | "test" | "production";
};

const optionsSchema = z.object({
  bucket: z.string().min(1),
  allowedPrefix: storageKeySchema,
  allowedUploadContentTypes: z.array(z.string().min(1)).min(1),
  maxUploadBytes: z.number().int().positive(),
  defaultSignedUrlTtlSeconds: z.number().int().min(1).max(3600),
  maxSignedUrlTtlSeconds: z.number().int().min(1).max(3600),
});

function checksumHexToBase64(checksum: Sha256Checksum): string {
  return Buffer.from(checksum, "hex").toString("base64");
}

function checksumBase64ToHex(checksum: string): Sha256Checksum | undefined {
  try {
    const bytes = Buffer.from(checksum, "base64");
    if (bytes.byteLength !== 32) return undefined;
    return sha256ChecksumSchema.parse(bytes.toString("hex"));
  } catch {
    return undefined;
  }
}

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as {
    name?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };
  return (
    candidate.name === "NotFound" ||
    candidate.name === "NoSuchKey" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

function safeDownloadFileName(value: string): string {
  const normalized = [...value.normalize("NFKC")]
    .map((character) => {
      const codePoint = character.codePointAt(0);
      return character === "\\" ||
        character === "/" ||
        character === '"' ||
        (codePoint !== undefined && (codePoint <= 31 || codePoint === 127))
        ? "_"
        : character;
    })
    .join("")
    .trim();
  if (normalized.length === 0) throw new Error("Download filename is invalid.");
  return normalized;
}

function isLocalEndpoint(endpoint: URL): boolean {
  return (
    endpoint.hostname === "localhost" ||
    endpoint.hostname === "127.0.0.1" ||
    endpoint.hostname === "[::1]"
  );
}

export class S3CompatibleObjectStorage implements ObjectStorage {
  readonly #client: S3Client;
  readonly #bucket: string;
  readonly #allowedPrefix: StorageKey;
  readonly #allowedUploadContentTypes: ReadonlySet<string>;
  readonly #maxUploadBytes: number;
  readonly #defaultSignedUrlTtlSeconds: number;
  readonly #maxSignedUrlTtlSeconds: number;
  readonly #signer: CommandSigner;
  readonly #now: () => Date;
  #privacyVerified = false;

  public constructor(options: S3CompatibleObjectStorageOptions) {
    const parsed = optionsSchema.parse({
      bucket: options.bucket,
      allowedPrefix: options.allowedPrefix.replace(/\/$/, ""),
      allowedUploadContentTypes: [...options.allowedUploadContentTypes],
      maxUploadBytes: options.maxUploadBytes,
      defaultSignedUrlTtlSeconds: options.defaultSignedUrlTtlSeconds ?? 300,
      maxSignedUrlTtlSeconds: options.maxSignedUrlTtlSeconds ?? 900,
    });
    if (parsed.defaultSignedUrlTtlSeconds > parsed.maxSignedUrlTtlSeconds)
      throw new Error("Default signed URL TTL cannot exceed its maximum.");

    this.#client = options.client;
    this.#bucket = parsed.bucket;
    this.#allowedPrefix = parsed.allowedPrefix;
    this.#allowedUploadContentTypes = new Set(
      parsed.allowedUploadContentTypes.map((value) => value.toLowerCase()),
    );
    this.#maxUploadBytes = parsed.maxUploadBytes;
    this.#defaultSignedUrlTtlSeconds = parsed.defaultSignedUrlTtlSeconds;
    this.#maxSignedUrlTtlSeconds = parsed.maxSignedUrlTtlSeconds;
    this.#signer = options.signer ?? defaultCommandSigner;
    this.#now = options.now ?? (() => new Date());
  }

  public async createSignedUpload(
    input: SignedUploadRequest,
  ): Promise<SignedStorageRequest> {
    const request = signedUploadRequestSchema.parse(input);
    const key = this.#authorizeKey(request.key);
    await this.#ensurePrivateBucket();
    const contentType = request.contentType.toLowerCase();
    if (!this.#allowedUploadContentTypes.has(contentType))
      throw new Error("Upload content type is not allowed.");
    if (request.contentLength > this.#maxUploadBytes)
      throw new Error("Upload content length exceeds the configured maximum.");
    const expiresIn = this.#expiry(request.expiresInSeconds);
    const checksumBase64 = checksumHexToBase64(request.checksumSha256);
    const metadata = { ...request.metadata, sha256: request.checksumSha256 };
    const command = new PutObjectCommand({
      Bucket: this.#bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: request.contentLength,
      ChecksumSHA256: checksumBase64,
      Metadata: metadata,
      ACL: "private",
    });
    const url = await this.#signer(this.#client, command, { expiresIn });
    return {
      object: { bucket: this.#bucket, key },
      url,
      method: "PUT",
      expiresAt: new Date(this.#now().getTime() + expiresIn * 1000),
      requiredHeaders: {
        "content-length": String(request.contentLength),
        "content-type": contentType,
        "x-amz-checksum-sha256": checksumBase64,
      },
    };
  }

  public async assertPrivateBucket(): Promise<void> {
    const [acl, policyStatus] = await Promise.all([
      this.#client.send(new GetBucketAclCommand({ Bucket: this.#bucket })),
      this.#client.send(
        new GetBucketPolicyStatusCommand({ Bucket: this.#bucket }),
      ),
    ]);
    const publicGrant = acl.Grants?.some((grant) => {
      const uri = grant.Grantee?.URI;
      return (
        uri?.endsWith("/AllUsers") === true ||
        uri?.endsWith("/AuthenticatedUsers") === true
      );
    });
    if (publicGrant === true || policyStatus.PolicyStatus?.IsPublic === true)
      throw new Error("Object-storage bucket must not allow public access.");
    this.#privacyVerified = true;
  }

  public async createSignedDownload(
    input: SignedDownloadRequest,
  ): Promise<SignedStorageRequest> {
    const request = signedDownloadRequestSchema.parse(input);
    const key = this.#authorizeKey(request.key);
    await this.#ensurePrivateBucket();
    const expiresIn = this.#expiry(request.expiresInSeconds);
    const command = new GetObjectCommand({
      Bucket: this.#bucket,
      Key: key,
      ...(request.downloadFileName === undefined
        ? {}
        : {
            ResponseContentDisposition: `attachment; filename="${safeDownloadFileName(request.downloadFileName)}"`,
          }),
    });
    const url = await this.#signer(this.#client, command, { expiresIn });
    return {
      object: { bucket: this.#bucket, key },
      url,
      method: "GET",
      expiresAt: new Date(this.#now().getTime() + expiresIn * 1000),
      requiredHeaders: {},
    };
  }

  public async getMetadata(
    keyInput: StorageKey,
  ): Promise<StorageObjectMetadata> {
    const key = this.#authorizeKey(keyInput);
    const result = await this.#client.send(
      new HeadObjectCommand({
        Bucket: this.#bucket,
        Key: key,
        ChecksumMode: "ENABLED",
      }),
    );
    const metadataChecksum = result.Metadata?.["sha256"];
    const checksumSha256 =
      (result.ChecksumSHA256 === undefined
        ? undefined
        : checksumBase64ToHex(result.ChecksumSHA256)) ??
      (metadataChecksum === undefined
        ? undefined
        : sha256ChecksumSchema.safeParse(metadataChecksum).data);
    return {
      object: {
        bucket: this.#bucket,
        key,
        ...(result.VersionId === undefined
          ? {}
          : { versionId: result.VersionId }),
      },
      sizeBytes: result.ContentLength ?? 0,
      contentType: result.ContentType,
      checksumSha256,
      etag: result.ETag,
      lastModified: result.LastModified,
      metadata: { ...result.Metadata },
    };
  }

  public async exists(keyInput: StorageKey): Promise<boolean> {
    const key = this.#authorizeKey(keyInput);
    try {
      await this.#client.send(
        new HeadObjectCommand({ Bucket: this.#bucket, Key: key }),
      );
      return true;
    } catch (error) {
      if (isNotFoundError(error)) return false;
      throw error;
    }
  }

  public async delete(keyInput: StorageKey): Promise<void> {
    const key = this.#authorizeKey(keyInput);
    await this.#client.send(
      new DeleteObjectCommand({ Bucket: this.#bucket, Key: key }),
    );
  }

  public async replaceLifecycleConfiguration(
    input: readonly StorageLifecycleRule[],
  ): Promise<void> {
    const rules = z.array(lifecycleRuleSchema).min(1).parse(input);
    for (const rule of rules) this.#authorizeKey(rule.prefix);
    await this.#client.send(
      new PutBucketLifecycleConfigurationCommand({
        Bucket: this.#bucket,
        LifecycleConfiguration: {
          Rules: rules.map((rule) => ({
            ID: rule.id,
            Status: "Enabled" as const,
            Filter: { Prefix: rule.prefix },
            ...(rule.expireAfterDays === undefined
              ? {}
              : { Expiration: { Days: rule.expireAfterDays } }),
            ...(rule.abortIncompleteMultipartUploadAfterDays === undefined
              ? {}
              : {
                  AbortIncompleteMultipartUpload: {
                    DaysAfterInitiation:
                      rule.abortIncompleteMultipartUploadAfterDays,
                  },
                }),
          })),
        },
      }),
    );
  }

  #authorizeKey(input: string): StorageKey {
    const key = storageKeySchema.parse(input);
    if (
      key !== this.#allowedPrefix &&
      !key.startsWith(`${this.#allowedPrefix}/`)
    )
      throw new Error("Storage key is outside the configured prefix.");
    return key;
  }

  #expiry(input: number | undefined): number {
    const expiresIn = input ?? this.#defaultSignedUrlTtlSeconds;
    if (!Number.isInteger(expiresIn) || expiresIn < 1)
      throw new Error("Signed URL TTL must be a positive integer.");
    if (expiresIn > this.#maxSignedUrlTtlSeconds)
      throw new Error("Signed URL TTL exceeds the configured maximum.");
    return expiresIn;
  }

  async #ensurePrivateBucket(): Promise<void> {
    if (!this.#privacyVerified) await this.assertPrivateBucket();
  }
}

export async function createS3CompatibleObjectStorage(
  options: S3CompatibleClientOptions,
): Promise<S3CompatibleObjectStorage> {
  if (options.endpoint !== undefined) {
    const endpoint = new URL(options.endpoint);
    if (endpoint.protocol !== "https:") {
      const runtimeEnvironment = options.runtimeEnvironment ?? "production";
      if (options.allowInsecureEndpoint !== true)
        throw new Error(
          "Object-storage endpoints must use HTTPS unless insecure local access is explicitly enabled.",
        );
      if (runtimeEnvironment === "production")
        throw new Error(
          "Insecure object-storage endpoints are forbidden in production.",
        );
      if (!isLocalEndpoint(endpoint))
        throw new Error(
          "Insecure object-storage endpoints must use a local loopback host.",
        );
    }
  }
  const clientConfig: S3ClientConfig = {
    region: options.region ?? "us-east-1",
    forcePathStyle: options.forcePathStyle ?? false,
    ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
    ...(options.credentials === undefined
      ? {}
      : { credentials: options.credentials }),
  };
  const storage = new S3CompatibleObjectStorage({
    ...options,
    client: new S3Client(clientConfig),
  });
  await storage.assertPrivateBucket();
  return storage;
}
