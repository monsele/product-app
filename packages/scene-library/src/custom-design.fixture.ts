/** Test-only manual systems, with identical educational content. No provider calls. */
import {
  compileCustomDesign,
  designSystemContentHash,
  type CustomPresentation,
  type SceneSpec,
} from "@avlp/schemas";
import { photosynthesisThreeMinuteLesson } from "./full-lesson.fixture.js";
import { shapesDiagramFixture } from "./labelled-diagram-scene.fixtures.js";

export const customFixtureFontId = "00000000-0000-7000-8000-000000000901";
export const customFixtureScenes: SceneSpec[] = [
  ...photosynthesisThreeMinuteLesson.scenes.slice(0, 2),
  {
    ...shapesDiagramFixture,
    id: "00000000-0000-7000-8000-000000000903",
    order: 3,
    narration:
      "Water evaporates and condenses into clouds. It falls as precipitation and collects again.",
  },
].map((scene) => ({ ...scene, durationSeconds: 10, transition: "cut" }));
export function customFixtureManifest(
  style: "journal" | "signal",
  fontHash: string,
) {
  const presentation: CustomPresentation = {
    colors:
      style === "journal"
        ? {
            background: "#fbf8f3",
            surface: "#ffffff",
            text: "#172033",
            accent: "#843b1f",
            diagramEmphasis: "#2563eb",
          }
        : {
            background: "#10182d",
            surface: "#1e293b",
            text: "#f8fafc",
            accent: "#38bdf8",
            diagramEmphasis: "#22d3ee",
          },
    fonts: { heading: customFixtureFontId, body: customFixtureFontId },
    logoAssetId: null,
    alignment: style === "journal" ? "left" : "center",
    density: style === "journal" ? "spacious" : "compact",
    emphasis: style === "journal" ? "text" : "image",
    arrangement: style === "journal" ? "stacked" : "split",
    imageFrame: style === "journal" ? "paper" : "rounded",
    stroke: style === "journal" ? "fine" : "bold",
    corners: style === "journal" ? "square" : "rounded",
    motion: {
      family: style === "journal" ? "fade" : "settle",
      prohibited: style === "journal" ? ["settle"] : ["fade"],
      intensity: style === "journal" ? "calm" : "lively",
      staggerFrames: style === "journal" ? 0 : 6,
      holdFrames: 36,
    },
  };
  const snapshot = {
    schemaVersion: "1.0",
    name: style,
    definition: {
      schemaVersion: "1.1",
      philosophy: "Native diagrams first",
      rules: [],
      assetIds: [customFixtureFontId],
      presentation,
    },
    assets: [
      {
        id: customFixtureFontId,
        kind: "font",
        mediaType: "font/otf",
        sha256: fontHash,
        inspection: {
          characterSet: Array.from({ length: 224 }, (_, i) => i + 32),
        },
      },
    ],
  };
  return compileCustomDesign({
    systemId: customFixtureFontId,
    versionId: customFixtureFontId,
    contentHash: designSystemContentHash(snapshot),
    snapshot,
    scenes: customFixtureScenes,
  });
}
