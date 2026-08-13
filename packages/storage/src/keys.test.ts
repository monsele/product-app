import { describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import { storageKeySchema } from "./contracts.js";
import { storageKeys } from "./keys.js";

const userId = "018f3c2d-4a00-7000-8000-000000000001" as Identifier;
const projectId = "018f3c2d-4a00-7000-8000-000000000002" as Identifier;
const entityId = "018f3c2d-4a00-7000-8000-000000000003" as Identifier;
const scope = { userId, projectId };

describe("storageKeys", () => {
  it("builds every documented tenant-scoped key convention", () => {
    const prefix = `users/${userId}/projects/${projectId}`;
    expect(storageKeys.projectPrefix(scope)).toBe(prefix);
    expect(
      storageKeys.sourceOriginal({
        ...scope,
        documentId: entityId,
        extension: "pdf",
      }),
    ).toBe(`${prefix}/source/${entityId}/original.pdf`);
    expect(storageKeys.parsedDocling({ ...scope, versionId: entityId })).toBe(
      `${prefix}/parsed/${entityId}/docling.json`,
    );
    expect(
      storageKeys.parsedNormalized({ ...scope, versionId: entityId }),
    ).toBe(`${prefix}/parsed/${entityId}/normalized.json`);
    expect(
      storageKeys.assetOriginal({
        ...scope,
        assetId: entityId,
        extension: "png",
      }),
    ).toBe(`${prefix}/assets/${entityId}/original.png`);
    expect(
      storageKeys.sceneAudio({
        ...scope,
        sceneId: entityId,
        contentHash: "a".repeat(64),
      }),
    ).toBe(`${prefix}/audio/${entityId}/${"a".repeat(64)}.mp3`);
    expect(storageKeys.renderVideo({ ...scope, renderJobId: entityId })).toBe(
      `${prefix}/renders/${entityId}/lesson.mp4`,
    );
    expect(
      storageKeys.renderThumbnail({ ...scope, renderJobId: entityId }),
    ).toBe(`${prefix}/renders/${entityId}/thumbnail.png`);
  });

  it("rejects invalid identifiers instead of interpolating path input", () => {
    expect(() =>
      storageKeys.sourceOriginal({
        ...scope,
        documentId: "../../secret" as Identifier,
        extension: "pdf",
      }),
    ).toThrow("UUIDv7");
  });
});

describe("storageKeySchema", () => {
  it.each([
    "/users/id/file",
    "users//id/file",
    "users/../secret",
    "users/./secret",
    "users\\id\\file",
    "users/%2e%2e/secret",
    "users/%2Fsecret",
    "users/id/file\nforged",
  ])("rejects path traversal or ambiguous key %s", (key) => {
    expect(storageKeySchema.safeParse(key).success).toBe(false);
  });
});
