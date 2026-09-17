// Renders scenes at the real 1920x1080 video canvas, screenshots them, and
// reports every element whose content escapes its own box or whose bound image
// failed to paint. See SKILL.md for usage.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const sceneLibrary = path.join(repoRoot, "packages/scene-library");
// Node resolves from the script's own directory, and .claude/ has no
// node_modules, so anchor each dependency at the workspace package that owns it.
const fromSceneLibrary = createRequire(path.join(sceneLibrary, "package.json"));
const fromStorage = createRequire(
  path.join(repoRoot, "packages/storage/package.json"),
);

const { createElement } = fromSceneLibrary("react");
const { renderToStaticMarkup } = fromSceneLibrary("react-dom/server");
const { chromium } = fromSceneLibrary("@playwright/test");

const lib = await import(
  pathToFileURL(path.join(sceneLibrary, "dist/index.js")).href
);

// Scene components call useCurrentFrame(), which needs a Remotion composition.
// The *SceneFrame exports take the frame as a plain prop instead, which is what
// makes a scene renderable outside Remotion at all.
const frameComponents = {
  hook: lib.HookSceneFrame,
  definition: lib.DefinitionSceneFrame,
  process: lib.ProcessSceneFrame,
  "input-process-output": lib.IpoSceneFrame,
  comparison: lib.ComparisonSceneFrame,
  "cause-effect": lib.CauseEffectSceneFrame,
  "labelled-diagram": lib.LabelledDiagramSceneFrame,
  analogy: lib.AnalogySceneFrame,
  "worked-example": lib.WorkedExampleSceneFrame,
  summary: lib.SummarySceneFrame,
};

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i];
  if (!token.startsWith("--")) continue;
  const next = process.argv[i + 1];
  args.set(token.slice(2), next && !next.startsWith("--") ? next : "true");
}

const outDir = path.resolve(
  repoRoot,
  args.get("out") ?? ".runtime-logs/scene-shots",
);
const frame = Number(args.get("frame") ?? 200);
const runtimeMode = args.get("mode") ?? "render";
// The caption strip starts here; scene content must stay above it.
const captionSafeTop = 876;

function psql(sql) {
  return execFileSync(
    "docker",
    [
      "exec",
      "product-app-postgres-1",
      "psql",
      "-U",
      "postgres",
      "-d",
      "visual_learning",
      "-tAc",
      sql,
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  ).trim();
}

/** Real scenes plus real signed MinIO URLs, exactly what the renderer sees. */
async function loadProject(projectId) {
  const rows = psql(
    `select s."order" || '' || s.scene_json::text from scenes s where s.project_id='${projectId}' order by s."order";`,
  );
  if (rows === "") throw new Error(`No scenes found for project ${projectId}.`);
  const scenes = rows.split("\n").map((line) => {
    const [order, json] = line.split("");
    return { label: `${order}-${JSON.parse(json).template}`, scene: JSON.parse(json) };
  });

  const assetRows = psql(
    `select id || '' || storage_key from project_assets where project_id='${projectId}' and status='active';`,
  );
  const resolvedAssets = {};
  if (assetRows !== "") {
    const { S3Client, GetObjectCommand } = fromStorage("@aws-sdk/client-s3");
    const { getSignedUrl } = fromStorage("@aws-sdk/s3-request-presigner");
    const env = Object.fromEntries(
      readFileSync(path.join(repoRoot, ".env"), "utf8")
        .split(/\r?\n/)
        .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
        .map((line) => [
          line.slice(0, line.indexOf("=")).trim(),
          line.slice(line.indexOf("=") + 1).trim(),
        ]),
    );
    const bucket = env.OBJECT_STORAGE_BUCKET;
    const s3 = new S3Client({
      region: env.OBJECT_STORAGE_REGION ?? "us-east-1",
      endpoint: env.OBJECT_STORAGE_ENDPOINT,
      forcePathStyle: env.OBJECT_STORAGE_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: env.OBJECT_STORAGE_ACCESS_KEY,
        secretAccessKey: env.OBJECT_STORAGE_SECRET_KEY,
      },
    });
    for (const line of assetRows.split("\n")) {
      const [id, key] = line.split("");
      resolvedAssets[id] = {
        assetId: id,
        altText: `Asset ${id}`,
        source: "source",
        src: await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: bucket, Key: key }),
          { expiresIn: 3600 },
        ),
      };
    }
  }
  return { scenes, resolvedAssets };
}

function loadFixtures() {
  const png =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const scenes = [];
  const resolvedAssets = {};
  for (const [name, value] of Object.entries(lib)) {
    if (!name.endsWith("Fixture") && !name.endsWith("Fixtures")) continue;
    if (typeof value !== "object" || value === null) continue;
    if (typeof value.template !== "string") continue;
    if (frameComponents[value.template] === undefined) continue;
    for (const binding of value.assetBindings ?? [])
      resolvedAssets[binding.assetId] = {
        assetId: binding.assetId,
        altText: binding.altText ?? "Fixture asset",
        source: "source",
        src: png,
      };
    scenes.push({ label: `${value.template}-${name}`, scene: value });
  }
  return { scenes, resolvedAssets };
}

const source = args.has("project")
  ? await loadProject(args.get("project"))
  : args.has("scene-file")
    ? (() => {
        const scene = JSON.parse(
          readFileSync(path.resolve(repoRoot, args.get("scene-file")), "utf8"),
        );
        return { scenes: [{ label: scene.template, scene }], resolvedAssets: {} };
      })()
    : loadFixtures();

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
let failed = 0;

for (const { label, scene } of source.scenes) {
  const component = frameComponents[scene.template];
  if (component === undefined) {
    console.log(`SKIP ${label} — no frame component for "${scene.template}"`);
    continue;
  }
  let markup;
  try {
    markup = renderToStaticMarkup(
      createElement(component, {
        frame,
        resolvedAssets: source.resolvedAssets,
        runtimeMode,
        scene,
      }),
    );
  } catch (error) {
    failed += 1;
    console.log(`THROW ${label} — ${error.message}`);
    continue;
  }
  await page.setContent(
    `<!doctype html><html><body style="margin:0;width:1920px;height:1080px">${markup}</body></html>`,
  );
  await page.waitForLoadState("networkidle");

  const report = await page.locator("main").evaluate(
    (main, safeTop) => {
      const describe = (element) => {
        const marker = Array.from(element.attributes)
          .map((attribute) => attribute.name)
          .find((name) => name.startsWith("data-"));
        return `${element.tagName.toLowerCase()}${marker ? `[${marker}]` : ""}`;
      };
      // What the viewer actually sees: an element's own rect can extend far
      // past an ancestor that clips it, and reporting that raw rect produces
      // false alarms on any image sized with height:100%.
      const visibleRect = (element) => {
        let box = element.getBoundingClientRect();
        for (
          let parent = element.parentElement;
          parent !== null;
          parent = parent.parentElement
        ) {
          if (getComputedStyle(parent).overflow === "visible") continue;
          const clip = parent.getBoundingClientRect();
          box = {
            top: Math.max(box.top, clip.top),
            bottom: Math.min(box.bottom, clip.bottom),
            left: Math.max(box.left, clip.left),
            right: Math.min(box.right, clip.right),
          };
        }
        return box;
      };
      const spilling = [];
      const belowCaption = [];
      for (const element of main.querySelectorAll("*")) {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        // Only boxes with their own visible edge: a spill out of one of these
        // is what reads as broken on screen.
        const isBox =
          parseFloat(style.borderTopWidth) > 0 ||
          (style.backgroundColor !== "rgba(0, 0, 0, 0)" &&
            style.backgroundColor !== "transparent");
        if (
          isBox &&
          style.overflow === "visible" &&
          (element.scrollHeight > Math.ceil(rect.height) + 1 ||
            element.scrollWidth > Math.ceil(rect.width) + 1)
        )
          spilling.push({
            element: describe(element),
            box: Math.round(rect.height),
            content: element.scrollHeight,
          });
        if (element.childElementCount === 0) {
          const visible = visibleRect(element);
          if (visible.bottom > safeTop && visible.bottom > visible.top)
            belowCaption.push(describe(element));
        }
      }
      const images = Array.from(main.querySelectorAll("img"));
      return {
        spilling: spilling.slice(0, 10),
        belowCaption: [...new Set(belowCaption)].slice(0, 10),
        imagesPainted: images.filter((img) => img.naturalWidth > 0).length,
        imagesBroken: images.filter(
          (img) => img.complete && img.naturalWidth === 0,
        ).length,
        imagesTotal: images.length,
      };
    },
    captionSafeTop,
  );

  const bound = (scene.assetBindings ?? []).length;
  const unpainted = bound - report.imagesPainted;
  const problems = [];
  if (report.spilling.length > 0)
    problems.push(
      `content escapes its box: ${report.spilling
        .map((s) => `${s.element} ${s.box}px box / ${s.content}px content`)
        .join(", ")}`,
    );
  if (report.belowCaption.length > 0)
    problems.push(`below caption safe area: ${report.belowCaption.join(", ")}`);
  if (unpainted > 0)
    problems.push(`${unpainted} of ${bound} bound image(s) did not paint`);
  if (report.imagesBroken > 0)
    problems.push(`${report.imagesBroken} broken <img>`);

  const file = path.join(outDir, `${label}.png`);
  writeFileSync(file, await page.screenshot());
  if (problems.length > 0) {
    failed += 1;
    console.log(`FAIL ${label}\n     ${problems.join("\n     ")}`);
  } else {
    console.log(
      `PASS ${label} (${report.imagesPainted}/${bound} images painted)`,
    );
  }
}

await browser.close();
console.log(`\nScreenshots in ${path.relative(repoRoot, outDir)} — look at them.`);
process.exit(failed === 0 ? 0 : 1);
