import { describe, expect, it } from "vitest";
import {
  compileCustomDesign,
  designSystemContentHash,
  designSystemDefinitionSchema,
  emptyDesignSystemDefinition,
} from "./design-systems.js";
import {
  customDesignManifestSchema,
  customPresentationSchema,
  type CustomPresentation,
} from "./custom-design.js";
import { createDefaultStoryboardSceneSpec } from "./index.js";

const id = "00000000-0000-7000-8000-000000000001";
const presentation: CustomPresentation = {
  colors: {
    background: "#ffffff",
    surface: "#ffffff",
    text: "#111111",
    accent: "#5b21b6",
    diagramEmphasis: "#2563eb",
  },
  fonts: { heading: id, body: id },
  logoAssetId: null,
  alignment: "left",
  density: "spacious",
  emphasis: "text",
  arrangement: "split",
  imageFrame: "none",
  stroke: "fine",
  corners: "square",
  motion: {
    family: "fade",
    prohibited: [],
    intensity: "calm",
    staggerFrames: 0,
    holdFrames: 36,
  },
};
const scene = createDefaultStoryboardSceneSpec("comparison", {
  id,
  order: 1,
  durationSeconds: 15,
});
const snapshot = {
  schemaVersion: "1.0",
  name: "An independent identity",
  definition: {
    schemaVersion: "1.1",
    philosophy: "Explain calmly",
    rules: [],
    assetIds: [id],
    presentation,
  },
  assets: [
    {
      id,
      kind: "font",
      mediaType: "font/otf",
      sha256: "a".repeat(64),
      inspection: {
        characterSet: Array.from({ length: 95 }, (_, i) => i + 32),
      },
    },
  ],
};
const compile = (value: unknown = snapshot) =>
  compileCustomDesign({
    systemId: id,
    versionId: id,
    contentHash: designSystemContentHash(value),
    snapshot: value,
    scenes: [scene],
  });

describe("ST-123 independent custom design contracts", () => {
  it("keeps legacy definitions unchanged and accepts exact controls only in 1.1", () => {
    expect(
      designSystemDefinitionSchema.parse(emptyDesignSystemDefinition),
    ).toEqual(emptyDesignSystemDefinition);
    expect(designSystemDefinitionSchema.parse(snapshot.definition)).toEqual(
      snapshot.definition,
    );
    expect(
      designSystemDefinitionSchema.safeParse({
        ...emptyDesignSystemDefinition,
        presentation,
      }).success,
    ).toBe(false);
  });
  it("rejects code, coordinates, low contrast and prohibited motion conflicts", () => {
    expect(
      customPresentationSchema.safeParse({ ...presentation, css: "body{}" })
        .success,
    ).toBe(false);
    expect(
      customPresentationSchema.safeParse({ ...presentation, x: 30 }).success,
    ).toBe(false);
    expect(
      customPresentationSchema.safeParse({
        ...presentation,
        colors: { ...presentation.colors, text: "#eeeeee" },
      }).success,
    ).toBe(false);
    expect(customPresentationSchema.safeParse({ ...presentation, colors: { ...presentation.colors, accent: "#ffffff" } }).success).toBe(false);
    expect(
      customPresentationSchema.safeParse({
        ...presentation,
        motion: { ...presentation.motion, prohibited: ["fade"] },
      }).success,
    ).toBe(false);
  });
  it("pins content, fonts, composition releases and beat timing without a preset", () => {
    const manifest = compile();
    expect(manifest).not.toHaveProperty("pack");
    expect(manifest.scenes[id]?.compositionId).toBe("comparison-split");
    expect(manifest.scenePins[id]?.contentHash).toBe(
      designSystemContentHash(scene),
    );
    expect(manifest.fonts[0]?.sha256).toBe("a".repeat(64));
    expect(compile()).toEqual(manifest);
    const changed = globalThis.structuredClone(snapshot);
    changed.definition.presentation.arrangement = "stacked";
    expect(compile(changed).scenes[id]?.compositionId).toBe(
      "comparison-stacked",
    );
    expect(designSystemContentHash(compile(changed))).not.toBe(
      designSystemContentHash(manifest),
    );
    expect(manifest.scenes[id]?.compositionId).toBe("comparison-split");
  });
  it("blocks missing font metadata and unsupported locks while preserving advice", () => {
    expect(() => compile({ ...snapshot, assets: [] })).toThrow(
      /font is missing/,
    );
    const rule = {
      id: "requirement",
      category: "motion",
      enforcement: "locked",
      origin: "supplied",
      instruction: "Use our private animation engine",
    };
    expect(() =>
      compile({
        ...snapshot,
        definition: { ...snapshot.definition, rules: [rule] },
      }),
    ).toThrow(/Resolve locked requirement/);
    expect(() =>
      compile({
        ...snapshot,
        definition: {
          ...snapshot.definition,
          rules: [{ ...rule, enforcement: "guidance" }],
        },
      }),
    ).not.toThrow();
  });
  it("rejects unpinned font references, edited snapshots and incomplete timing", () => {
    expect(
      designSystemDefinitionSchema.safeParse({
        ...snapshot.definition,
        assetIds: [],
      }).success,
    ).toBe(false);
    expect(() =>
      compileCustomDesign({
        systemId: id,
        versionId: id,
        contentHash: "b".repeat(64),
        snapshot,
        scenes: [scene],
      }),
    ).toThrow(/checksum/);
    const manifest = compile();
    expect(
      customDesignManifestSchema.safeParse({ ...manifest, scenePins: {} })
        .success,
    ).toBe(false);
  });
});
