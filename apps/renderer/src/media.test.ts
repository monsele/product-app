import { photosynthesisThreeMinutePreview } from "@avlp/scene-library";
import { describe, expect, it } from "vitest";
import { createFixtureRenderPayload } from "./contracts.js";
import { loadImmutableFixture } from "./fixture.js";
import { RemotionRenderEngine, RenderMediaError } from "./media.js";

describe("Remotion render engine lifecycle", () => {
  it("retries bundling after a rejected bundle promise", async () => {
    let bundleAttempts = 0;
    const engine = new RemotionRenderEngine({
      bundleComposition: async () => {
        bundleAttempts += 1;
        if (bundleAttempts === 1)
          throw new Error("Resource temporarily unavailable.");
        return "http://renderer.invalid";
      },
      selectRenderComposition: async () => {
        throw new Error("Stop after proving that the bundle was retried.");
      },
    });
    const payload = createFixtureRenderPayload(
      photosynthesisThreeMinutePreview,
    );
    const request = {
      composition: loadImmutableFixture(payload),
      onProgress: () => Promise.resolve(),
      outputPath: "unused.mp4",
      profile: payload.profile,
    };

    await expect(engine.renderVideo(request)).rejects.toMatchObject({
      classification: "retryable",
      code: "RENDER_WORKER_UNAVAILABLE",
    } satisfies Partial<RenderMediaError>);
    await expect(engine.renderVideo(request)).rejects.toMatchObject({
      code: "RENDER_FAILED",
    } satisfies Partial<RenderMediaError>);
    expect(bundleAttempts).toBe(2);
  });
});
