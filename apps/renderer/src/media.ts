import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import type { FullLessonCompositionProps } from "@avlp/scene-library";
import ffprobeStatic from "ffprobe-static";
import { z } from "zod";
import { fullLessonRuntimeCompositionId } from "@avlp/scene-library";
import type { RenderProfile, RenderedVideoMetadata } from "./contracts.js";

const execFileAsync = promisify(execFile);
type VideoConfig = Awaited<ReturnType<typeof selectComposition>>;

const ffprobeOutputSchema = z.object({
  format: z.object({
    duration: z.string(),
    size: z.string(),
  }),
  streams: z.array(
    z.object({
      avg_frame_rate: z.string().optional(),
      codec_name: z.string(),
      codec_type: z.enum(["audio", "video"]),
      height: z.number().int().optional(),
      width: z.number().int().optional(),
    }),
  ),
});

export class RenderMediaError extends Error {
  public constructor(
    public readonly classification: "retryable" | "terminal",
    public readonly code: string,
    message: string,
    public readonly diagnostic?: RenderFailureDiagnostic,
  ) {
    super(message);
    this.name = "RenderMediaError";
  }
}

export type RenderFailureDiagnostic = Readonly<{
  errorName: string;
  stage: string;
  systemCode?: string;
}>;

function safeFailureDiagnostic(
  error: unknown,
  stage: string,
): RenderFailureDiagnostic {
  const systemCode =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (typeof error.code === "string" || typeof error.code === "number")
      ? String(error.code).slice(0, 100)
      : undefined;
  return {
    errorName:
      error instanceof Error ? error.name.slice(0, 100) : "UnknownError",
    stage,
    ...(systemCode === undefined ? {} : { systemCode }),
  };
}

export type RenderEngineRequest = {
  browserExecutable?: string;
  composition: Readonly<FullLessonCompositionProps>;
  outputPath: string;
  profile: RenderProfile;
  onProgress: (progress: number) => Promise<void>;
  frameRange?: number | [number, number];
};

export type RenderEngineResult = {
  height: number;
  timestampMs: number;
  width: number;
};

export interface RenderEngine {
  renderVideo(
    request: RenderEngineRequest,
  ): Promise<Omit<RenderedVideoMetadata, "checksumSha256" | "storageKey">>;
  renderThumbnail(
    request: Omit<RenderEngineRequest, "onProgress" | "outputPath"> & {
      outputPath: string;
    },
  ): Promise<RenderEngineResult>;
}

function parseFrameRate(value: string | undefined): number {
  if (value === undefined) return Number.NaN;
  const [numerator, denominator = "1"] = value.split("/");
  return Number(numerator) / Number(denominator);
}

export async function verifyRenderedVideo(
  outputPath: string,
  profile: RenderProfile,
  expectedDurationMs?: number,
): Promise<Omit<RenderedVideoMetadata, "checksumSha256" | "storageKey">> {
  if (ffprobeStatic.path === null)
    throw new RenderMediaError(
      "retryable",
      "FFPROBE_UNAVAILABLE",
      "FFprobe is unavailable on this worker.",
    );
  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(ffprobeStatic.path, [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      outputPath,
    ]));
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : undefined;
    if (code === "ENOENT" || code === "EACCES")
      throw new RenderMediaError(
        "retryable",
        "FFPROBE_UNAVAILABLE",
        "FFprobe is unavailable on this worker.",
      );
    throw new RenderMediaError(
      "terminal",
      "OUTPUT_UNREADABLE",
      "The rendered MP4 could not be inspected.",
      safeFailureDiagnostic(error, "ffprobe"),
    );
  }
  const probe = ffprobeOutputSchema.parse(JSON.parse(stdout));
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  const sizeBytes = (await stat(outputPath)).size;
  const durationMs = Math.round(Number(probe.format.duration) * 1_000);
  const fps = parseFrameRate(video?.avg_frame_rate);
  const validDuration =
    Number.isFinite(durationMs) &&
    durationMs > 0 &&
    (expectedDurationMs === undefined ||
      Math.abs(durationMs - expectedDurationMs) <= 100);
  if (
    video?.codec_name !== profile.videoCodec ||
    audio?.codec_name !== profile.audioCodec ||
    video.width !== profile.width ||
    video.height !== profile.height ||
    Math.abs(fps - profile.fps) > 0.01 ||
    sizeBytes <= 0 ||
    Number(probe.format.size) <= 0 ||
    !validDuration
  )
    throw new RenderMediaError(
      "terminal",
      "OUTPUT_PROFILE_INVALID",
      "The rendered MP4 did not match the required media profile.",
    );
  return {
    audioCodec: "aac",
    durationMs,
    fps: 30,
    height: 1080,
    sizeBytes,
    videoCodec: "h264",
    width: 1920,
  };
}

function expectedDurationMs(
  composition: VideoConfig,
  frameRange: number | [number, number] | undefined,
): number {
  const frames =
    frameRange === undefined
      ? composition.durationInFrames
      : typeof frameRange === "number"
        ? 1
        : frameRange[1] - frameRange[0] + 1;
  return Math.round((frames / composition.fps) * 1_000);
}

function isLikelyTransient(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return [
    "target closed",
    "econnrefused",
    "econnreset",
    "failed to launch",
    "browser executable",
    "timed out",
    "resource temporarily unavailable",
  ].some((token) => message.includes(token));
}

export class RemotionRenderEngine implements RenderEngine {
  #serveUrl: Promise<string> | undefined;
  readonly #bundleComposition: () => Promise<string>;
  readonly #selectRenderComposition: typeof selectComposition;

  public constructor(
    options: {
      bundleComposition?: () => Promise<string>;
      selectRenderComposition?: typeof selectComposition;
    } = {},
  ) {
    this.#bundleComposition =
      options.bundleComposition ??
      (() =>
        bundle({
          entryPoint: fileURLToPath(
            new URL(
              "../../../packages/scene-library/dist/remotion-root.js",
              import.meta.url,
            ),
          ),
        }));
    this.#selectRenderComposition =
      options.selectRenderComposition ?? selectComposition;
  }

  #bundle(): Promise<string> {
    if (this.#serveUrl === undefined) {
      const pending = Promise.resolve().then(() => this.#bundleComposition());
      let recoverable: Promise<string>;
      recoverable = pending.catch((error: unknown) => {
        if (this.#serveUrl === recoverable) this.#serveUrl = undefined;
        throw error;
      });
      this.#serveUrl = recoverable;
    }
    return this.#serveUrl;
  }

  async #composition(request: {
    browserExecutable?: string;
    composition: Readonly<FullLessonCompositionProps>;
  }): Promise<{ selected: VideoConfig; serveUrl: string }> {
    const serveUrl = await this.#bundle();
    const selected = await this.#selectRenderComposition({
      ...(request.browserExecutable === undefined
        ? {}
        : { browserExecutable: request.browserExecutable }),
      id: fullLessonRuntimeCompositionId,
      inputProps: request.composition,
      serveUrl,
    });
    return { selected, serveUrl };
  }

  public async renderVideo(
    request: RenderEngineRequest,
  ): Promise<Omit<RenderedVideoMetadata, "checksumSha256" | "storageKey">> {
    let progressFailure: unknown;
    try {
      const { selected, serveUrl } = await this.#composition(request);
      let progressUpdates = Promise.resolve();
      await renderMedia({
        ...(request.browserExecutable === undefined
          ? {}
          : { browserExecutable: request.browserExecutable }),
        audioCodec: request.profile.audioCodec,
        codec: request.profile.videoCodec,
        composition: selected,
        enforceAudioTrack: true,
        ...(request.frameRange === undefined
          ? {}
          : { frameRange: request.frameRange }),
        inputProps: request.composition,
        onProgress: ({ progress }) => {
          progressUpdates = progressUpdates
            .then(() => request.onProgress(progress))
            .catch((error: unknown) => {
              progressFailure ??= error;
            });
        },
        outputLocation: request.outputPath,
        pixelFormat: request.profile.pixelFormat,
        serveUrl,
        x264Preset: "veryfast",
      });
      await progressUpdates;
      if (progressFailure !== undefined) throw progressFailure;
      return await verifyRenderedVideo(
        request.outputPath,
        request.profile,
        expectedDurationMs(selected, request.frameRange),
      );
    } catch (error) {
      if (progressFailure !== undefined && error === progressFailure)
        throw error;
      if (error instanceof RenderMediaError) throw error;
      throw new RenderMediaError(
        isLikelyTransient(error) ? "retryable" : "terminal",
        isLikelyTransient(error)
          ? "RENDER_WORKER_UNAVAILABLE"
          : "RENDER_FAILED",
        isLikelyTransient(error)
          ? "The render worker could not complete the render."
          : "The lesson could not be rendered from its immutable inputs.",
        safeFailureDiagnostic(error, "render_media"),
      );
    }
  }

  public async renderThumbnail(
    request: Omit<RenderEngineRequest, "onProgress" | "outputPath"> & {
      outputPath: string;
    },
  ): Promise<RenderEngineResult> {
    try {
      const { selected, serveUrl } = await this.#composition(request);
      const representativeFrame = Math.min(
        selected.durationInFrames - 1,
        Math.max(0, Math.round(selected.durationInFrames / 3)),
      );
      await renderStill({
        ...(request.browserExecutable === undefined
          ? {}
          : { browserExecutable: request.browserExecutable }),
        composition: selected,
        frame: representativeFrame,
        imageFormat: "png",
        inputProps: request.composition,
        output: request.outputPath,
        serveUrl,
      });
      return {
        height: selected.height,
        timestampMs: Math.round((representativeFrame / selected.fps) * 1_000),
        width: selected.width,
      };
    } catch (error) {
      throw new RenderMediaError(
        "retryable",
        "THUMBNAIL_FAILED",
        "The render thumbnail could not be generated.",
        safeFailureDiagnostic(error, "thumbnail"),
      );
    }
  }
}
