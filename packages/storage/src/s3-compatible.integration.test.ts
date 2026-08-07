import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  CreateBucketCommand,
  DeleteBucketCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import type { StorageKey } from "./contracts.js";
import {
  createS3CompatibleObjectStorage,
  type S3CompatibleObjectStorage,
} from "./s3-compatible.js";

const integrationEnabled = process.env.STORAGE_INTEGRATION === "1";
const integrationEnvironmentSchema = z.object({
  OBJECT_STORAGE_ENDPOINT: z.string().url(),
  OBJECT_STORAGE_ACCESS_KEY: z.string().min(1),
  OBJECT_STORAGE_SECRET_KEY: z.string().min(1),
});

describe.runIf(integrationEnabled)("S3-compatible MinIO contract", () => {
  let client: S3Client;
  let storage: S3CompatibleObjectStorage;
  let bucket: string;
  const key =
    `users/018f3c2d-4a00-7000-8000-000000000001/projects/018f3c2d-4a00-7000-8000-000000000002/source/018f3c2d-4a00-7000-8000-000000000003/original.pdf` as StorageKey;
  const body = new TextEncoder().encode("private storage contract fixture");
  const checksum = createHash("sha256").update(body).digest("hex");

  beforeAll(async () => {
    const environment = integrationEnvironmentSchema.parse(process.env);
    bucket = `avlp-storage-${randomUUID()}`;
    const clientOptions = {
      endpoint: environment.OBJECT_STORAGE_ENDPOINT,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: environment.OBJECT_STORAGE_ACCESS_KEY,
        secretAccessKey: environment.OBJECT_STORAGE_SECRET_KEY,
      },
    };
    client = new S3Client(clientOptions);
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    storage = await createS3CompatibleObjectStorage({
      ...clientOptions,
      allowInsecureEndpoint: true,
      runtimeEnvironment: "test",
      bucket,
      allowedPrefix: "users",
      allowedUploadContentTypes: ["application/pdf"],
      maxUploadBytes: 1024,
      defaultSignedUrlTtlSeconds: 60,
      maxSignedUrlTtlSeconds: 120,
    });
  });

  afterAll(async () => {
    if (storage !== undefined) await storage.delete(key);
    if (client !== undefined && bucket !== undefined)
      await client.send(new DeleteBucketCommand({ Bucket: bucket }));
  });

  it("rejects an upload whose MIME type differs from the signed request", async () => {
    const upload = await storage.createSignedUpload({
      key,
      contentType: "application/pdf",
      contentLength: body.byteLength,
      checksumSha256: checksum,
    });
    const response = await globalThis.fetch(upload.url, {
      method: upload.method,
      headers: { ...upload.requiredHeaders, "content-type": "text/html" },
      body,
    });
    expect([401, 403]).toContain(response.status);
  });

  it("uploads privately and retrieves trusted checksum metadata", async () => {
    const upload = await storage.createSignedUpload({
      key,
      contentType: "application/pdf",
      contentLength: body.byteLength,
      checksumSha256: checksum,
      metadata: { fixture: "minio-contract" },
    });
    const uploadResponse = await globalThis.fetch(upload.url, {
      method: upload.method,
      headers: upload.requiredHeaders,
      body,
    });
    expect(uploadResponse.status).toBe(200);

    const metadata = await storage.getMetadata(key);
    expect(metadata).toMatchObject({
      sizeBytes: body.byteLength,
      contentType: "application/pdf",
      checksumSha256: checksum,
      metadata: { fixture: "minio-contract", sha256: checksum },
    });
    await expect(storage.exists(key)).resolves.toBe(true);

    const environment = integrationEnvironmentSchema.parse(process.env);
    const unsignedUrl = `${environment.OBJECT_STORAGE_ENDPOINT}/${bucket}/${key}`;
    const unsignedResponse = await globalThis.fetch(unsignedUrl);
    expect([401, 403]).toContain(unsignedResponse.status);
  });

  it("rejects an expired real presigned URL", async () => {
    const download = await storage.createSignedDownload({
      key,
      expiresInSeconds: 1,
    });
    await delay(2100);
    const response = await globalThis.fetch(download.url);
    expect([401, 403]).toContain(response.status);
  });
});
