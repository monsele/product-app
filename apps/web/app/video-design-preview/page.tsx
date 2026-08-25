"use client";

import { useState } from "react";
import {
  createDefaultScene,
  createScenePreviewFixture,
  FullLessonPreviewPlayer,
  photosynthesisThreeMinutePreview,
  ScenePreviewPlayer,
} from "@avlp/scene-library";
import { sceneTemplateValues, type SceneTemplate } from "@avlp/schemas";

const fixtureInputs = Object.freeze(
  Object.fromEntries(
    sceneTemplateValues.map((template) => [
      template,
      createScenePreviewFixture({
        ...createDefaultScene(template),
        narration: `Preview fixture for the ${template} scene template.`,
        title: `${template} preview`,
      }),
    ]),
  ) as Record<SceneTemplate, ReturnType<typeof createScenePreviewFixture>>,
);

const missingAssetInput = Object.freeze({
  ...createScenePreviewFixture(createDefaultScene("definition")),
  scene: {
    ...createDefaultScene("definition"),
    assetBindings: [
      {
        assetId: "00000000-0000-7000-8000-000000000004",
        altText: "Missing fixture",
        role: "illustration" as const,
        slot: "visual-example",
      },
    ],
  },
});

const missingAudioInput = Object.freeze({
  ...createScenePreviewFixture(createDefaultScene("hook")),
  manifest: {
    assets: {},
    audio: {
      assetId: "00000000-0000-7000-8000-000000000005",
      src: "/assets/missing-preview-audio.mp3",
    },
  },
});

export default function VideoDesignPreviewPage() {
  const [selected, setSelected] = useState<SceneTemplate>("hook");
  const [mode, setMode] = useState<
    "fixture" | "full-lesson" | "invalid" | "missing-asset" | "missing-audio"
  >("fixture");
  const input =
    mode === "fixture"
      ? fixtureInputs[selected]
      : mode === "invalid"
        ? {}
        : mode === "missing-asset"
          ? missingAssetInput
          : missingAudioInput;
  return (
    <main
      data-testid="scene-preview-gallery"
      style={{ margin: "0 auto", maxWidth: 1100, padding: 24 }}
    >
      <h1>Scene preview fixtures</h1>
      <p>
        Select one template to load only that scene. Browser preview uses the
        shared scene runtime and never starts an MP4 render.
      </p>
      <nav
        aria-label="Scene template fixtures"
        style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
      >
        {sceneTemplateValues.map((template) => (
          <button
            key={template}
            onClick={() => {
              setSelected(template);
              setMode("fixture");
            }}
            type="button"
          >
            {template}
          </button>
        ))}
        <button onClick={() => setMode("invalid")} type="button">
          invalid input
        </button>
        <button onClick={() => setMode("missing-asset")} type="button">
          missing asset
        </button>
        <button onClick={() => setMode("missing-audio")} type="button">
          missing audio
        </button>
        <button onClick={() => setMode("full-lesson")} type="button">
          full lesson
        </button>
      </nav>
      <section aria-label="Selected scene preview" style={{ marginTop: 24 }}>
        <h2>
          {mode === "fixture"
            ? `${selected} scene`
            : mode === "full-lesson"
              ? "three-minute lesson"
              : mode}
        </h2>
        {mode === "full-lesson" ? (
          <FullLessonPreviewPlayer input={photosynthesisThreeMinutePreview} />
        ) : (
          <ScenePreviewPlayer input={input} />
        )}
      </section>
    </main>
  );
}
