import { describe, expect, it } from "vitest";
import {
  isSceneAudioGenerationDisabled,
  sceneAudioFailureMessage,
  sceneAudioStatusLabel,
  shouldPollSceneAudio,
} from "./scene-audio-panel";

describe("scene audio status labels", () => {
  it("explains every independently retryable audio lifecycle state", () => {
    expect(sceneAudioStatusLabel("queued")).toContain("queued");
    expect(sceneAudioStatusLabel("generating")).toContain("Generating");
    expect(sceneAudioStatusLabel("ready")).toContain("ready");
    expect(sceneAudioStatusLabel("stale")).toContain("regeneration");
    expect(sceneAudioStatusLabel("failed")).toContain("failed");
  });

  it("polls only in-flight audio and enables an explicit retry once it fails or becomes stale", () => {
    expect(shouldPollSceneAudio("queued")).toBe(true);
    expect(shouldPollSceneAudio("generating")).toBe(true);
    expect(shouldPollSceneAudio("ready")).toBe(false);
    expect(shouldPollSceneAudio("failed")).toBe(false);
    expect(shouldPollSceneAudio("stale")).toBe(false);
    expect(
      isSceneAudioGenerationDisabled({
        disabled: false,
        busy: false,
        status: "failed",
      }),
    ).toBe(false);
    expect(
      isSceneAudioGenerationDisabled({
        disabled: false,
        busy: false,
        status: "queued",
      }),
    ).toBe(true);
  });

  it("surfaces the provider or caption failure instead of a generic error", () => {
    expect(sceneAudioFailureMessage("PROVIDER_REQUEST_REJECTED")).toContain(
      "provider rejected",
    );
    expect(
      sceneAudioFailureMessage("READY_AUDIO_CAPTIONS_UNRECOVERABLE"),
    ).toContain("no usable caption timing");
    expect(sceneAudioFailureMessage(null)).toBeNull();
  });
});
