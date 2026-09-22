// Renders the REAL, previously-broken labelled-diagram scene (project
// 01a0c303-c31b-7e9c-81c5-de42894e15c0, scene 3, "Tzedakah") through the same
// @remotion/renderer renderStill() path used by the production render
// pipeline (apps/renderer), to confirm the fix produces a correct final frame
// — not just a preview-widget screenshot.
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";

const browserExecutable = chromium.executablePath();

const OUT = ".runtime-logs";
mkdirSync(OUT, { recursive: true });

const scene = {
  id: "01a0c328-bc68-7db2-b2c6-72a85151f291",
  order: 3,
  title: "Tzedakah (T-Z-E-D-A-K-A-H)",
  visual: {
    kind: "asset",
    shape: "system",
    labels: [
      { id: "morality", text: "Personal morality — stand clean before God", anchor: "top" },
      { id: "justice", text: "Justice — fair and honest in every transaction", anchor: "bottom-left" },
      { id: "charity", text: "Charity — giving to the poor is justice, not optional", anchor: "bottom-right" },
    ],
    baseAssetSlot: "diagram",
  },
  template: "labelled-diagram",
  narration: "The Hebrew word for righteousness is Tzedakah.",
  sourceRefs: [
    {
      pageEnd: 5,
      blockIds: ["0eb3cd7f-a4f8-74fc-ada6-93b80ef39d92"],
      pageStart: 5,
      sectionId: "77f002e3-16b8-7403-bdbe-665c66cdeba8",
      documentId: "d36812b3-aea8-75f0-8180-3beee6a57974",
      parsedDocumentVersion: 249981195,
    },
  ],
  transition: "slide",
  onScreenText: [],
  assetBindings: [{ role: "diagram", slot: "diagram", assetId: "bc00c877-72f9-7433-844d-75826cf04efd" }],
  durationSeconds: 27,
  generatedAdditions: [],
};

const resolvedAssets = {
  "bc00c877-72f9-7433-844d-75826cf04efd": {
    assetId: "bc00c877-72f9-7433-844d-75826cf04efd",
    altText: "Table: Column 1, Column 2, Column 3",
    source: "source_table",
    table: {
      tableId: "bc00c877-72f9-7433-844d-75826cf04efd",
      columns: ["Column 1", "Column 2", "Column 3"],
      rows: [
        ["Pillar", "Diagnostic Evaluation Questions Spiritual / Practical Action Step", ""],
        ["Do I have a written plan for every income before it arrives? Am I tracking small daily leaks?", "Implement the 50/30/20 Rule using a physical ledger or digital tracking app. Check bank statements monthly.", "1. Budgeting"],
      ],
      rowCount: 6,
      truncated: true,
    },
  },
};

console.log("bundling…");
const serveUrl = await bundle({
  entryPoint: fileURLToPath(
    new URL("../packages/scene-library/dist/remotion-root.js", import.meta.url),
  ),
});

console.log("selecting composition…");
const composition = await selectComposition({
  browserExecutable,
  id: "SceneRuntimePreview",
  inputProps: { resolvedAssets, scene, runtimeMode: "render" },
  serveUrl,
});

console.log("rendering still at frame 90 (post-entrance)…");
const still = await renderStill({
  browserExecutable,
  composition,
  frame: 90,
  imageFormat: "png",
  inputProps: { resolvedAssets, scene, runtimeMode: "render" },
  serveUrl,
});

writeFileSync(`${OUT}/verify-5-real-render.png`, still.buffer);
console.log("wrote", `${OUT}/verify-5-real-render.png`, still.buffer.length, "bytes");
console.log("RESULT: RENDER SUCCEEDED");
