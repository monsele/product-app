import { describe, expect, it } from "vitest";
import { sceneAssetSlotRequirement } from "@avlp/schemas";
import {
  approvedAssetCatalog,
  searchApprovedAssets,
} from "./approved-assets.js";

describe("approved asset catalog", () => {
  it("filters catalog results by compatible scene slot and tag", () => {
    const icons = searchApprovedAssets({
      template: "process",
      slot: "step-1-icon",
      tags: ["science"],
    });
    expect(icons.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "icon",
          staticLocation: expect.stringMatching(/\.svg$/),
        }),
      ]),
    );
    expect(
      icons.assets.every(
        (asset) => asset.kind === "icon" || asset.kind === "shape",
      ),
    ).toBe(true);
    expect(
      searchApprovedAssets({ template: "labelled-diagram", slot: "diagram" })
        .assets,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ aspectRatio: "landscape" }),
      ]),
    );
    expect(
      sceneAssetSlotRequirement("summary", "central-visual")?.bindingRole,
    ).toBe("illustration");
    expect(
      sceneAssetSlotRequirement("labelled-diagram", "diagram")?.required,
    ).toBe(true);
  });

  it("keeps complete, immutable licence metadata on every catalog asset", () => {
    expect(approvedAssetCatalog).toHaveLength(5);
    for (const asset of approvedAssetCatalog) {
      expect(asset.license).toBe("CC0-1.0");
      expect(asset.source).toContain("original asset");
      expect(asset.usageConstraints.length).toBeGreaterThan(0);
      expect(asset.staticLocation).toMatch(/^\/catalog\/.+\.svg$/);
    }
  });
});
