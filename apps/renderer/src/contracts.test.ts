import { photosynthesisThreeMinutePreview } from "@avlp/scene-library";
import { describe, expect, it } from "vitest";
import {
  assertFixtureIntegrity,
  createFixtureRenderPayload,
  renderAssetManifestSchema,
  renderJobPayloadSchema,
} from "./contracts.js";

describe("render job v1 contracts", () => {
  it("hashes the immutable LessonSpec and render options deterministically", () => {
    const first = createFixtureRenderPayload(photosynthesisThreeMinutePreview);
    const second = createFixtureRenderPayload(photosynthesisThreeMinutePreview);
    const changedComposition = globalThis.structuredClone(
      photosynthesisThreeMinutePreview,
    );
    changedComposition.captions[0]!.text = "A different valid caption.";
    const changed = createFixtureRenderPayload(changedComposition);
    expect(first).toEqual(second);
    expect(changed.lessonSpecSha256).toBe(first.lessonSpecSha256);
    expect(changed.compositionSha256).not.toBe(first.compositionSha256);
    expect(changed.optionsHash).not.toBe(first.optionsHash);
    expect(() => assertFixtureIntegrity(first, changedComposition)).toThrow(
      "composition checksum",
    );
    expect(renderJobPayloadSchema.parse(first)).toEqual(first);
    expect(() =>
      assertFixtureIntegrity(
        { ...first, optionsHash: "0".repeat(64) },
        photosynthesisThreeMinutePreview,
      ),
    ).toThrow("options hash");
  });

  it("bounds asset manifests and rejects duplicate storage keys", () => {
    const asset = {
      checksumSha256: "a".repeat(64),
      contentType: "image/png" as const,
      sceneId: photosynthesisThreeMinutePreview.lesson.scenes[0]!.id,
      storageKey: "users/fixture/projects/fixture/assets/asset/original.png",
    };
    expect(
      renderAssetManifestSchema.safeParse({
        assets: [asset, asset],
        schemaVersion: 1,
      }).success,
    ).toBe(false);
    expect(
      renderAssetManifestSchema.safeParse({
        assets: Array.from({ length: 101 }, (_, index) => ({
          ...asset,
          storageKey: `${asset.storageKey}-${index}`,
        })),
        schemaVersion: 1,
      }).success,
    ).toBe(false);
  });
});
