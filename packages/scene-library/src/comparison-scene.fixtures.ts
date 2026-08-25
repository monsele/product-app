import type { SceneSpec } from "@avlp/schemas";
import { createDefaultScene } from "./scene-registry.js";

export const textOnlyComparisonFixture = Object.freeze({
  ...createDefaultScene("comparison"),
  title: "Solids and liquids",
  visual: {
    leftSubject: { label: "Solid" },
    rightSubject: { label: "Liquid" },
    similarities: ["Both are matter", "Both have mass"],
    differences: ["A solid keeps its shape", "A liquid flows to fit its container"],
  },
} satisfies Extract<SceneSpec, { template: "comparison" }>);

export const imageAssistedComparisonFixture = Object.freeze({
  ...textOnlyComparisonFixture,
  visual: {
    ...textOnlyComparisonFixture.visual,
    leftSubject: { label: "Plant cell", assetSlot: "left-subject-image" },
    rightSubject: { label: "Animal cell", assetSlot: "right-subject-image" },
  },
  assetBindings: [
    { assetId: "00000000-0000-7000-8000-000000000006", role: "illustration", slot: "left-subject-image", altText: "Plant cell illustration" },
    { assetId: "00000000-0000-7000-8000-000000000007", role: "illustration", slot: "right-subject-image", altText: "Animal cell illustration" },
  ],
} satisfies Extract<SceneSpec, { template: "comparison" }>);

export const maximumDensityComparisonFixture = Object.freeze({
  ...textOnlyComparisonFixture,
  title: "T".repeat(160),
  visual: {
    leftSubject: { label: "L".repeat(80) },
    rightSubject: { label: "R".repeat(80) },
    similarities: Array.from({ length: 4 }, (_, index) => `${index}`.repeat(80)),
    differences: Array.from({ length: 4 }, (_, index) => `${index + 4}`.repeat(80)),
  },
} satisfies Extract<SceneSpec, { template: "comparison" }>);
