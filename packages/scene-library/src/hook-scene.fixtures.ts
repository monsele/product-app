import { createDefaultScene } from "./scene-registry.js";
import type { SceneSpec } from "@avlp/schemas";

export const validHookFixture = Object.freeze({
  ...createDefaultScene("hook"),
  visual: {
    question: "How can a plant make food without a kitchen?",
    prompt: "Look for the ingredients around it.",
    supportingElements: ["Sunlight", "Water"],
  },
} satisfies Extract<SceneSpec, { template: "hook" }>);

export const maximumDensityHookFixture = Object.freeze({
  ...createDefaultScene("hook"),
  visual: {
    question: "Q".repeat(80),
    prompt: "P".repeat(48),
    supportingElements: ["A".repeat(12), "B".repeat(12), "C".repeat(12)],
  },
} satisfies Extract<SceneSpec, { template: "hook" }>);

export const invalidHookFixture = Object.freeze({
  ...createDefaultScene("hook"),
  visual: {
    question: "Q".repeat(81),
    supportingElements: ["one", "two", "three", "four"],
  },
} satisfies Extract<SceneSpec, { template: "hook" }>);
