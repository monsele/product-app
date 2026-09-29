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
      identityPolicy: "canonical-json-v1" as const,
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
        rendererVersion: "st-097-remotion-4.0.507-creative-design-v1",
      }),
      profile: manifest.profile,
      rendererVersion: "st-097-remotion-4.0.507-creative-design-v1",
    });
    expect(() => assertProductionManifestIntegrity(payload)).not.toThrow();
    expect(() =>
      assertProductionManifestIntegrity({
        ...payload,
        manifest: { ...manifest, captions: [] },
      }),
    ).toThrow("manifest checksum");
  });

  it("ST-103: reads version-1 manifests and requires version 2 to state its sound bed", () => {
    const lesson = photosynthesisThreeMinutePreview.lesson;
    const audio = lesson.scenes.map((scene) => ({
      checksumSha256: "a".repeat(64),
      contentType: "audio/mpeg" as const,
      sceneId: scene.id,
      storageKey: `users/${lesson.projectId}/projects/${lesson.projectId}/audio/${scene.id}/a.mp3`,
    }));
    const soundBed = {
      trackId: "morning-pad",
      checksumSha256: "d".repeat(64),
      storageKey: `catalog/sound-beds/morning-pad/${"d".repeat(64)}.wav`,
      contentType: "audio/wav" as const,
      durationMs: 16_000,
      loops: true,
      integratedLoudnessLufs: -20,
      peakDbfs: -8.4,
      licenseId: "CC0-1.0" as const,
      attributionText: null,
    };
    const base = {
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
    const envelope = (
      manifest: Record<string, unknown>,
      assetSoundBed?: Record<string, unknown>,
    ) => ({
      assetManifest: {
        assets: audio,
        schemaVersion: 1,
        ...(assetSoundBed === undefined ? {} : { soundBed: assetSoundBed }),
      },
      compositionSha256: "e".repeat(64),
      lessonSpecSha256: "f".repeat(64),
      manifest,
      optionsHash: "0".repeat(64),
      profile: base.profile,
      rendererVersion: "st-103-remotion-4.0.507-sound-bed-render-review-v2",
    });
    const pinnedAsset = {
      checksumSha256: soundBed.checksumSha256,
      contentType: "audio/wav",
      storageKey: soundBed.storageKey,
      trackId: soundBed.trackId,
    };

    // A pre-ST-103 manifest still parses, and has no bed.
    expect(
      renderJobPayloadSchema.safeParse(envelope({ ...base, schemaVersion: 1 }))
        .success,
    ).toBe(true);
    // Version 2 with no bed, and with a bed pinned in both places.
    expect(
      renderJobPayloadSchema.safeParse(
        envelope({ ...base, schemaVersion: 2, soundBed: null }),
      ).success,
    ).toBe(true);
    expect(
      renderJobPayloadSchema.safeParse(
        envelope({ ...base, schemaVersion: 2, soundBed }, pinnedAsset),
      ).success,
    ).toBe(true);
    // Version 2 must state its bed; version 1 may not carry one.
    expect(
      renderJobPayloadSchema.safeParse(envelope({ ...base, schemaVersion: 2 }))
        .success,
    ).toBe(false);
    expect(
      renderJobPayloadSchema.safeParse(
        envelope({ ...base, schemaVersion: 1, soundBed }, pinnedAsset),
      ).success,
    ).toBe(false);
    // The asset manifest must pin exactly the manifest's bed.
    expect(
      renderJobPayloadSchema.safeParse(
        envelope({ ...base, schemaVersion: 2, soundBed }),
      ).success,
    ).toBe(false);
    expect(
      renderJobPayloadSchema.safeParse(
        envelope(
          { ...base, schemaVersion: 2, soundBed },
          { ...pinnedAsset, checksumSha256: "9".repeat(64) },
        ),
      ).success,
    ).toBe(false);
    // A bed must live under the catalog prefix, never a tenant prefix.
    expect(
      renderJobPayloadSchema.safeParse(
        envelope(
          {
            ...base,
            schemaVersion: 2,
            soundBed: { ...soundBed, storageKey: audio[0]!.storageKey },
          },
          { ...pinnedAsset, storageKey: audio[0]!.storageKey },
        ),
      ).success,
    ).toBe(false);
  });

  it("accepts a historical release identity so the worker can return an explicit unavailable result", () => {
    const fixture = createFixtureRenderPayload(photosynthesisThreeMinutePreview);
    expect(
      renderJobPayloadSchema.parse({
        ...fixture,
        rendererVersion: "st-024-remotion-4.0.507",
      }).rendererVersion,
    ).toBe("st-024-remotion-4.0.507");
  });
});
