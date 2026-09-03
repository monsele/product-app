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

/** Nine-step linear process expressed as a graph (ST-087). */
export const nineStepProcessGraphFixture = Object.freeze({
  ...createDefaultScene("process"),
  title: "Nine stages of the rock cycle",
  narration:
    "Magma cools and crystallises into igneous rock. Weathering breaks it into sediment. " +
    "The sediment is transported downstream. It is deposited in layers. " +
    "Compaction squeezes the layers together. Cementation binds them into sedimentary rock. " +
    "Heat and pressure transform it into metamorphic rock. Deeper burial melts it back to magma. " +
    "The cycle then begins again.",
  durationSeconds: 30,
  visual: {
    nodes: [
      { id: "magma", label: "Magma" },
      { id: "igneous", label: "Igneous rock" },
      { id: "sediment", label: "Sediment" },
      { id: "transport", label: "Transported downstream" },
      { id: "deposition", label: "Deposited in layers" },
      { id: "compaction", label: "Compaction" },
      { id: "sedimentary", label: "Sedimentary rock" },
      { id: "metamorphic", label: "Metamorphic rock" },
      { id: "remelt", label: "Re-melts to magma" },
    ],
    edges: [
      { id: "e1", from: "magma", to: "igneous" },
      { id: "e2", from: "igneous", to: "sediment" },
      { id: "e3", from: "sediment", to: "transport" },
      { id: "e4", from: "transport", to: "deposition" },
      { id: "e5", from: "deposition", to: "compaction" },
      { id: "e6", from: "compaction", to: "sedimentary" },
      { id: "e7", from: "sedimentary", to: "metamorphic" },
      { id: "e8", from: "metamorphic", to: "remelt" },
      { id: "e9", from: "remelt", to: "magma" },
    ],
  },
} satisfies Extract<SceneSpec, { template: "process" }>);

/** Branching process graph: one step fans out to two parallel paths. */
export const branchingProcessGraphFixture = Object.freeze({
  ...createDefaultScene("process"),
  title: "Splitting a workflow",
  narration:
    "Collect the raw data first. Then clean it. Cleaning feeds two checks at once: " +
    "a validation pass and a coverage pass. Both feed the final report.",
  durationSeconds: 20,
  visual: {
    nodes: [
      { id: "collect", label: "Collect data" },
      { id: "clean", label: "Clean data" },
      { id: "validate", label: "Validation pass" },
      { id: "coverage", label: "Coverage pass" },
      { id: "report", label: "Final report" },
    ],
    edges: [
      { id: "e1", from: "collect", to: "clean" },
      { id: "e2", from: "clean", to: "validate" },
      { id: "e3", from: "clean", to: "coverage" },
      { id: "e4", from: "validate", to: "report" },
      { id: "e5", from: "coverage", to: "report" },
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
