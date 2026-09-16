import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SceneSpec, SourceTableVisual } from "@avlp/schemas";
import {
  createDefaultScene,
  resolveSafeTableVisual,
  type ResolvedSceneAsset,
} from "./scene-registry.js";
import { LabelledDiagramSceneFrame } from "./labelled-diagram-scene.js";

const tableAssetId = "00000000-0000-7000-8000-000000000700";

function tableScene(): Extract<SceneSpec, { template: "labelled-diagram" }> {
  return {
    ...createDefaultScene("labelled-diagram"),
    title: "Group 1 elements",
    assetBindings: [
      { assetId: tableAssetId, role: "diagram", slot: "diagram" },
    ],
    visual: {
      baseAssetSlot: "diagram",
      kind: "asset",
      labels: [{ anchor: "top", id: "note", text: "Alkali metals" }],
    },
  };
}

function resolvedTableAsset(
  overrides: Partial<SourceTableVisual> = {},
): Readonly<Record<string, ResolvedSceneAsset>> {
  return {
    [tableAssetId]: {
      altText: "Table: Element, Symbol",
      assetId: tableAssetId,
      source: "source_table",
      table: {
        tableId: "019ffbf1-eeee-7000-8000-000000000701",
        columns: ["Element", "Symbol"],
        rows: [
          ["Lithium", "Li"],
          ["Sodium", "Na"],
        ],
        rowCount: 2,
        truncated: false,
        ...overrides,
      },
    },
  };
}

describe("resolveSafeTableVisual", () => {
  it("resolves a well-formed source_table asset", () => {
    const resolved = resolveSafeTableVisual(
      tableAssetId,
      resolvedTableAsset(),
    );
    expect(resolved?.table?.columns).toEqual(["Element", "Symbol"]);
  });

  it("does not resolve an image asset through the table gate", () => {
    const resolved = resolveSafeTableVisual(tableAssetId, {
      [tableAssetId]: {
        altText: "A figure",
        assetId: tableAssetId,
        source: "source",
        src: "https://example.test/figure.png",
      },
    });
    expect(resolved).toBeUndefined();
  });

  it("does not resolve when the assetId does not match the lookup key", () => {
    const resolved = resolveSafeTableVisual("mismatched-id", resolvedTableAsset());
    expect(resolved).toBeUndefined();
  });

  it("does not resolve when no assetId is given", () => {
    expect(resolveSafeTableVisual(undefined, resolvedTableAsset())).toBeUndefined();
  });
});

describe("deterministic source-table rendering", () => {
  it("renders the same markup for identical input across preview and render", () => {
    const scene = tableScene();
    const resolvedAssets = resolvedTableAsset();
    const previewMarkup = renderToStaticMarkup(
      createElement(LabelledDiagramSceneFrame, {
        frame: 60,
        resolvedAssets,
        runtimeMode: "preview",
        scene,
      }),
    );
    const renderMarkup = renderToStaticMarkup(
      createElement(LabelledDiagramSceneFrame, {
        frame: 60,
        resolvedAssets,
        runtimeMode: "render",
        scene,
      }),
    );
    expect(renderMarkup).toBe(previewMarkup);
    expect(previewMarkup).toContain('data-source-table-id');
    expect(previewMarkup).toContain("Lithium");
    expect(previewMarkup).toContain("Element");
  });

  it("shows a truncation notice when the source table exceeds the display bound", () => {
    const markup = renderToStaticMarkup(
      createElement(LabelledDiagramSceneFrame, {
        frame: 60,
        resolvedAssets: resolvedTableAsset({ rowCount: 40, truncated: true }),
        scene: tableScene(),
      }),
    );
    expect(markup).toContain("Showing 2 of 40 rows.");
  });

  it("shows a generic notice when only columns or cell text were truncated, not rows", () => {
    const markup = renderToStaticMarkup(
      createElement(LabelledDiagramSceneFrame, {
        frame: 60,
        resolvedAssets: resolvedTableAsset({ rowCount: 2, truncated: true }),
        scene: tableScene(),
      }),
    );
    expect(markup).toContain(
      "Some table columns or cell text are not shown due to display limits.",
    );
    expect(markup).not.toContain("Showing 2 of 2 rows.");
  });

  it("renders an empty table without throwing", () => {
    const markup = renderToStaticMarkup(
      createElement(LabelledDiagramSceneFrame, {
        frame: 60,
        resolvedAssets: resolvedTableAsset({ rows: [], rowCount: 0 }),
        scene: tableScene(),
      }),
    );
    expect(markup).toContain("Element");
  });

  it("escapes cell text rather than interpreting it as markup", () => {
    const markup = renderToStaticMarkup(
      createElement(LabelledDiagramSceneFrame, {
        frame: 60,
        resolvedAssets: resolvedTableAsset({
          rows: [["<img src=x onerror=alert(1)>", "Na"]],
        }),
        scene: tableScene(),
      }),
    );
    expect(markup).not.toContain("<img src=x onerror=alert(1)>");
    expect(markup).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("throws on render when the table asset does not resolve", () => {
    expect(() =>
      renderToStaticMarkup(
        createElement(LabelledDiagramSceneFrame, {
          frame: 60,
          resolvedAssets: {},
          runtimeMode: "render",
          scene: tableScene(),
        }),
      ),
    ).toThrow("Labelled diagram render requires a resolved diagram asset.");
  });
});
