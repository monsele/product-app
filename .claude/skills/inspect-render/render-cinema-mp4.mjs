// Renders the photosynthesis lesson as a v2 (ADR-015 "cinema") MP4 for one
// identity, with every scene stretched to 12 s and one synthetic caption cue
// per narration sentence, so beats can be checked against the sentence they
// anchor to. Run from the repo root after `pnpm --filter @avlp/scene-library build`,
// then cut it into frames with watch-video.mjs --file <mp4> --every 2.
//
//   node .claude/skills/inspect-render/render-cinema-mp4.mjs [--pack everyday] [--seconds 12]
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const sceneLibrary = path.join(repoRoot, "packages/scene-library");
const fromSceneLibrary = createRequire(path.join(sceneLibrary, "package.json"));
const { bundle } = fromSceneLibrary("@remotion/bundler");
const { renderMedia, selectComposition } = fromSceneLibrary("@remotion/renderer");
const { chromium } = fromSceneLibrary("@playwright/test");
const lib = await import(pathToFileURL(path.join(sceneLibrary, "dist/index.js")).href);
const fullLesson = await import(pathToFileURL(path.join(sceneLibrary, "dist/full-lesson.js")).href);
const { fullLessonRuntimeCompositionId } = await import(
  pathToFileURL(path.join(sceneLibrary, "dist/scene-preview-composition.js")).href
);
const schemas = await import(pathToFileURL(path.join(repoRoot, "packages/schemas/dist/index.js")).href);

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i];
  if (!token.startsWith("--")) continue;
  const next = process.argv[i + 1];
  args.set(token.slice(2), next && !next.startsWith("--") ? next : "true");
}
const packId = args.get("pack") ?? "everyday";
const seconds = Number(args.get("seconds") ?? 12);
const output = path.join(repoRoot, ".runtime-logs", `cinema-${packId}.mp4`);

const source = lib.photosynthesisThreeMinuteLesson;
const lesson = { ...source, scenes: source.scenes.map((scene) => ({ ...scene, durationSeconds: seconds })) };
const timeline = fullLesson.calculateLessonTimeline(lesson);

// One cue per sentence, sharing the scene's frames in proportion to length.
const captions = timeline.flatMap((segment, index) => {
  const sentences = lesson.scenes[index].narration.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  const total = sentences.reduce((sum, sentence) => sum + sentence.length, 0) || 1;
  const frames = segment.endFrameExclusive - segment.startFrame;
  let cursor = segment.startFrame;
  return sentences.map((text, cue) => {
    const end = cue === sentences.length - 1 ? segment.endFrameExclusive : cursor + Math.round((frames * text.length) / total);
    const entry = { endFrame: end, sceneId: segment.sceneId, startFrame: cursor, text };
    cursor = end;
    return entry;
  });
});

const props = fullLesson.fullLessonCompositionPropsSchema.parse({
  assets: {},
  captions,
  creativeDesign: schemas.planCinemaDesign({ packId, scenes: lesson.scenes, seed: "0123456789abcdef" }),
  lesson,
  narrationTracks: timeline.map((segment) => ({ kind: "deterministic-silence", sceneId: segment.sceneId })),
});
for (const [index, scene] of lesson.scenes.entries())
  console.log(`scene ${index + 1} @ ${index * seconds}s: ${scene.template} -> ${props.creativeDesign.scenes[scene.id]?.compositionId}`);

const browserExecutable = chromium.executablePath();
const serveUrl = await bundle({ entryPoint: path.join(sceneLibrary, "dist/remotion-root.js") });
const composition = await selectComposition({ browserExecutable, id: fullLessonRuntimeCompositionId, inputProps: props, serveUrl });
mkdirSync(path.dirname(output), { recursive: true });
await renderMedia({ browserExecutable, codec: "h264", composition, inputProps: props, outputLocation: output, serveUrl });
console.log(`Wrote ${output}`);
