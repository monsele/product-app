import type { SceneSpec } from "@avlp/schemas";
import { createDefaultScene } from "./scene-registry.js";

export const textOnlyDefinitionFixture = Object.freeze({
  ...createDefaultScene("definition"),
  visual: {
    term: "Evaporation",
    definition:
      "The change from a liquid to a gas at the surface of the liquid.",
    exampleLabel: "EXAMPLE",
    exampleText: "A puddle slowly disappears on a warm day.",
  },
} satisfies Extract<SceneSpec, { template: "definition" }>);

export const assetAssistedDefinitionFixture = Object.freeze({
  ...textOnlyDefinitionFixture,
  assetBindings: [
    {
      assetId: "00000000-0000-7000-8000-000000000004",
      role: "illustration",
      altText: "Water vapour rising from a puddle",
    },
  ],
} satisfies Extract<SceneSpec, { template: "definition" }>);

export const maximumDensityDefinitionFixture = Object.freeze({
  ...createDefaultScene("definition"),
  visual: {
    term: "T".repeat(80),
    definition: "D".repeat(120),
    exampleLabel: "L".repeat(48),
    exampleText: "E".repeat(48),
  },
} satisfies Extract<SceneSpec, { template: "definition" }>);
