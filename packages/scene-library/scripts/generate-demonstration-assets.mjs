/**
 * ST-095 — original artwork for the demonstration proof.
 *
 * Every asset here is drawn from scratch as SVG in this file. Nothing is
 * downloaded, traced from, or derived from third-party media, so the proof
 * carries no licensing question and the provenance line on each asset is
 * literally true.
 *
 * They are bundled as base64 `data:` URIs for the same reason ST-094 did it:
 * the browser preview, the server render and the Node tests then consume
 * byte-identical media with no path resolution and no static file server,
 * which is the precondition for a frame comparison to mean anything. This is
 * explicitly **not** a production pattern — production resolves media through
 * the tenant-scoped asset path.
 *
 * Regenerate with:
 *   pnpm --filter @avlp/scene-library run generate:demonstration-assets
 */

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const theme = {
  ink: "#102438",
  surface: "#203E56",
  primary: "#40DDD0",
  accent: "#FFC857",
  paper: "#F0F4F8",
  muted: "#D9E2EC",
};

/** A one-thousand-naira note face. Contain-fit, so it is never cropped. */
const coin = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" width="320" height="200" role="img">
  <rect x="4" y="4" width="312" height="192" rx="14" fill="${theme.accent}" stroke="${theme.ink}" stroke-width="6"/>
  <rect x="22" y="22" width="276" height="156" rx="8" fill="none" stroke="${theme.ink}" stroke-width="3" stroke-dasharray="10 7" opacity="0.55"/>
  <circle cx="74" cy="100" r="34" fill="${theme.paper}" stroke="${theme.ink}" stroke-width="4"/>
  <text x="74" y="114" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="700" text-anchor="middle" fill="${theme.ink}">&#8358;</text>
  <text x="192" y="92" font-family="Arial, Helvetica, sans-serif" font-size="52" font-weight="700" text-anchor="middle" fill="${theme.ink}">1,000</text>
  <text x="192" y="132" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="600" text-anchor="middle" fill="${theme.ink}" opacity="0.75">NAIRA</text>
</svg>`;

/**
 * An open jar the notes visibly rest inside.
 *
 * Wordless on purpose. It first carried the word SAVINGS, which then floated
 * out from behind the notes as a stray label once the tray filled — the region
 * already carries its own heading, so the artwork only needs to be a jar.
 */
const savingsJar = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 420" width="400" height="420" role="img">
  <rect x="88" y="34" width="224" height="34" rx="12" fill="${theme.muted}" stroke="${theme.ink}" stroke-width="5"/>
  <path d="M104 68 h192 a24 24 0 0 1 24 24 v268 a32 32 0 0 1 -32 32 h-176 a32 32 0 0 1 -32 -32 v-268 a24 24 0 0 1 24 -24 z"
        fill="${theme.primary}" fill-opacity="0.14" stroke="${theme.primary}" stroke-width="6"/>
  <path d="M132 96 v250" stroke="${theme.paper}" stroke-width="10" stroke-linecap="round" opacity="0.28"/>
</svg>`;

/** A glass of water at rest, seen from the side, with a visible surface line. */
const vessel = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 460" width="640" height="460" role="img">
  <rect x="40" y="392" width="560" height="14" rx="7" fill="${theme.surface}"/>
  <path d="M188 52 h264 l-30 330 a26 26 0 0 1 -26 24 h-152 a26 26 0 0 1 -26 -24 z"
        fill="${theme.paper}" fill-opacity="0.08" stroke="${theme.muted}" stroke-width="6"/>
  <path d="M206 168 h228 l-24 214 a26 26 0 0 1 -26 24 h-128 a26 26 0 0 1 -26 -24 z"
        fill="${theme.primary}" fill-opacity="0.34"/>
  <path d="M206 168 h228" stroke="${theme.primary}" stroke-width="7" stroke-linecap="round"/>
  <text x="320" y="440" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="600" text-anchor="middle" fill="${theme.muted}">Water at room temperature</text>
</svg>`;

/**
 * The magnified-view frame.
 *
 * A panel that the particle regions sit *inside*, rather than a lens drawn
 * over them. The first version was a circular magnifier laid across both
 * regions; rendering it showed the lens ring cutting through the particles and
 * its label landing on top of them, so the thing meant to say "this is a
 * model" was obscuring the model. A frame says the same thing without
 * competing with the content.
 *
 * It carries its own wording because the particle view must never be mistaken
 * for a photograph of real water, and a caption can scroll past while a frame
 * cannot.
 */
const magnifier = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1040 560" width="1040" height="560" role="img">
  <rect x="6" y="6" width="1028" height="548" rx="26" fill="none" stroke="${theme.muted}" stroke-width="5" stroke-dasharray="16 10" opacity="0.7"/>
  <rect x="34" y="-2" width="330" height="46" rx="14" fill="${theme.ink}" stroke="${theme.muted}" stroke-width="3"/>
  <text x="199" y="28" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="700" text-anchor="middle" fill="${theme.paper}">MAGNIFIED MODEL</text>
</svg>`;

const assets = [
  {
    assetId: "naira-note",
    altText:
      "A one thousand naira note drawn as a flat card, with a naira symbol and the value 1,000.",
    provenance:
      "Original SVG drawn for ST-095 in scripts/generate-demonstration-assets.mjs. No third-party media.",
    width: 320,
    height: 200,
    svg: coin,
  },
  {
    assetId: "savings-jar",
    altText:
      "An open jar drawn as an outline, so notes placed into it remain visible.",
    provenance:
      "Original SVG drawn for ST-095 in scripts/generate-demonstration-assets.mjs. No third-party media.",
    width: 400,
    height: 420,
    svg: savingsJar,
  },
  {
    assetId: "water-vessel",
    altText:
      "A glass of water standing on a table, seen from the side, with the water surface drawn as a clear line.",
    provenance:
      "Original SVG drawn for ST-095 in scripts/generate-demonstration-assets.mjs. No third-party media.",
    width: 640,
    height: 460,
    svg: vessel,
  },
  {
    assetId: "magnifier-frame",
    altText:
      "A dashed panel captioned MAGNIFIED MODEL, framing the particle view.",
    provenance:
      "Original SVG drawn for ST-095 in scripts/generate-demonstration-assets.mjs. No third-party media.",
    width: 1040,
    height: 560,
    svg: magnifier,
  },
];

const records = assets.map((asset) => {
  const bytes = Buffer.from(asset.svg, "utf8");
  return {
    assetId: asset.assetId,
    altText: asset.altText,
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    height: asset.height,
    provenance: asset.provenance,
    src: `data:image/svg+xml;base64,${bytes.toString("base64")}`,
    width: asset.width,
    bytes: bytes.length,
  };
});

const body = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Produced by \`scripts/generate-demonstration-assets.mjs\` (ST-095). Every
 * asset is original SVG authored in that script; none is third-party media.
 *
 * Regenerate with:
 *   pnpm --filter @avlp/scene-library run generate:demonstration-assets
 */

import type { DemonstrationAsset } from "@avlp/schemas/demonstration-proof";

export const demonstrationAssetLibrary: Readonly<
  Record<string, DemonstrationAsset>
> = Object.freeze({
${records
  .map(
    (record) => `  ${JSON.stringify(record.assetId)}: Object.freeze({
    altText: ${JSON.stringify(record.altText)},
    assetId: ${JSON.stringify(record.assetId)},
    checksumSha256: ${JSON.stringify(record.checksumSha256)},
    height: ${record.height},
    provenance: ${JSON.stringify(record.provenance)},
    src: ${JSON.stringify(record.src)},
    width: ${record.width},
  }),`,
  )
  .join("\n")}
});

/** Decoded byte length per asset, reported in the render measurements. */
export const demonstrationAssetBytes: Readonly<Record<string, number>> =
  Object.freeze({
${records.map((record) => `    ${JSON.stringify(record.assetId)}: ${record.bytes},`).join("\n")}
  });
`;

const outPath = fileURLToPath(
  new URL("../src/demonstration-proof/assets.generated.ts", import.meta.url),
);
writeFileSync(outPath, body, "utf8");
process.stdout.write(
  `Wrote ${records.length} assets (${records.reduce((sum, record) => sum + record.bytes, 0)} bytes) to ${outPath}\n`,
);
