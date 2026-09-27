/**
 * ST-103 — deterministic post-render self-review.
 *
 * The review has two halves:
 *
 * - `FfmpegRenderInspector` measures the produced MP4 with the same pinned
 *   ffprobe/ffmpeg binaries the renderer already uses. It returns numbers
 *   only — stream facts, black and silent spans, loudness and peak — plus four
 *   locally written contact-sheet frames.
 * - `classifyRenderReview` is a pure function from those measurements and the
 *   manifest's promises to typed findings. It is the only blocking authority
 *   (§1.3): there is no model-graded judgement.
 *
 * Clean-room: written from the ffmpeg filter documentation and this story's
 * thresholds. Nothing is derived from OpenMontage.
 */
import { Buffer } from "node:buffer";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { RenderInternals } from "@remotion/renderer";
import ffprobeStatic from "ffprobe-static";
import {
  narrationSegmentsFromCaptions,
  sceneLibraryVideoTheme,
} from "@avlp/scene-library";
import type {
  PinnedSoundBed,
  RenderReviewFinding,
  RenderReviewFindingCode,
} from "@avlp/schemas";
import { z } from "zod";
import type { RenderProfile } from "./contracts.js";
import { RenderMediaError } from "./media.js";
import {
  renderReviewThresholds,
  type RenderReviewThresholds,
} from "./render-review-thresholds.js";

export type TimeSpan = Readonly<{ startMs: number; endMs: number }>;

export type RenderMeasurements = Readonly<{
  streams: Readonly<{
    videoCount: number;
    audioCount: number;
    videoCodec: string | null;
    audioCodec: string | null;
    width: number | null;
    height: number | null;
    fps: number | null;
  }>;
  durationMs: number;
  blackSpans: readonly TimeSpan[];
  silenceSpans: readonly TimeSpan[];
  integratedLufs: number | null;
  peakDbfs: number | null;
}>;

export type RenderReviewExpectations = Readonly<{
  profile: RenderProfile;
  expectedDurationMs: number;
  /** Spans where narration audio is expected to be audible. */
  narrationSpans: readonly TimeSpan[];
  captions: Readonly<{
    /** Cues the manifest promises. */
    expectedCueCount: number;
    /** Cues the rendered composition actually carried. */
    renderedCueCount: number;
    /** Narrated scenes that carried no cue at all. */
    narratedScenesWithoutCaptions: number;
  }>;
}>;

const corrections: Record<RenderReviewFindingCode, string> = {
  STREAM_LAYOUT_INVALID:
    "Retry the render. If it fails again, report it: the renderer produced an unexpected file.",
  STREAM_PROFILE_MISMATCH:
    "Retry the render. If it fails again, report it: the output did not match the 1080p/30 fps H.264/AAC profile.",
  DURATION_MISMATCH:
    "Regenerate the narration audio for the lesson, validate again, and save a new version.",
  BLACK_SEGMENT:
    "Open the scene at this time in the storyboard, check its visual assets are available, then validate and render again.",
  NARRATION_SILENT:
    "Regenerate the narration audio for the scene at this time, then validate and render again.",
  AUDIO_CLIPPING:
    "Optional: regenerate the narration for louder scenes, or choose a quieter sound bed.",
  LOUDNESS_OUT_OF_RANGE:
    "Optional: regenerate narration or change the sound bed if the video sounds too quiet or too loud.",
  CAPTION_TRACK_MISSING:
    "Regenerate captions for the affected scene, then validate and render again.",
  CAPTION_CUE_COUNT_MISMATCH:
    "Regenerate captions for the lesson, then validate and render again.",
};

function finding(
  code: RenderReviewFindingCode,
  severity: RenderReviewFinding["severity"],
  detail: string,
  atMs?: number,
): RenderReviewFinding {
  return {
    code,
    severity,
    ...(atMs === undefined ? {} : { atMs: Math.max(0, Math.round(atMs)) }),
    detail,
    correction: corrections[code],
  };
}

const seconds = (ms: number) => `${(ms / 1_000).toFixed(2)} s`;

/** The pure classification. Boundary values are inclusive where the story
 * says "or longer"/"or above", which the unit tests pin down. */
export function classifyRenderReview(
  measurements: RenderMeasurements,
  expectations: RenderReviewExpectations,
  thresholds: RenderReviewThresholds = renderReviewThresholds,
): RenderReviewFinding[] {
  const findings: RenderReviewFinding[] = [];
  const { streams } = measurements;

  // 1. Streams.
  if (streams.videoCount !== 1 || streams.audioCount !== 1)
    findings.push(
      finding(
        "STREAM_LAYOUT_INVALID",
        "error",
        `Expected one video and one audio stream; found ${streams.videoCount} video and ${streams.audioCount} audio.`,
      ),
    );
  else if (
    streams.videoCodec !== expectations.profile.videoCodec ||
    streams.audioCodec !== expectations.profile.audioCodec ||
    streams.width !== expectations.profile.width ||
    streams.height !== expectations.profile.height ||
    streams.fps === null ||
    Math.abs(streams.fps - expectations.profile.fps) > 0.01
  )
    findings.push(
      finding(
        "STREAM_PROFILE_MISMATCH",
        "error",
        `Found ${streams.videoCodec ?? "no"} ${streams.width ?? "?"}x${streams.height ?? "?"} at ${streams.fps?.toFixed(2) ?? "?"} fps with ${streams.audioCodec ?? "no"} audio.`,
      ),
    );
  if (
    Math.abs(measurements.durationMs - expectations.expectedDurationMs) >
    thresholds.durationToleranceMs
  )
    findings.push(
      finding(
        "DURATION_MISMATCH",
        "error",
        `Duration ${seconds(measurements.durationMs)} differs from the expected ${seconds(expectations.expectedDurationMs)} by more than ${thresholds.durationToleranceMs} ms.`,
      ),
    );

  // 2. Black frames.
  for (const span of measurements.blackSpans)
    if (span.endMs - span.startMs >= thresholds.black.minDurationMs)
      findings.push(
        finding(
          "BLACK_SEGMENT",
          "error",
          `The picture is black for ${seconds(span.endMs - span.startMs)} from ${seconds(span.startMs)}.`,
          span.startMs,
        ),
      );

  // 3. Missing narration: silence that covers a narration span long enough.
  for (const silence of measurements.silenceSpans) {
    if (silence.endMs - silence.startMs < thresholds.silence.minDurationMs)
      continue;
    for (const narration of expectations.narrationSpans) {
      const overlapStart = Math.max(silence.startMs, narration.startMs);
      const overlapEnd = Math.min(silence.endMs, narration.endMs);
      if (overlapEnd - overlapStart >= thresholds.silence.overlapMs) {
        findings.push(
          finding(
            "NARRATION_SILENT",
            "error",
            `Narration is silent for ${seconds(overlapEnd - overlapStart)} from ${seconds(overlapStart)}.`,
            overlapStart,
          ),
        );
        break;
      }
    }
  }

  // 4. Audio level — warnings, never blocking.
  if (
    measurements.peakDbfs !== null &&
    measurements.peakDbfs >= thresholds.audio.clippingPeakDbfs
  )
    findings.push(
      finding(
        "AUDIO_CLIPPING",
        "warning",
        `Audio peaks at ${measurements.peakDbfs.toFixed(2)} dBFS (limit ${thresholds.audio.clippingPeakDbfs} dBFS).`,
      ),
    );
  if (
    measurements.integratedLufs === null ||
    measurements.integratedLufs < thresholds.audio.minIntegratedLufs ||
    measurements.integratedLufs > thresholds.audio.maxIntegratedLufs
  )
    findings.push(
      finding(
        "LOUDNESS_OUT_OF_RANGE",
        "warning",
        measurements.integratedLufs === null
          ? "Integrated loudness could not be measured because the audio is silent."
          : `Integrated loudness is ${measurements.integratedLufs.toFixed(1)} LUFS (expected ${thresholds.audio.minIntegratedLufs} to ${thresholds.audio.maxIntegratedLufs} LUFS).`,
      ),
    );

  // 5. Captions.
  const { captions } = expectations;
  if (
    captions.narratedScenesWithoutCaptions > 0 ||
    (captions.expectedCueCount > 0 && captions.renderedCueCount === 0)
  )
    findings.push(
      finding(
        "CAPTION_TRACK_MISSING",
        "error",
        captions.renderedCueCount === 0
          ? `The manifest promises ${captions.expectedCueCount} caption cues but the video carried none.`
          : `${captions.narratedScenesWithoutCaptions} narrated scene(s) carried no caption cues.`,
      ),
    );
  else if (captions.renderedCueCount !== captions.expectedCueCount)
    findings.push(
      finding(
        "CAPTION_CUE_COUNT_MISMATCH",
        "error",
        `The video carried ${captions.renderedCueCount} caption cues; the manifest promises ${captions.expectedCueCount}.`,
      ),
    );

  return findings;
}

/**
 * The silence floor for the missing-narration check.
 *
 * With no bed it is the story's -50 dB. Under narration a bed plays at its
 * ducked gain, so a lost narration track would leave the bed audible and a
 * fixed -50 dB floor could never see it. The floor therefore rises to the
 * bed's own ceiling there — its registered sample peak attenuated by the
 * ducked gain — plus a margin. Anything quieter than that is, at most, the bed
 * alone.
 */
export function silenceFloorDb(
  soundBed: Pick<PinnedSoundBed, "peakDbfs"> | null,
  thresholds: RenderReviewThresholds = renderReviewThresholds,
  duckedLevel: number = sceneLibraryVideoTheme.audio.soundBed.duckedLevel,
): number {
  if (soundBed === null) return thresholds.silence.noiseFloorDb;
  const bedCeiling = soundBed.peakDbfs + 20 * Math.log10(duckedLevel);
  return Math.max(
    thresholds.silence.noiseFloorDb,
    Math.round((bedCeiling + thresholds.silence.bedMarginDb) * 10) / 10,
  );
}

/** Narration spans in milliseconds, from the cues of narrated scenes only. A
 * scene that intentionally plays deterministic silence has nothing to lose. */
export function narrationSpansFromCaptions(
  captions: readonly Readonly<{
    sceneId: string;
    startFrame: number;
    endFrame: number;
  }>[],
  narratedSceneIds: ReadonlySet<string>,
  fps: number,
): TimeSpan[] {
  return narrationSegmentsFromCaptions(
    captions.filter((cue) => narratedSceneIds.has(cue.sceneId)),
    fps,
  ).map((segment) => ({
    startMs: (segment.startFrame * 1_000) / fps,
    endMs: (segment.endFrameExclusive * 1_000) / fps,
  }));
}

// ---------------------------------------------------------------------------
// ffprobe / ffmpeg inspection
// ---------------------------------------------------------------------------

export type ContactSheetFrame = Readonly<{
  position: number;
  atMs: number;
  path: string;
  width: number;
  height: number;
}>;

export type RenderInspection = Readonly<{
  measurements: RenderMeasurements;
  checksumSha256: string;
  contactSheet: readonly ContactSheetFrame[];
}>;

export interface RenderInspector {
  inspect(input: {
    videoPath: string;
    silenceFloorDb: number;
    workingDirectory: string;
  }): Promise<RenderInspection>;
}

const probeSchema = z.object({
  format: z.object({ duration: z.string() }),
  streams: z.array(
    z.object({
      avg_frame_rate: z.string().optional(),
      codec_name: z.string().optional(),
      codec_type: z.string(),
      duration: z.string().optional(),
      color_range: z.string().optional(),
      height: z.number().int().optional(),
      width: z.number().int().optional(),
    }),
  ),
});

function frameRate(value: string | undefined): number | null {
  if (value === undefined) return null;
  const [numerator, denominator = "1"] = value.split("/");
  const rate = Number(numerator) / Number(denominator);
  return Number.isFinite(rate) ? rate : null;
}

function unavailable(stage: string, error?: unknown): RenderMediaError {
  return new RenderMediaError(
    "retryable",
    "RENDER_REVIEW_UNAVAILABLE",
    "The rendered video could not be reviewed.",
    {
      errorName:
        error instanceof Error ? error.name.slice(0, 100) : "UnknownError",
      stage: `render_review_${stage}`,
    },
  );
}

type RunResult = { code: number | null; stderr: string };

/**
 * Starts the renderer's own pinned ffmpeg (the binary Remotion encodes with,
 * launched through Remotion so its library path is set on every platform) or
 * the existing ffprobe from `media.ts`.
 */
function start(
  tool: Readonly<{ bin: "ffmpeg" } | { bin: "ffprobe"; path: string }>,
  args: readonly string[],
): ChildProcessWithoutNullStreams {
  if (tool.bin === "ffprobe")
    return spawn(tool.path, args, { windowsHide: true });
  const executable = RenderInternals.getExecutablePath({
    binariesDirectory: null,
    indent: false,
    logLevel: "error",
    type: "ffmpeg",
  });
  // Mirrors how Remotion launches the same binary: from its own directory so
  // its bundled libraries resolve (and, on macOS, via DYLD_LIBRARY_PATH).
  const cwd = dirname(executable);
  return spawn(executable, ["-nostdin", ...args], {
    cwd,
    env:
      process.platform === "darwin"
        ? { ...process.env, DYLD_LIBRARY_PATH: cwd }
        : process.env,
    windowsHide: true,
  });
}

/**
 * Runs a binary with bounded stderr capture. `onStdout` consumes the output
 * as a stream, so a 420-second lesson is never buffered whole.
 */
function run(
  tool: Parameters<typeof start>[0],
  args: readonly string[],
  onStdout?: (chunk: Buffer) => void,
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    let child: ChildProcessWithoutNullStreams;
    try {
      child = start(tool, args);
    } catch (error) {
      reject(error);
      return;
    }
    child.stdin.end();
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      // Keep the tail: ffmpeg prints summaries (loudnorm) at the end.
      stderr = (stderr + chunk).slice(-2_000_000);
    });
    child.stdout.on("data", (chunk: Buffer) => onStdout?.(chunk));
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stderr }));
  });
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

/** Parses `silencedetect` output. An unterminated silence runs to the end. */
export function parseSilenceSpans(stderr: string, durationMs: number): TimeSpan[] {
  const spans: TimeSpan[] = [];
  let open: number | undefined;
  for (const line of stderr.split(/\r?\n/)) {
    const start = /silence_start:\s*(-?[0-9.]+)/.exec(line);
    if (start !== null) open = Math.max(0, Number(start[1]) * 1_000);
    const end = /silence_end:\s*([0-9.]+)/.exec(line);
    if (end !== null && open !== undefined) {
      spans.push({ startMs: open, endMs: Number(end[1]) * 1_000 });
      open = undefined;
    }
  }
  if (open !== undefined) spans.push({ startMs: open, endMs: durationMs });
  return spans;
}

/** Parses the JSON block `loudnorm=print_format=json` prints at the end. */
export function parseIntegratedLufs(stderr: string): number | null {
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start === -1 || end < start) return null;
  const parsed = z
    .object({ input_i: z.string() })
    .passthrough()
    .safeParse(JSON.parse(stderr.slice(start, end + 1)));
  if (!parsed.success) return null;
  const value = Number(parsed.data.input_i);
  return Number.isFinite(value) ? value : null;
}

/** Whether one analysis-size luma plane is a black picture. `limitedRange`
 * selects the luma scale the pixel threshold is a fraction of. */
export function isBlackPicture(
  luma: Uint8Array,
  limitedRange: boolean,
  thresholds: RenderReviewThresholds = renderReviewThresholds,
): boolean {
  const pixelThreshold = limitedRange
    ? 16 + thresholds.black.pixelThreshold * (235 - 16)
    : thresholds.black.pixelThreshold * 255;
  let black = 0;
  for (const value of luma) if (value <= pixelThreshold) black += 1;
  return black / luma.length >= thresholds.black.pictureRatio;
}

/** Contiguous black runs from one flag per decoded frame. */
export function blackSpansFromFlags(
  flags: readonly boolean[],
  fps: number,
): TimeSpan[] {
  const spans: TimeSpan[] = [];
  let runStart: number | undefined;
  flags.forEach((isBlack, index) => {
    if (isBlack && runStart === undefined) runStart = index;
    if (!isBlack && runStart !== undefined) {
      spans.push({
        startMs: (runStart * 1_000) / fps,
        endMs: (index * 1_000) / fps,
      });
      runStart = undefined;
    }
  });
  if (runStart !== undefined)
    spans.push({
      startMs: (runStart * 1_000) / fps,
      endMs: (flags.length * 1_000) / fps,
    });
  return spans;
}

function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 24 || view.getUint32(12) !== 0x49484452)
    throw new Error("Expected a PNG image header.");
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export class FfmpegRenderInspector implements RenderInspector {

  public async inspect(input: {
    videoPath: string;
    silenceFloorDb: number;
    workingDirectory: string;
  }): Promise<RenderInspection> {
    const thresholds = renderReviewThresholds;
    if (ffprobeStatic.path === null) throw unavailable("ffprobe");
    const ffprobe = { bin: "ffprobe", path: ffprobeStatic.path } as const;
    const ffmpeg = { bin: "ffmpeg" } as const;

    // Streams and duration.
    let stdout = "";
    const probe = await run(
      ffprobe,
      [
        "-v",
        "error",
        "-print_format",
        "json",
        "-show_format",
        "-show_streams",
        input.videoPath,
      ],
      (chunk) => {
        stdout += chunk.toString("utf8");
      },
    ).catch((error: unknown) => {
      throw unavailable("ffprobe", error);
    });
    if (probe.code !== 0) throw unavailable("ffprobe");
    const probed = probeSchema.parse(JSON.parse(stdout));
    const videos = probed.streams.filter((stream) => stream.codec_type === "video");
    const audios = probed.streams.filter((stream) => stream.codec_type === "audio");
    const video = videos[0];
    const audio = audios[0];
    const durationMs = Math.round(Number(probed.format.duration) * 1_000);
    const fps = frameRate(video?.avg_frame_rate);

    // Black frames: area-averaged luma at a small, fixed analysis size.
    const { analysisWidth: width, analysisHeight: height } = thresholds.black;
    const frameBytes = (width * height * 3) / 2;
    const limitedRange = video?.color_range !== "pc";
    const blackFlags: boolean[] = [];
    let pending = Buffer.alloc(0);
    let blackSpans: TimeSpan[] = [];
    if (video !== undefined) {
      const decoded = await run(
        ffmpeg,
        [
          "-hide_banner",
          "-nostats",
          "-v",
          "error",
          "-i",
          input.videoPath,
          "-map",
          "0:v:0",
          "-vf",
          `scale=${width}:${height}:flags=area`,
          "-pix_fmt",
          "yuv420p",
          // The renderer's ffmpeg ships no raw muxer; image2pipe with the
          // rawvideo encoder emits the same back-to-back planar frames.
          "-c:v",
          "rawvideo",
          "-f",
          "image2pipe",
          "pipe:1",
        ],
        (chunk) => {
          pending = Buffer.concat([pending, chunk]);
          while (pending.byteLength >= frameBytes) {
            blackFlags.push(
              isBlackPicture(pending.subarray(0, width * height), limitedRange),
            );
            pending = pending.subarray(frameBytes);
          }
        },
      ).catch((error: unknown) => {
        throw unavailable("black_detection", error);
      });
      if (decoded.code !== 0) throw unavailable("black_detection");
      blackSpans = blackSpansFromFlags(blackFlags, fps ?? 30);
    }

    // Silence and integrated loudness in one decode pass.
    let silenceSpans: TimeSpan[] = [];
    let integratedLufs: number | null = null;
    let peakDbfs: number | null = null;
    if (audio !== undefined) {
      const analysed = await run(ffmpeg, [
        "-hide_banner",
        "-nostats",
        "-i",
        input.videoPath,
        "-map",
        "0:a:0",
        "-af",
        `silencedetect=noise=${input.silenceFloorDb}dB:d=${thresholds.silence.minDurationMs / 1_000},loudnorm=print_format=json`,
        "-f",
        "null",
        "-",
      ]).catch((error: unknown) => {
        throw unavailable("audio_analysis", error);
      });
      if (analysed.code !== 0) throw unavailable("audio_analysis");
      silenceSpans = parseSilenceSpans(analysed.stderr, durationMs);
      integratedLufs = parseIntegratedLufs(analysed.stderr);

      // Sample peak from the decoded 16-bit PCM, streamed as WAV (the only
      // PCM container this ffmpeg can write); the header is skipped.
      let peak = 0;
      let carry: Buffer | undefined;
      let header: Buffer | undefined = Buffer.alloc(0);
      const decoded = await run(
        ffmpeg,
        [
          "-hide_banner",
          "-nostats",
          "-v",
          "error",
          "-i",
          input.videoPath,
          "-map",
          "0:a:0",
          "-map_metadata",
          "-1",
          "-flags",
          "+bitexact",
          "-acodec",
          "pcm_s16le",
          "-f",
          "wav",
          "pipe:1",
        ],
        (incoming) => {
          let chunk = incoming;
          if (header !== undefined) {
            header = Buffer.concat([header, incoming]);
            const marker = header.indexOf("data");
            if (marker === -1 || header.byteLength < marker + 8) return;
            chunk = header.subarray(marker + 8);
            header = undefined;
          }
          const data = carry === undefined ? chunk : Buffer.concat([carry, chunk]);
          const usable = data.byteLength - (data.byteLength % 2);
          for (let offset = 0; offset < usable; offset += 2)
            peak = Math.max(peak, Math.abs(data.readInt16LE(offset)));
          carry = usable === data.byteLength ? undefined : data.subarray(usable);
        },
      ).catch((error: unknown) => {
        throw unavailable("peak_analysis", error);
      });
      if (decoded.code !== 0) throw unavailable("peak_analysis");
      peakDbfs = peak === 0 ? null : 20 * Math.log10(peak / 32_768);
    }

    // Contact sheet.
    const contactSheet: ContactSheetFrame[] = [];
    if (video !== undefined && durationMs > 0)
      for (const [index, position] of thresholds.contactSheet.positions.entries()) {
        // Sample within the picture itself: the container can run a few
        // milliseconds longer than the last frame (audio priming/padding).
        const pictureMs = Number(video.duration) * 1_000;
        const lastFrameMs =
          (Number.isFinite(pictureMs) && pictureMs > 0 ? pictureMs : durationMs) -
          1_000 / (fps ?? 30);
        const atMs = Math.max(
          0,
          Math.min(Math.round(durationMs * position), Math.floor(lastFrameMs)),
        );
        const path = join(input.workingDirectory, `contact-${index + 1}.png`);
        const extracted = await run(ffmpeg, [
          "-hide_banner",
          "-nostats",
          "-v",
          "error",
          "-y",
          "-ss",
          (atMs / 1_000).toFixed(3),
          "-i",
          input.videoPath,
          "-frames:v",
          "1",
          "-vf",
          `scale=${thresholds.contactSheet.width}:-2`,
          "-c:v",
          "png",
          "-f",
          "image2",
          path,
        ]).catch((error: unknown) => {
          throw unavailable("contact_sheet", error);
        });
        if (extracted.code !== 0) throw unavailable("contact_sheet");
        const bytes = await readFile(path).catch(() => {
          throw unavailable("contact_sheet");
        });
        const size = pngSize(bytes);
        contactSheet.push({ atMs, height: size.height, path, position, width: size.width });
      }

    return {
      checksumSha256: await sha256File(input.videoPath),
      contactSheet,
      measurements: {
        blackSpans,
        durationMs: Number.isFinite(durationMs) ? durationMs : 0,
        integratedLufs,
        peakDbfs,
        silenceSpans,
        streams: {
          audioCodec: audio?.codec_name ?? null,
          audioCount: audios.length,
          fps,
          height: video?.height ?? null,
          videoCodec: video?.codec_name ?? null,
          videoCount: videos.length,
          width: video?.width ?? null,
        },
      },
    };
  }
}
