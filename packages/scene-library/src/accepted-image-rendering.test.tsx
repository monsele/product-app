import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnalogySceneFrame } from "./analogy-scene.js";
import { sourcedAnalogyFixture } from "./analogy-scene.fixtures.js";
import { ComparisonSceneFrame } from "./comparison-scene.js";
import { imageAssistedComparisonFixture } from "./comparison-scene.fixtures.js";
import { HookSceneFrame } from "./hook-scene.js";
import { validHookFixture } from "./hook-scene.fixtures.js";

const assets = {
  "00000000-0000-7000-8000-000000000006": {
    altText: "Plant cell illustration",
    assetId: "00000000-0000-7000-8000-000000000006",
    source: "source" as const,
    src: "https://example.test/plant-cell.png",
  },
  "00000000-0000-7000-8000-000000000007": {
    altText: "Animal cell illustration",
    assetId: "00000000-0000-7000-8000-000000000007",
    source: "source" as const,
    src: "https://example.test/animal-cell.png",
  },
  "00000000-0000-7000-8000-000000000008": {
    altText: "Circuit illustration",
    assetId: "00000000-0000-7000-8000-000000000008",
    source: "source" as const,
    src: "https://example.test/circuit.png",
  },
} as const;

describe("accepted image rendering", () => {
  it("uses resolved accepted images in hook, comparison, and analogy scenes", () => {
    const hook = {
      ...validHookFixture,
      assetBindings: [
        {
          altText: "Plant illustration",
          assetId: "00000000-0000-7000-8000-000000000006",
          role: "illustration" as const,
          slot: "subject",
        },
      ],
    };
    const analogy = {
      ...sourcedAnalogyFixture,
      assetBindings: [
        {
          altText: "Circuit illustration",
          assetId: "00000000-0000-7000-8000-000000000008",
          role: "illustration" as const,
          slot: "central-visual",
        },
      ],
    };

    expect(
      renderToStaticMarkup(
        createElement(HookSceneFrame, { frame: 30, resolvedAssets: assets, scene: hook }),
      ),
    ).toContain('src="https://example.test/plant-cell.png"');
    expect(
      renderToStaticMarkup(
        createElement(ComparisonSceneFrame, {
          frame: 30,
          resolvedAssets: assets,
          scene: imageAssistedComparisonFixture,
        }),
      ),
    ).toContain('src="https://example.test/animal-cell.png"');
    expect(
      renderToStaticMarkup(
        createElement(AnalogySceneFrame, { frame: 30, resolvedAssets: assets, scene: analogy }),
      ),
    ).toContain('src="https://example.test/circuit.png"');
  });
});
