import { describe, expect, it, vi } from "vitest";
import { PublicError, createId } from "@avlp/config";
import type { ObjectStorage, SignedStorageRequest } from "./contracts.js";
import {
  AuthorizedProjectStorage,
  type ProjectStorageAuthorizer,
  type SignedProjectDownloadRequest,
} from "./authorized-project-storage.js";

const ownerUserId = createId(new Date("2026-08-13T12:00:00.000Z"));
const otherUserId = createId(new Date("2026-08-13T12:00:01.000Z"));
const projectId = createId(new Date("2026-08-13T12:00:02.000Z"));
const documentId = createId(new Date("2026-08-13T12:00:03.000Z"));

function signedRequest(key: string): SignedStorageRequest {
  return {
    object: { bucket: "private", key },
    url: "https://storage.example.test/signed",
    method: "GET",
    expiresAt: new Date("2026-08-13T12:05:00.000Z"),
    requiredHeaders: {},
  } as SignedStorageRequest;
}

function harness() {
  const createSignedDownload = vi.fn<ObjectStorage["createSignedDownload"]>(
    async ({ key }) => signedRequest(key),
  );
  const createSignedUpload = vi.fn<ObjectStorage["createSignedUpload"]>(
    async ({ key }) => ({ ...signedRequest(key), method: "PUT" }),
  );
  const authorizer: ProjectStorageAuthorizer = {
    assertProjectAccess: async (userId) => {
      if (userId !== ownerUserId)
        throw new PublicError(
          "not_found",
          "The requested resource was not found.",
          404,
        );
    },
  };
  const service = new AuthorizedProjectStorage(
    { createSignedDownload, createSignedUpload },
    authorizer,
  );
  return { createSignedDownload, createSignedUpload, service };
}

describe("AuthorizedProjectStorage", () => {
  it("authorizes before deriving and signing a tenant-scoped download key", async () => {
    const { createSignedDownload, service } = harness();
    await service.createSignedDownload(ownerUserId, {
      projectId,
      object: { kind: "source_original", documentId, extension: "pdf" },
    });

    expect(createSignedDownload).toHaveBeenCalledWith({
      key: `users/${ownerUserId}/projects/${projectId}/source/${documentId}/original.pdf`,
    });
  });

  it("does not call the signer for a cross-user URL request", async () => {
    const { createSignedDownload, service } = harness();
    await expect(
      service.createSignedDownload(otherUserId, {
        projectId,
        object: { kind: "source_original", documentId, extension: "pdf" },
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
    expect(createSignedDownload).not.toHaveBeenCalled();
  });

  it("never accepts a raw client-provided storage key", async () => {
    const { createSignedDownload, service } = harness();
    const rawKeyRequest = {
      projectId,
      key: `users/${otherUserId}/projects/${projectId}/secret.pdf`,
    } as unknown as SignedProjectDownloadRequest;

    await expect(
      service.createSignedDownload(ownerUserId, rawKeyRequest),
    ).rejects.toThrow();
    expect(createSignedDownload).not.toHaveBeenCalled();
  });

  it("does not accept a client-claimed owner identity", async () => {
    const { createSignedDownload, service } = harness();
    const requestWithClaimedOwner = {
      ownerUserId,
      projectId,
      object: { kind: "source_original", documentId, extension: "pdf" },
    } as SignedProjectDownloadRequest & { ownerUserId: typeof ownerUserId };

    await expect(
      service.createSignedDownload(otherUserId, requestWithClaimedOwner),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
    expect(createSignedDownload).not.toHaveBeenCalled();
  });

  it("applies the same authorization gate to upload URLs", async () => {
    const { createSignedUpload, service } = harness();
    await expect(
      service.createSignedUpload(otherUserId, {
        projectId,
        object: { kind: "source_original", documentId, extension: "pdf" },
        contentType: "application/pdf",
        contentLength: 10,
        checksumSha256: "a".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
    expect(createSignedUpload).not.toHaveBeenCalled();
  });

  it("does not issue user upload URLs for immutable derived artifacts", async () => {
    const { createSignedUpload, service } = harness();
    const renderUpload = {
      projectId,
      object: { kind: "render_video", renderJobId: documentId },
      contentType: "video/mp4",
      contentLength: 10,
      checksumSha256: "a".repeat(64),
    } as unknown as Parameters<
      AuthorizedProjectStorage["createSignedUpload"]
    >[1];

    await expect(
      service.createSignedUpload(ownerUserId, renderUpload),
    ).rejects.toThrow();
    expect(createSignedUpload).not.toHaveBeenCalled();
  });
});
