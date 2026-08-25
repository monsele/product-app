import type { SceneSpec } from "@avlp/schemas";
import { createDefaultScene } from "./scene-registry.js";

export const simpleCauseEffectFixture = Object.freeze({
  ...createDefaultScene("cause-effect"),
  title: "Heating water causes evaporation",
  visual: {
    causes: [
      { id: "cause-1", label: "Water is heated", assetSlot: "cause-1-icon" },
    ],
    mechanism: {
      id: "mechanism",
      label: "Molecules gain energy",
      assetSlot: "mechanism-icon",
    },
    effects: [
      { id: "effect-1", label: "Water evaporates", assetSlot: "effect-1-icon" },
    ],
    connections: [
      { from: "cause-1", to: "mechanism" },
      { from: "mechanism", to: "effect-1" },
    ],
  },
  assetBindings: [
    {
      assetId: "00000000-0000-7000-8000-000000000008",
      role: "icon",
      slot: "cause-1-icon",
      altText: "Heat icon",
    },
  ],
} satisfies Extract<SceneSpec, { template: "cause-effect" }>);

export const branchingCauseEffectFixture = Object.freeze({
  ...simpleCauseEffectFixture,
  title: "Too much rain creates several effects",
  visual: {
    causes: [
      { id: "cause-1", label: "Heavy rain" },
      { id: "cause-2", label: "Ground is already saturated" },
    ],
    effects: [
      { id: "effect-1", label: "Rivers rise" },
      { id: "effect-2", label: "Fields flood" },
    ],
    connections: [
      { from: "cause-1", to: "effect-1" },
      { from: "cause-1", to: "effect-2" },
      { from: "cause-2", to: "effect-1" },
      { from: "cause-2", to: "effect-2" },
    ],
  },
} satisfies Extract<SceneSpec, { template: "cause-effect" }>);

export const maximumDensityCauseEffectFixture = Object.freeze({
  ...branchingCauseEffectFixture,
  title: "T".repeat(160),
  visual: {
    causes: Array.from({ length: 3 }, (_, index) => ({
      id: `cause-${index + 1}`,
      label: "C".repeat(36),
    })),
    mechanism: { id: "mechanism", label: "M".repeat(36) },
    effects: Array.from({ length: 3 }, (_, index) => ({
      id: `effect-${index + 1}`,
      label: "E".repeat(36),
    })),
    connections: [
      { from: "cause-1", to: "mechanism" },
      { from: "cause-2", to: "mechanism" },
      { from: "cause-3", to: "mechanism" },
      { from: "mechanism", to: "effect-1" },
      { from: "mechanism", to: "effect-2" },
      { from: "mechanism", to: "effect-3" },
    ],
  },
} satisfies Extract<SceneSpec, { template: "cause-effect" }>);
