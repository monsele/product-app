import type { SceneSpec } from "@avlp/schemas";
import {
  createDefaultScene,
  type ResolvedSceneAsset,
} from "./scene-registry.js";

const fixturePng =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

export const assetDiagramFixture = Object.freeze({
  ...createDefaultScene("labelled-diagram"),
  title: "Parts of a plant cell",
  assetBindings: [
    {
      altText: "Approved source illustration of a plant cell",
      assetId: "00000000-0000-7000-8000-000000000008",
      role: "diagram",
      slot: "diagram",
    },
  ],
  visual: {
    baseAssetSlot: "diagram",
    kind: "asset",
    labels: [
      { anchor: "top-left", id: "cell-wall", text: "Cell wall" },
      { anchor: "top-right", id: "chloroplast", text: "Chloroplast" },
      { anchor: "right", id: "vacuole", text: "Central vacuole" },
      { anchor: "bottom-left", id: "nucleus", text: "Nucleus" },
    ],
  },
} satisfies Extract<SceneSpec, { template: "labelled-diagram" }>);

export const sourceDiagramFixture = Object.freeze({
  ...assetDiagramFixture,
  assetBindings: [
    {
      altText: "Source figure of a plant cell",
      assetId: "00000000-0000-7000-8000-000000000009",
      role: "diagram" as const,
      slot: "diagram",
    },
  ],
} satisfies Extract<SceneSpec, { template: "labelled-diagram" }>);

export const resolvedDiagramAssets = Object.freeze({
  "00000000-0000-7000-8000-000000000008": {
    altText: "Approved library illustration of a plant cell",
    assetId: "00000000-0000-7000-8000-000000000008",
    source: "library",
    src: fixturePng,
  },
  "00000000-0000-7000-8000-000000000009": {
    altText: "Source figure of a plant cell",
    assetId: "00000000-0000-7000-8000-000000000009",
    source: "source",
    src: fixturePng,
  },
} satisfies Readonly<Record<string, ResolvedSceneAsset>>);

export const shapesDiagramFixture = Object.freeze({
  ...createDefaultScene("labelled-diagram"),
  title: "A simple water cycle",
  visual: {
    kind: "shapes",
    labels: [
      { anchor: "top", id: "condensation", text: "Condensation" },
      { anchor: "right", id: "precipitation", text: "Precipitation" },
      { anchor: "bottom", id: "collection", text: "Collection" },
      { anchor: "left", id: "evaporation", text: "Evaporation" },
    ],
    shape: "cycle",
  },
} satisfies Extract<SceneSpec, { template: "labelled-diagram" }>);

export const maximumLabelDiagramFixture = Object.freeze({
  ...assetDiagramFixture,
  visual: {
    ...assetDiagramFixture.visual,
    labels: [
      { anchor: "top-left", id: "one", text: "One" },
      { anchor: "top", id: "two", text: "Two" },
      { anchor: "top-right", id: "three", text: "Three" },
      { anchor: "right", id: "four", text: "Four" },
      { anchor: "bottom-right", id: "five", text: "Five" },
      { anchor: "bottom-left", id: "six", text: "Six" },
    ],
  },
} satisfies Extract<SceneSpec, { template: "labelled-diagram" }>);
