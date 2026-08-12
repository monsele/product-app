import type { SceneSpec } from "@avlp/schemas";
import { createDefaultScene } from "./scene-registry.js";

export const photosynthesisIpoFixture = Object.freeze({
  ...createDefaultScene("input-process-output"),
  title: "Photosynthesis",
  visual: {
    inputs: [
      { label: "Sunlight" },
      { label: "Water" },
      { label: "Carbon dioxide" },
    ],
    process: { label: "Plant makes food", assetSlot: "process-icon" },
    outputs: [{ label: "Glucose" }, { label: "Oxygen" }],
  },
  assetBindings: [
    {
      assetId: "00000000-0000-7000-8000-000000000004",
      role: "icon",
      slot: "process-icon",
      altText: "Leaf icon",
    },
  ],
} satisfies Extract<SceneSpec, { template: "input-process-output" }>);

export const genericIpoFixture = Object.freeze({
  ...createDefaultScene("input-process-output"),
  title: "A recycling system",
  visual: {
    inputs: [{ label: "Used paper" }],
    process: { label: "Sort and recycle" },
    outputs: [{ label: "New paper" }],
  },
} satisfies Extract<SceneSpec, { template: "input-process-output" }>);

export const maximumDensityIpoFixture = Object.freeze({
  ...photosynthesisIpoFixture,
  visual: {
    inputs: [
      "Raw material one",
      "Raw material two",
      "Raw material three",
      "Raw material four",
    ].map((label) => ({ label })),
    process: { label: "Transform materials into a useful result" },
    outputs: [
      "Product one",
      "Product two",
      "Product three",
      "Product four",
    ].map((label) => ({ label })),
  },
} satisfies Extract<SceneSpec, { template: "input-process-output" }>);

export const asymmetricIpoFixture = Object.freeze({
  ...maximumDensityIpoFixture,
  visual: {
    inputs: maximumDensityIpoFixture.visual.inputs,
    process: { label: "Combine the materials" },
    outputs: [{ label: "One finished product" }],
  },
} satisfies Extract<SceneSpec, { template: "input-process-output" }>);
