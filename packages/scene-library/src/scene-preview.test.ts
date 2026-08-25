import { describe, expect, it } from "vitest";
import { createDefaultScene } from "./scene-registry.js";
import {
  createScenePreviewFixture,
  formatAudioPlaybackError,
  getScenePreviewFrame,
  parseScenePreviewInput,
} from "./scene-preview.js";

describe("scene preview input", () => {
  it("accepts a LessonSpec-compatible fixture without optional audio and derives captions", () => {
    const scene = createDefaultScene("hook");
    const result = parseScenePreviewInput(createScenePreviewFixture(scene));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.scene).toEqual(scene);
      expect(result.input.captions[0]?.text).toBe(scene.narration);
      expect(result.input.manifest.audio).toBeUndefined();
    }
  });

  it("reports invalid scene input without throwing", () => {
    const result = parseScenePreviewInput({});
    expect(result).toMatchObject({ ok: false });
  });

  it("reports a missing required preview asset", () => {
    const scene = {
      ...createDefaultScene("definition"),
      assetBindings: [
        {
          assetId: "00000000-0000-7000-8000-000000000004",
          altText: "Missing",
          role: "illustration" as const,
          slot: "visual-example",
        },
      ],
    };
    const result = parseScenePreviewInput(createScenePreviewFixture(scene));
    expect(result).toMatchObject({
      ok: false,
      message: expect.stringContaining("Missing preview asset"),
    });
  });

  it("rejects an unapproved media URL", () => {
    const input = createScenePreviewFixture(createDefaultScene("hook"));
    const result = parseScenePreviewInput({
      ...input,
      manifest: {
        assets: {},
        audio: {
          assetId: "00000000-0000-7000-8000-000000000004",
          src: "javascript:alert(1)",
        },
      },
    });
    expect(result).toMatchObject({
      ok: false,
      message: expect.stringContaining("Media URLs"),
    });
  });

  it("clamps seeks to a deterministic frame in the selected scene only", () => {
    expect(getScenePreviewFrame(12.9, 300)).toBe(12);
    expect(getScenePreviewFrame(-1, 300)).toBe(0);
    expect(getScenePreviewFrame(300, 300)).toBe(299);
  });

  it("formats missing-audio playback failures as actionable errors", () => {
    expect(formatAudioPlaybackError(new Error("404 Not Found"))).toContain(
      "Refresh its authorized media",
    );
  });
});
