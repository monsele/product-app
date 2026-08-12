import type { SceneSpec } from "@avlp/schemas";
import { createDefaultScene } from "./scene-registry.js";

export const sourcedAnalogyFixture = Object.freeze({
  ...createDefaultScene("analogy"),
  title: "Electric current",
  visual: {
    sourceConcept: "Electric current in a circuit",
    familiarSystem: "Water moving through pipes",
    mappings: [
      { concept: "Voltage", analogy: "Water pressure" },
      { concept: "Current", analogy: "Water flow" },
    ],
  },
} satisfies Extract<SceneSpec, { template: "analogy" }>);

export const generatedAnalogyFixture = Object.freeze({
  ...sourcedAnalogyFixture,
  generatedAdditions: [
    {
      kind: "analogy",
      content: "Circuit and pipe comparison",
      rationale: "Clarifies flow for beginners.",
    },
  ],
} satisfies Extract<SceneSpec, { template: "analogy" }>);

export const maximumDensityAnalogyFixture = Object.freeze({
  ...sourcedAnalogyFixture,
  title: "T".repeat(160),
  visual: {
    sourceConcept: "source concept ".repeat(5).trim(),
    familiarSystem: "familiar system ".repeat(5).trim(),
    mappings: Array.from({ length: 4 }, (_, index) => ({
      concept: `concept ${index + 1} `.repeat(6).trim(),
      analogy: `familiar ${index + 1} `.repeat(5).trim(),
    })),
  },
} satisfies Extract<SceneSpec, { template: "analogy" }>);
