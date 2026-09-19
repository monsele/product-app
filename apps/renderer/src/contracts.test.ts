import { photosynthesisThreeMinutePreview } from "@avlp/scene-library";
import { hashJobOptions } from "@avlp/jobs";
import { describe, expect, it } from "vitest";
import {
  assertFixtureIntegrity,
  assertProductionManifestIntegrity,
  createFixtureRenderPayload,
  renderAssetManifestSchema,
  renderJobPayloadSchema,
} from "./contracts.js";
import { hasMatchingDemonstrationCaptions } from "./fixture.js";
import type { DemonstrationVariantPlan } from "@avlp/schemas/demonstration-pilot";

function checksum(value: unknown): string {
  return hashJobOptions(value);
}

describe("render job v1 contracts", () => {
  it("rejects a demonstration render whose caption manifest drifted", () => {
    const captions: DemonstrationVariantPlan["captions"] = [
      {
        endFrame: 30,
        sceneId: "0189d0f4-1b2c-7abc-8def-0123456789ab",
        startFrame: 0,
        text: "Original approved caption.",
      },
    ];
    expect(
      hasMatchingDemonstrationCaptions({ captions }, captions),
    ).toBe(true);
    expect(
      hasMatchingDemonstrationCaptions({ captions }, [
        { ...captions[0]!, text: "A newer caption." },
      ]),
    ).toBe(false);
  });

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
    expect(
      renderJobPayloadSchema.parse({
        ...first,
        lessonVersionId: "019ffbf1-eeee-7000-8000-000000000045",
      }).lessonVersionId,
    ).toBe("019ffbf1-eeee-7000-8000-000000000045");
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

  it("rejects a production payload when its immutable manifest is altered", () => {
    const lesson = photosynthesisThreeMinutePreview.lesson;
    const audio = lesson.scenes.map((scene) => ({
      checksumSha256: "a".repeat(64),
      contentType: "audio/mpeg" as const,
      sceneId: scene.id,
      storageKey: `users/${lesson.projectId}/projects/${lesson.projectId}/audio/${scene.id}/a.mp3`,
    }));
    const assetManifest = { assets: audio, schemaVersion: 1 as const };
    const manifest = {
      schemaVersion: 1 as const,
      lessonVersionId: "019ffbf1-eeee-7000-8000-000000000045",
      lessonVersionContentHash: "b".repeat(64),
      validationRunId: "019ffbf1-eeee-7000-8000-000000000046",
      validationInputHash: "c".repeat(64),
      sceneLibraryVersion: "mvp-v1" as const,
      audio,
      captions: photosynthesisThreeMinutePreview.captions,
      visualAssets: [],
      profile: {
        audioCodec: "aac" as const,
        fps: 30 as const,
        height: 1080 as const,
        pixelFormat: "yuv420p" as const,
        videoCodec: "h264" as const,
        width: 1920 as const,
      },
      snapshot: { lessonSpec: lesson },
    };
    const compositionSha256 = checksum(manifest);
    const lessonSpecSha256 = checksum(lesson);
    const payload = renderJobPayloadSchema.parse({
      assetManifest,
      compositionSha256,
      lessonVersionId: manifest.lessonVersionId,
      lessonSpecSha256,
      manifest,
      optionsHash: hashJobOptions({
        assetManifest,
        compositionSha256,
        lessonSpecSha256,
        profile: manifest.profile,
        rendererVersion: "st-096-remotion-4.0.507-scene-library-v1",
      }),
      profile: manifest.profile,
      rendererVersion: "st-096-remotion-4.0.507-scene-library-v1",
    });
    expect(() => assertProductionManifestIntegrity(payload)).not.toThrow();
    expect(() =>
      assertProductionManifestIntegrity({
        ...payload,
        manifest: { ...manifest, captions: [] },
      }),
    ).toThrow("manifest checksum");
  });
});
