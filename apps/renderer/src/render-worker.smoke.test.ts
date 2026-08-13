import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";
import { photosynthesisThreeMinutePreview } from "@avlp/scene-library";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFixtureRenderPayload } from "./contracts.js";
import { loadImmutableFixture } from "./fixture.js";
import { RemotionRenderEngine } from "./media.js";

describe("short 1080p MP4 render smoke", () => {
  let directory: string;

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "avlp-render-smoke-"));
  });

  afterAll(async () => {
    await rm(directory, { force: true, recursive: true });
  });

  it("renders H.264/AAC at 1920x1080 and creates a thumbnail", async () => {
    const payload = createFixtureRenderPayload(
      photosynthesisThreeMinutePreview,
    );
    const composition = loadImmutableFixture(payload);
    const engine = new RemotionRenderEngine();
    const video = await engine.renderVideo({
      browserExecutable: chromium.executablePath(),
      composition,
      frameRange: [0, 29],
      onProgress: () => Promise.resolve(),
      outputPath: join(directory, "lesson.mp4"),
      profile: payload.profile,
    });
    const thumbnail = await engine.renderThumbnail({
      browserExecutable: chromium.executablePath(),
      composition,
      frameRange: [0, 29],
      outputPath: join(directory, "thumbnail.png"),
      profile: payload.profile,
    });

    expect(video).toMatchObject({
      audioCodec: "aac",
      fps: 30,
      height: 1080,
      videoCodec: "h264",
      width: 1920,
    });
    expect(video.durationMs).toBeGreaterThanOrEqual(900);
    expect(video.durationMs).toBeLessThanOrEqual(1_100);
    expect(video.sizeBytes).toBeGreaterThan(0);
    expect(thumbnail).toMatchObject({ height: 1080, width: 1920 });
  }, 120_000);
});
