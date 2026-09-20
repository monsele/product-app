import { chromium } from "@playwright/test";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  creativeDesignManifestSchema,
  creativeDesignPlannerVersion,
  defaultCreativeDesignSettings,
  planCreativeDesign,
} from "@avlp/schemas";
import ffprobeStatic from "ffprobe-static";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { photosynthesisThreeMinuteLesson } from "./full-lesson.fixture.js";
import {
  calculateLessonTimeline,
  type FullLessonCompositionProps,
} from "./full-lesson.js";
import { fullLessonRuntimeCompositionId } from "./scene-preview-composition.js";
import { styleProofNarrationLibrary } from "./style-proof/narration.generated.js";

const execFileAsync = promisify(execFile);
const packIds = ["systems", "field-notes", "prism"] as const;
let browserExecutable: string;
let serveUrl: string;
let workingDirectory: string;

function propsFor(
  packId: (typeof packIds)[number],
): FullLessonCompositionProps {
  const scene = photosynthesisThreeMinuteLesson.scenes[0]!;
  const lesson = { ...photosynthesisThreeMinuteLesson, scenes: [scene] };
  const timeline = calculateLessonTimeline(lesson);
  const selections = planCreativeDesign({
    packId,
    scenes: [
      {
        id: scene.id,
        template: scene.template,
        durationSeconds: scene.durationSeconds,
      },
    ],
  });
  return {
    assets: {},
    captions: [
      {
        endFrame: timeline[0]!.endFrameExclusive,
        sceneId: scene.id,
        startFrame: 0,
        text: scene.narration,
      },
    ],
    creativeDesign: creativeDesignManifestSchema.parse({
      manifestVersion: "1.0",
      plannerVersion: creativeDesignPlannerVersion,
      pack: { id: packId, version: "1.0.0" },
      approach: "standard",
      settings: defaultCreativeDesignSettings,
      selections,
      presetVersionId: null,
    }),
    lesson,
    narrationTracks: [
      {
        kind: "browser-audio",
        sceneId: scene.id,
        src: styleProofNarrationLibrary["conduction-hook"]!.src,
      },
    ],
  };
}

beforeAll(async () => {
  browserExecutable = chromium.executablePath();
  workingDirectory = await mkdtemp(join(tmpdir(), "st101-media-"));
  serveUrl = await bundle({
    entryPoint: fileURLToPath(
      new URL("../dist/remotion-root.js", import.meta.url),
    ),
  });
}, 600_000);

afterAll(async () => {
  await rm(workingDirectory, { force: true, recursive: true });
});

describe("ST-101 creative-pack MP4 postflight", () => {
  it.each(packIds)(
    "encodes %s at 1080p with a real AAC narration track",
    async (packId) => {
      if (ffprobeStatic.path === null)
        throw new Error("FFprobe is unavailable.");
      const props = propsFor(packId);
      const composition = await selectComposition({
        browserExecutable,
        id: fullLessonRuntimeCompositionId,
        inputProps: props,
        serveUrl,
      });
      const outputLocation = join(workingDirectory, `${packId}.mp4`);
      await renderMedia({
        audioCodec: "aac",
        browserExecutable,
        codec: "h264",
        composition,
        enforceAudioTrack: true,
        frameRange: [0, 59],
        inputProps: props,
        outputLocation,
        pixelFormat: "yuv420p",
        serveUrl,
        x264Preset: "veryfast",
      });
      const { stdout } = await execFileAsync(ffprobeStatic.path, [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_streams",
        outputLocation,
      ]);
      const probe = JSON.parse(stdout) as {
        streams: readonly {
          codec_name?: string;
          codec_type?: string;
          height?: number;
          width?: number;
        }[];
      };
      const video = probe.streams.find(
        (stream) => stream.codec_type === "video",
      );
      const audio = probe.streams.find(
        (stream) => stream.codec_type === "audio",
      );
      expect(video).toMatchObject({
        codec_name: "h264",
        height: 1080,
        width: 1920,
      });
      expect(audio).toMatchObject({ codec_name: "aac" });
    },
    600_000,
  );
});
