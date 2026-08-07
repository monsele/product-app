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
} from "@aws-sdk/client-s3";
import { describe, expect, it, vi } from "vitest";
import type { StorageKey } from "./contracts.js";
import {
  createS3CompatibleObjectStorage,
  S3CompatibleObjectStorage,
} from "./s3-compatible.js";

const key =
  "users/018f3c2d-4a00-7000-8000-000000000001/projects/018f3c2d-4a00-7000-8000-000000000002/source/018f3c2d-4a00-7000-8000-000000000003/original.pdf" as StorageKey;
const checksum = "a".repeat(64);

function createHarness(
  sendImplementation: (command: unknown) => Promise<unknown> = async () => ({}),
) {
  const send = vi.fn(sendImplementation);
  const signed: Array<{ command: unknown; expiresIn: number }> = [];
  const storage = new S3CompatibleObjectStorage({
    client: { send } as unknown as S3Client,
    bucket: "private-bucket",
    allowedPrefix: "users",
    allowedUploadContentTypes: ["application/pdf"],
    maxUploadBytes: 1024,
    defaultSignedUrlTtlSeconds: 60,
    maxSignedUrlTtlSeconds: 120,
    now: () => new Date("2026-08-07T12:00:00.000Z"),
    signer: async (_client, command, options) => {
      signed.push({ command, expiresIn: options.expiresIn });
      return `https://signed.example.test/object?ttl=${options.expiresIn}`;
    },
  });
  return { send, signed, storage };
}

describe("S3CompatibleObjectStorage", () => {
  it("rejects insecure endpoints unless local access is explicit", async () => {
    await expect(
      createS3CompatibleObjectStorage({
        endpoint: "http://storage.example.test",
        bucket: "private-bucket",
        allowedPrefix: "users",
        allowedUploadContentTypes: ["application/pdf"],
        maxUploadBytes: 1024,
      }),
    ).rejects.toThrow("must use HTTPS");

    await expect(
      createS3CompatibleObjectStorage({
        endpoint: "http://localhost:9000",
        allowInsecureEndpoint: true,
        runtimeEnvironment: "production",
        bucket: "private-bucket",
        allowedPrefix: "users",
        allowedUploadContentTypes: ["application/pdf"],
        maxUploadBytes: 1024,
      }),
    ).rejects.toThrow("forbidden in production");

    await expect(
      createS3CompatibleObjectStorage({
        endpoint: "http://storage.example.test",
        allowInsecureEndpoint: true,
        runtimeEnvironment: "development",
        bucket: "private-bucket",
        allowedPrefix: "users",
        allowedUploadContentTypes: ["application/pdf"],
        maxUploadBytes: 1024,
      }),
    ).rejects.toThrow("local loopback host");
  });

  it("creates a constrained private upload request with checksum metadata", async () => {
    const { signed, storage } = createHarness();
    const result = await storage.createSignedUpload({
      key,
      contentType: "application/pdf",
      contentLength: 512,
      checksumSha256: checksum,
    });

    expect(result).toMatchObject({
      object: { bucket: "private-bucket", key },
      method: "PUT",
      expiresAt: new Date("2026-08-07T12:01:00.000Z"),
      requiredHeaders: {
        "content-length": "512",
        "content-type": "application/pdf",
      },
    });
    expect(signed).toHaveLength(1);
    expect(signed[0]?.command).toBeInstanceOf(PutObjectCommand);
    const input = (signed[0]?.command as PutObjectCommand).input;
    expect(input).toMatchObject({
      Bucket: "private-bucket",
      Key: key,
      ContentLength: 512,
      ContentType: "application/pdf",
      Metadata: { sha256: checksum },
    });
    expect(input.ACL).toBe("private");
  });

  it("fails closed when the bucket ACL or policy is public", async () => {
    const privateHarness = createHarness(async (command) => {
      if (command instanceof GetBucketAclCommand) return { Grants: [] };
      if (command instanceof GetBucketPolicyStatusCommand)
        return { PolicyStatus: { IsPublic: false } };
      return {};
    });
    await expect(
      privateHarness.storage.assertPrivateBucket(),
    ).resolves.toBeUndefined();

    const publicHarness = createHarness(async (command) => {
      if (command instanceof GetBucketAclCommand)
        return {
          Grants: [
            {
              Grantee: {
                URI: "http://acs.amazonaws.com/groups/global/AllUsers",
              },
              Permission: "READ",
            },
          ],
        };
      if (command instanceof GetBucketPolicyStatusCommand)
        return { PolicyStatus: { IsPublic: false } };
      return {};
    });
    await expect(publicHarness.storage.assertPrivateBucket()).rejects.toThrow(
      "must not allow public access",
    );
  });

  it("caps expiry and signs downloads without persisting the URL", async () => {
    const { signed, storage } = createHarness();
    const result = await storage.createSignedDownload({
      key,
      expiresInSeconds: 120,
      downloadFileName: "lesson.pdf",
    });
    expect(result.method).toBe("GET");
    expect(result.expiresAt.toISOString()).toBe("2026-08-07T12:02:00.000Z");
    expect(signed[0]?.expiresIn).toBe(120);
    expect(signed[0]?.command).toBeInstanceOf(GetObjectCommand);
    expect((signed[0]?.command as GetObjectCommand).input).toMatchObject({
      ResponseContentDisposition: 'attachment; filename="lesson.pdf"',
    });
    await expect(
      storage.createSignedDownload({ key, expiresInSeconds: 121 }),
    ).rejects.toThrow("configured maximum");

    await storage.createSignedDownload({
      key,
      downloadFileName: "lesson\r\nmalicious.pdf",
    });
    expect((signed[1]?.command as GetObjectCommand).input).toMatchObject({
      ResponseContentDisposition:
        'attachment; filename="lesson__malicious.pdf"',
    });
  });

  it("rejects unauthorized prefixes before calling the provider", async () => {
    const { send, signed, storage } = createHarness();
    await expect(
      storage.createSignedDownload({
        key: "other-tenant/private.pdf" as StorageKey,
      }),
    ).rejects.toThrow("outside the configured prefix");
    expect(send).not.toHaveBeenCalled();
    expect(signed).toHaveLength(0);
  });

  it("rejects traversal, disallowed MIME types, and excessive lengths", async () => {
    const { storage } = createHarness();
    await expect(
      storage.createSignedDownload({
        key: "users/../private.pdf" as StorageKey,
      }),
    ).rejects.toThrow("traversal");
    await expect(
      storage.createSignedUpload({
        key,
        contentType: "text/html",
        contentLength: 1,
        checksumSha256: checksum,
      }),
    ).rejects.toThrow("content type");
    await expect(
      storage.createSignedUpload({
        key,
        contentType: "application/pdf",
        contentLength: 1025,
        checksumSha256: checksum,
      }),
    ).rejects.toThrow("configured maximum");
  });

  it("retrieves checksum and metadata after upload", async () => {
    const base64Checksum = Buffer.from(checksum, "hex").toString("base64");
    const { send, storage } = createHarness(async (command) => {
      expect(command).toBeInstanceOf(HeadObjectCommand);
      return {
        ContentLength: 512,
        ContentType: "application/pdf",
        ChecksumSHA256: base64Checksum,
        ETag: '"etag"',
        LastModified: new Date("2026-08-07T12:00:00.000Z"),
        Metadata: { source: "teacher-upload", sha256: checksum },
        VersionId: "version-1",
      };
    });
    await expect(storage.getMetadata(key)).resolves.toEqual({
      object: { bucket: "private-bucket", key, versionId: "version-1" },
      sizeBytes: 512,
      contentType: "application/pdf",
      checksumSha256: checksum,
      etag: '"etag"',
      lastModified: new Date("2026-08-07T12:00:00.000Z"),
      metadata: { source: "teacher-upload", sha256: checksum },
    });
    expect(
      (send.mock.calls[0]?.[0] as HeadObjectCommand).input.ChecksumMode,
    ).toBe("ENABLED");
  });

  it("supports existence checks, deletion, and scoped lifecycle hooks", async () => {
    const commands: unknown[] = [];
    const { storage } = createHarness(async (command) => {
      commands.push(command);
      return {};
    });
    await expect(storage.exists(key)).resolves.toBe(true);
    await storage.delete(key);
    await storage.replaceLifecycleConfiguration([
      {
        id: "abandoned-sources",
        prefix: "users/quarantine" as StorageKey,
        expireAfterDays: 7,
        abortIncompleteMultipartUploadAfterDays: 1,
      },
    ]);
    expect(commands[0]).toBeInstanceOf(HeadObjectCommand);
    expect(commands[1]).toBeInstanceOf(DeleteObjectCommand);
    expect(commands[2]).toBeInstanceOf(PutBucketLifecycleConfigurationCommand);
    const lifecycle = commands[2] as PutBucketLifecycleConfigurationCommand;
    expect(lifecycle.input.LifecycleConfiguration?.Rules).toEqual([
      expect.objectContaining({ ID: "abandoned-sources" }),
    ]);
  });

  it("returns false only for provider not-found responses", async () => {
    const { storage } = createHarness(async () => {
      throw { name: "NotFound", $metadata: { httpStatusCode: 404 } };
    });
    await expect(storage.exists(key)).resolves.toBe(false);
  });
});
