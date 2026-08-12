import type { SceneSpec } from "@avlp/schemas";
import { createDefaultScene } from "./scene-registry.js";
import type { ResolvedSceneAsset } from "./scene-registry.js";

export const textOnlySummaryFixture = Object.freeze({
  ...createDefaultScene("summary"),
  title: "States of matter",
  visual: {
    takeaways: [
      { text: "Heating makes particles move faster." },
      { text: "Cooling makes particles move more slowly." },
    ],
  },
} satisfies Extract<SceneSpec, { template: "summary" }>);

export const visualAssistedSummaryFixture = Object.freeze({
  ...textOnlySummaryFixture,
  visual: {
    centralModel: "Energy changes particle movement, which changes state.",
    takeaways: [
      {
        text: "Energy transfer changes particle movement.",
        objectiveId: "00000000-0000-7000-8000-000000000004",
      },
      { text: "Particle movement explains changes of state." },
      { text: "Use the model to predict melting and freezing." },
    ],
    callToAction: "Use this model for the next change of state.",
  },
} satisfies Extract<SceneSpec, { template: "summary" }>);

export const assetAssistedSummaryFixture = Object.freeze({
  ...visualAssistedSummaryFixture,
  assetBindings: [
    {
      altText: "Particle model illustration",
      assetId: "00000000-0000-7000-8000-000000000010",
      role: "illustration",
      slot: "central-visual",
    },
  ],
  visual: {
    ...visualAssistedSummaryFixture.visual,
    centralModel: undefined,
    centralAssetSlot: "central-visual",
  },
} satisfies Extract<SceneSpec, { template: "summary" }>);

export const resolvedSummaryAssets = Object.freeze({
  "00000000-0000-7000-8000-000000000010": {
    altText: "Particle model illustration",
    assetId: "00000000-0000-7000-8000-000000000010",
    source: "library",
    src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  },
} satisfies Readonly<Record<string, ResolvedSceneAsset>>);
