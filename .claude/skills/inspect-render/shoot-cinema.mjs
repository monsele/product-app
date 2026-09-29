// Renders v2 (ADR-015 "cinema") compositions at the real 1920x1080 canvas for
// every identity x scene fixture x eligible composition, screenshots them, and
// reports boxes whose content escapes, text below the caption line, text
// overlapping other text, text off-canvas and pictures that did not paint.
// Run from the repo root after `pnpm --filter @avlp/scene-library build`.
//
//   node .claude/skills/inspect-render/shoot-cinema.mjs [--out dir] [--only <template>]
//        [--pack <id>] [--shots all|review|none] [--progress 1] [--min-font 24]
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const sceneLibrary = path.join(repoRoot, "packages/scene-library");
const fromSceneLibrary = createRequire(path.join(sceneLibrary, "package.json"));
const { createElement } = fromSceneLibrary("react");
const { renderToStaticMarkup } = fromSceneLibrary("react-dom/server");
const { chromium } = fromSceneLibrary("@playwright/test");
const { PNG } = fromSceneLibrary("pngjs");
const lib = await import(pathToFileURL(path.join(sceneLibrary, "dist/index.js")).href);
const schemas = await import(
  pathToFileURL(path.join(repoRoot, "packages/schemas/dist/index.js")).href
);

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i];
  if (!token.startsWith("--")) continue;
  const next = process.argv[i + 1];
  args.set(token.slice(2), next && !next.startsWith("--") ? next : "true");
}
const outDir = path.resolve(repoRoot, args.get("out") ?? ".runtime-logs/cinema-shots");
const shots = args.get("shots") ?? "review";
const only = args.get("only");
const onlyPack = args.get("pack");
/** Fraction of the scene at which to capture: 1 = every beat has landed. */
const progressAt = Number(args.get("progress") ?? 1);
const captionSafeTop = 876;
// Full-screen landscape on a phone (~844 CSS px) shows the canvas at ~0.44x,
// so 24px here is ~10.5px there: the floor. Normal content sits at 26px+;
// smallest-text.tsv lists each shot's smallest text for review.
const minPhoneFont = Number(args.get("min-font") ?? 24);

// ---- Pinned fonts as data URIs, so measurement uses the real faces. -------
const fontDir = path.join(sceneLibrary, "node_modules/@fontsource");
const faces = [
  ["Inter", "inter", [400, 600, 700]],
  ["Source Serif 4", "source-serif-4", [400, 600, 700]],
  ["Nunito", "nunito", [400, 700]],
  ["Atkinson Hyperlegible", "atkinson-hyperlegible", [400, 700]],
];
const fontCss = faces
  .flatMap(([family, dir, weights]) =>
    weights.map((weight) => {
      const file = path.join(fontDir, dir, "files", `${dir}-latin-${weight}-normal.woff2`);
      const data = readFileSync(file).toString("base64");
      return `@font-face{font-family:"${family}";font-weight:${weight};font-style:normal;src:url(data:font/woff2;base64,${data}) format("woff2");}`;
    }),
  )
  .join("\n");

// ---- A real, non-square illustration so image framing is exercised. -------
function illustration(width, height, hue) {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const index = (width * y + x) << 2;
      const dx = x - width / 2;
      const dy = y - height / 2;
      const inside = dx * dx + dy * dy < (Math.min(width, height) * 0.36) ** 2;
      const stripe = Math.floor((x + y) / 24) % 2 === 0;
      png.data[index] = inside ? (stripe ? hue : 250) : 252;
      png.data[index + 1] = inside ? 140 : 250;
      png.data[index + 2] = inside ? (stripe ? 90 : 200) : 246;
      png.data[index + 3] = 255;
    }
  return `data:image/png;base64,${PNG.sync.write(png).toString("base64")}`;
}
const heroSrc = illustration(640, 480, 60);
const iconSrc = illustration(160, 160, 200);

// ---- Scene fixtures: every exported v1 fixture plus a dense lesson. ---------
const scenes = [];
for (const [name, value] of Object.entries(lib)) {
  if (!name.endsWith("Fixture") && !name.endsWith("Fixtures")) continue;
  if (typeof value !== "object" || value === null || typeof value.template !== "string") continue;
  const parsed = schemas.sceneSpecSchema.safeParse(value);
  if (parsed.success) scenes.push({ label: name, scene: parsed.data });
}
for (const [index, scene] of lib.photosynthesisThreeMinuteLesson.scenes.entries())
  scenes.push({ label: `photosynthesis${index + 1}`, scene });
const filtered = scenes.filter(({ scene }) => only === undefined || scene.template === only);

const packs = schemas.creativeDesignPackIds.filter((id) => onlyPack === undefined || id === onlyPack);

// Start clean: a screenshot left by an earlier run misrepresents this build.
rmSync(outDir, { force: true, recursive: true });
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const fontLog = [];
let failed = 0;
let passed = 0;
const reviewed = new Set();

for (const packId of packs) {
  const settings = schemas.creativeDesignPackDefaultSettings[packId];
  const identity = lib.resolveCinemaIdentity(packId, settings);
  for (const { label, scene } of filtered) {
    const assets = {};
    for (const binding of scene.assetBindings)
      assets[binding.assetId] = {
        assetId: binding.assetId,
        altText: binding.altText ?? "Fixture asset",
        source: "source",
        src: iconSrc,
      };
    const heroId = "00000000-0000-7000-8000-00000000beef";
    assets[heroId] = { assetId: heroId, altText: "Illustration", source: "library", src: heroSrc };
    for (const composition of schemas.eligibleCinemaCompositions(scene)) {
      // Alternate pinned-picture and motif runs so both paths are exercised.
      const withHero = (label.length + composition.id.length) % 2 === 0;
      const manifest = schemas.planCinemaDesign({
        packId,
        scenes: [scene],
        seed: "0123456789abcdef",
        locks: { [scene.id]: composition.id },
        imagery: withHero
          ? { [scene.id]: { assetId: heroId, origin: "generated", altText: "Illustration" } }
          : {},
      });
      const design = manifest.scenes[scene.id];
      const durationInFrames = scene.durationSeconds * 30;
      const frames = schemas.resolveCinemaBeatFrames({
        beats: design.beats,
        narration: scene.narration,
        cues: [],
        durationInFrames,
      });
      const frame = Math.round(Math.max(...frames, 0) + 40 + (durationInFrames - Math.max(...frames, 0) - 40) * (progressAt - 1));
      const timeline = lib.createBeatTimeline({ beats: design.beats, frames, frame, durationInFrames, energy: "balanced" });
      const name = `${packId}__${composition.id}__${label}`;
      let markup;
      try {
        const props = {
          scene,
          design,
          identity,
          hero: lib.resolveCinemaHero({ scene, design, assets, mode: "render" }),
          itemIcons: lib.resolveCinemaItemIcons({ scene, assets, mode: "render" }),
          sequenceIcons: lib.resolveCinemaItemIcons({ scene, assets, mode: "render", forSequence: true }),
          subjects: lib.resolveCinemaSubjectImages({ scene, assets, mode: "render" }),
        };
        const Composition = lib.cinemaCompositionComponents[composition.id];
        markup = renderToStaticMarkup(
          createElement(
            "div",
            {
              "data-cinema-root": true,
              style: { background: identity.colors.background, color: identity.colors.text, height: 1080, overflow: "hidden", position: "relative", width: 1920 },
            },
            createElement(lib.CinemaBeatProvider, { timeline }, createElement(Composition, props)),
          ),
        );
      } catch (error) {
        failed += 1;
        console.log(`THROW ${name} — ${error.message}`);
        continue;
      }
      await page.setContent(
        `<!doctype html><html><head><style>${fontCss}</style></head><body style="margin:0;width:1920px;height:1080px">${markup}</body></html>`,
      );
      await page.evaluate(() => document.fonts.ready);
      const report = await page.locator("[data-cinema-root]").evaluate((root, safeTop) => {
        const describe = (element) => {
          const marker = Array.from(element.attributes).map((a) => a.name).find((n) => n.startsWith("data-"));
          const text = (element.textContent ?? "").trim().slice(0, 28);
          return `${element.tagName.toLowerCase()}${marker ? `[${marker}]` : ""}${text ? ` "${text}"` : ""}`;
        };
        const spilling = [];
        const belowCaption = [];
        const offCanvas = [];
        const texts = [];
        const brokenWords = [];
        for (const element of root.querySelectorAll("*")) {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) continue;
          let visible = true;
          for (let node = element; node !== null && node !== root.parentElement; node = node.parentElement)
            if (Number(getComputedStyle(node).opacity) === 0) visible = false;
          if (!visible) continue;
          const isBox =
            parseFloat(style.borderTopWidth) > 0 ||
            (style.backgroundColor !== "rgba(0, 0, 0, 0)" && style.backgroundColor !== "transparent");
          if (
            isBox &&
            element.tagName !== "IMG" &&
            style.overflow === "visible" &&
            (element.scrollHeight > Math.ceil(rect.height) + 2 || element.scrollWidth > Math.ceil(rect.width) + 2)
          )
            spilling.push(`${describe(element)} ${Math.round(rect.height)}px/${element.scrollHeight}px`);
          const hasText = Array.from(element.childNodes).some(
            (node) => node.nodeType === 3 && node.textContent.trim().length > 0,
          );
          if (hasText) {
            const range = document.createRange();
            range.selectNodeContents(element);
            const box = range.getBoundingClientRect();
            if (box.bottom > safeTop) belowCaption.push(describe(element));
            if (box.right > 1920 || box.left < 0 || box.top < 0) offCanvas.push(describe(element));
            texts.push({ box, label: describe(element), element, fontSize: parseFloat(style.fontSize) });
            // A word wrapped mid-word (overflow-wrap: anywhere) means the fit
            // estimate was wrong for this face.
            for (const node of element.childNodes) {
              if (node.nodeType !== 3) continue;
              for (const match of node.textContent.matchAll(/[^\s-]+/gu)) {
                const word = document.createRange();
                word.setStart(node, match.index);
                word.setEnd(node, match.index + match[0].length);
                const lines = new Set(Array.from(word.getClientRects()).map((r) => Math.round(r.top)));
                if (lines.size > 1 && match[0].length < 26) brokenWords.push(`"${match[0]}" in ${describe(element)}`);
              }
            }
          }
        }
        const overlaps = [];
        for (let a = 0; a < texts.length; a += 1)
          for (let b = a + 1; b < texts.length; b += 1) {
            const one = texts[a];
            const two = texts[b];
            if (one.element.contains(two.element) || two.element.contains(one.element)) continue;
            // Inline runs of one paragraph (emphasised words) share a block;
            // their glyph boxes legitimately touch across tight line heights.
            const block = (element) => {
              let current = element;
              while (current && getComputedStyle(current).display.startsWith("inline")) current = current.parentElement;
              return current;
            };
            if (block(one.element) === block(two.element)) continue;
            const w = Math.min(one.box.right, two.box.right) - Math.max(one.box.left, two.box.left);
            const h = Math.min(one.box.bottom, two.box.bottom) - Math.max(one.box.top, two.box.top);
            if (w > 6 && h > 6) overlaps.push(`${one.label} x ${two.label}`);
          }
        const images = Array.from(root.querySelectorAll("img"));
        const smallest = texts.reduce((min, text) => (min === null || text.fontSize < min.fontSize ? text : min), null);
        return {
          smallest: smallest === null ? null : { fontSize: smallest.fontSize, label: smallest.label },
          spilling: spilling.slice(0, 6),
          belowCaption: [...new Set(belowCaption)].slice(0, 6),
          offCanvas: [...new Set(offCanvas)].slice(0, 6),
          overlaps: overlaps.slice(0, 6),
          brokenWords: [...new Set(brokenWords)].slice(0, 4),
          imagesBroken: images.filter((img) => img.complete && img.naturalWidth === 0).length,
          imagesTotal: images.length,
          glyphs: /[●◉◎]/u.test(root.textContent ?? ""),
        };
      }, captionSafeTop);
      const problems = [];
      if (report.spilling.length > 0) problems.push(`content escapes its box: ${report.spilling.join("; ")}`);
      if (report.belowCaption.length > 0) problems.push(`below caption line: ${report.belowCaption.join("; ")}`);
      if (report.offCanvas.length > 0) problems.push(`off canvas: ${report.offCanvas.join("; ")}`);
      if (report.overlaps.length > 0) problems.push(`text overlaps: ${report.overlaps.join("; ")}`);
      if (report.imagesBroken > 0) problems.push(`${report.imagesBroken} broken <img>`);
      if (report.glyphs) problems.push("placeholder glyph rendered");
      if (report.brokenWords.length > 0) problems.push(`word broken across lines: ${report.brokenWords.join("; ")}`);
      if (report.smallest !== null && report.smallest.fontSize < minPhoneFont)
        problems.push(`text too small for phone playback: ${report.smallest.fontSize}px ${report.smallest.label}`);
      if (report.smallest !== null) fontLog.push(`${report.smallest.fontSize}\t${name}\t${report.smallest.label}`);
      const reviewKey = `${packId}:${composition.id}:${scene.template}`;
      const save = shots === "all" || problems.length > 0 || (shots === "review" && !reviewed.has(reviewKey));
      if (save) {
        reviewed.add(reviewKey);
        writeFileSync(path.join(outDir, `${name}.png`), await page.screenshot({ scale: "css" }));
      }
      if (problems.length > 0) {
        failed += 1;
        console.log(`FAIL ${name}\n     ${problems.join("\n     ")}`);
      } else passed += 1;
    }
  }
}
await browser.close();
writeFileSync(path.join(outDir, "smallest-text.tsv"), fontLog.sort((a, b) => parseFloat(a) - parseFloat(b)).join("\n"));
console.log(`\n${passed} pass / ${failed} fail. Screenshots in ${path.relative(repoRoot, outDir)} — look at them.`);
process.exit(failed === 0 ? 0 : 1);
