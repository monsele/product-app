import React from "react";
import { createRoot } from "react-dom/client";
import { createDefaultStoryboardSceneSpec } from "@avlp/schemas";
import { FullLessonPreviewPlayer } from "./full-lesson.js";
import { ScenePreviewPlayer } from "./scene-preview.js";

declare global {
  interface Window {
    previewAudioSeeks: Array<{ from: number; to: number }>;
  }
}

// Test-only entry: a hydrated Player with real, locally served PCM audio.
window.previewAudioSeeks = [];
const currentTime = Object.getOwnPropertyDescriptor(
  HTMLMediaElement.prototype,
  "currentTime",
)!;
Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
  ...currentTime,
  set(this: HTMLMediaElement, to: number) {
    if (this.duration > 1)
      window.previewAudioSeeks.push({ from: this.currentTime, to });
    currentTime.set!.call(this, to);
  },
});

// Modest visual work makes clock resets reproducible, without modifying time.
const visualWork = (): void => {
  const until = window.performance.now() + 12;
  while (window.performance.now() < until) {
    /* simulate a frame's layout work */
  }
  window.requestAnimationFrame(visualWork);
};
window.requestAnimationFrame(visualWork);

const scenes = [1, 2].map((order) =>
  createDefaultStoryboardSceneSpec("hook", {
    id: `00000000-0000-7000-8000-00000000000${order}`,
    order,
    durationSeconds: 12,
  }),
);
const src = `${window.location.origin}/audio.wav`;
const container = window.document.createElement("div");
window.document.body.appendChild(container);
const scene = scenes[0]!;
createRoot(container).render(
  window.location.search === "?scene" ? (
    <ScenePreviewPlayer
      muted={false}
      input={{
        scene,
        captions: [{ startFrame: 0, endFrame: 360, text: "Scene narration" }],
        manifest: { assets: {}, audio: { assetId: scene.id, src } },
      }}
    />
  ) : (
    <FullLessonPreviewPlayer
      input={{
        lesson: { scenes },
        assets: {},
        narrationTracks: scenes.map((entry) => ({
          kind: "browser-audio",
          sceneId: entry.id,
          src,
        })),
        captions: scenes.map((entry, i) => ({
          sceneId: entry.id,
          startFrame: i * 360,
          endFrame: (i + 1) * 360,
          text: `Scene ${i + 1} narration`,
        })),
      }}
    />
  ),
);
