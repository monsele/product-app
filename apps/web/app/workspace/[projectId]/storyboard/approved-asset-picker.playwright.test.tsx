import { chromium } from "@playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApprovedAssetPicker } from "./approved-asset-picker.js";

const asset = {
  id: "019ffbf1-a001-7000-8000-000000000001",
  kind: "icon" as const,
  subject: "science",
  tags: ["water", "science"],
  dimensions: { width: 128, height: 128 },
  aspectRatio: "square" as const,
  source: "AI Visual Learning Platform original asset",
  license: "CC0-1.0",
  usageConstraints: ["Approved for MVP lesson scenes."],
  staticLocation: "/catalog/water-drop.svg",
  mediaType: "image/svg+xml" as const,
};

describe("ApprovedAssetPicker", () => {
  it("renders a browser-accessible compatible selection with licence provenance", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(
        renderToStaticMarkup(
          createElement(ApprovedAssetPicker, {
            assets: [asset],
            disabled: false,
            onChange: () => {},
            onTagFilterChange: () => {},
            selectedId: asset.id,
            slot: "step-1-icon",
            tagFilter: "water",
          }),
        ),
      );
      expect(
        await page.getByLabel("Approved asset: step-1-icon").inputValue(),
      ).toBe(asset.id);
      expect(
        await page
          .getByLabel("Filter approved assets by tags: step-1-icon")
          .inputValue(),
      ).toBe("water");
      const provenance = await page
        .getByTestId("asset-provenance-step-1-icon")
        .textContent();
      expect(provenance).toContain("CC0-1.0");
      expect(provenance).toContain("original asset");
    } finally {
      await browser.close();
    }
  });
});
