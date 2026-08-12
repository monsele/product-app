import type { SceneSpec } from "@avlp/schemas";
import { createDefaultScene } from "./scene-registry.js";

export const minimumProcessFixture = Object.freeze({
  ...createDefaultScene("process"),
  title: "The water cycle",
  visual: { steps: ["Water warms", "Water evaporates"] },
} satisfies Extract<SceneSpec, { template: "process" }>);

export const maximumProcessFixture = Object.freeze({
  ...createDefaultScene("process"),
  title: "Six stages",
  visual: {
    steps: ["Observe", "Measure", "Compare", "Explain", "Test", "Share"],
  },
} satisfies Extract<SceneSpec, { template: "process" }>);

export const longLabelProcessFixture = Object.freeze({
  ...minimumProcessFixture,
  visual: {
    steps: [
      "Sunlight warms water in rivers, lakes, and oceans",
      "Water vapour rises and then cools high in the sky",
    ],
  },
} satisfies Extract<SceneSpec, { template: "process" }>);

export const iconAssistedProcessFixture = Object.freeze({
  ...minimumProcessFixture,
  assetBindings: [
    {
      assetId: "00000000-0000-7000-8000-000000000004",
      role: "icon",
      slot: "step-2-icon",
      altText: "Evaporation icon",
    },
  ],
} satisfies Extract<SceneSpec, { template: "process" }>);
