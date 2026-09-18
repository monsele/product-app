/**
 * ST-095 — narration and measured phrase timings for the demonstration proof.
 *
 * How the timings are obtained, because the story is specific that a
 * character-count estimate may not be presented as alignment:
 *
 * 1. Every phrase of every scene is synthesized to its **own** WAV file by the
 *    Windows Speech API — a local, offline component of the operating system.
 *    No paid TTS provider is called and nothing leaves the machine.
 * 2. Each phrase's duration is then read from the PCM data itself: byte length
 *    minus header, divided by the byte rate. That is a measurement of the audio
 *    that exists, not a prediction from the text.
 * 3. The scene's track is assembled by concatenating those phrases with
 *    authored silences between them, so a phrase's start is the exact
 *    cumulative sample offset of everything before it.
 *
 * The result is that a beat boundary is correct by construction. There is no
 * alignment step that could be approximate, because the audio is built around
 * the boundaries rather than the boundaries being guessed from the audio.
 *
 * This is synthesized speech, not a recorded human voice, and the evaluation
 * records that as a limitation: it proves timing, intelligible word content,
 * caption correspondence and duration authority; it does not prove the prosody
 * of a professional read.
 *
 * Regenerate with:
 *   pnpm --filter @avlp/scene-library run generate:demonstration-narration
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const VOICE = "Microsoft Zira Desktop";
const RATE = -1; // Slightly below default: an explanatory read, not a fast one.
const SAMPLE_RATE = 48_000;
const BYTES_PER_SAMPLE = 2;
const LEAD_IN_MS = 400;
const GAP_MS = 550;
const TAIL_MS = 900;

/**
 * The narration scripts.
 *
 * A beat is one phrase. Beat IDs are stable and are what an event plan anchors
 * to, so renaming one is a deliberate, breaking change to every plan that
 * references it.
 */
const scripts = [
  {
    sceneId: "00121cd9-7007-7111-ada5-520684c390a8",
    trackId: "savings-intro",
    phrases: [
      {
        beatId: "count-notes",
        text: "Here is ten thousand naira, shown as ten notes of one thousand naira each.",
      },
      {
        beatId: "count-total",
        text: "Ten notes. One thousand naira each. Ten thousand naira altogether.",
      },
      {
        beatId: "illustrative",
        text: "These are example figures, used only to show how saving works.",
      },
    ],
  },
  {
    sceneId: "92b55fe4-e4f7-786a-a161-b0d06c0f825e",
    trackId: "savings-transfer",
    phrases: [
      {
        beatId: "decide",
        text: "This week, two of those notes go into savings.",
      },
      {
        beatId: "move",
        text: "Watch them move across. Two notes leave the income tray.",
      },
      {
        beatId: "result",
        text: "Eight thousand naira is left to spend, and two thousand naira is saved.",
      },
    ],
  },
  {
    sceneId: "fe8e133c-f432-73df-a364-7257bacc1b83",
    trackId: "savings-accumulate",
    phrases: [
      {
        beatId: "week-two",
        text: "The next week comes around, and wages are paid again.",
      },
      {
        beatId: "deposit-two",
        text: "Two notes arrive from those wages, and two notes go into savings.",
      },
      {
        beatId: "week-three",
        text: "In the third week, wages are paid once more.",
      },
      {
        beatId: "deposit-three",
        text: "Again, two notes arrive, and again two notes are saved.",
      },
      {
        beatId: "goal",
        text: "After three weeks, six thousand naira is saved, toward a goal of ten thousand.",
      },
    ],
  },
  {
    sceneId: "bcc6b621-6c66-72a9-9c50-6bbdbe03e738",
    trackId: "evaporation-setup",
    phrases: [
      {
        beatId: "still-water",
        text: "This is a glass of water, standing on a table at room temperature.",
      },
      {
        beatId: "look-closer",
        text: "Let us look much closer at the surface, at the water particles themselves.",
      },
      {
        beatId: "model-note",
        text: "This is a simplified model. Real water holds far more particles than we could ever draw.",
      },
    ],
  },
  {
    sceneId: "89d3fd22-0c06-7dc4-9be7-1dbeb3b276aa",
    trackId: "evaporation-escape",
    phrases: [
      {
        beatId: "energy",
        text: "The particles are always moving, and some move faster than others.",
      },
      {
        beatId: "escape",
        text: "A fast particle at the surface can break away and leave the liquid.",
      },
      {
        beatId: "identity",
        text: "It is still water. Nothing has changed about the particle except where it is.",
      },
    ],
  },
  {
    sceneId: "4dfba23a-3fc5-7e58-84b2-dca32fd3e042",
    trackId: "evaporation-spread",
    phrases: [
      {
        beatId: "spread",
        text: "Once free, these particles spread out into the space above the water.",
      },
      {
        beatId: "no-boiling",
        text: "This happens without boiling. The water does not need to be hot.",
      },
      {
        beatId: "conserved",
        text: "The water has not disappeared. It has moved, particle by particle, into the air.",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Synthesis
// ---------------------------------------------------------------------------

const workDir = join(tmpdir(), `st-095-narration-${process.pid}`);
mkdirSync(workDir, { recursive: true });

const jobs = [];
for (const script of scripts)
  for (const phrase of script.phrases)
    jobs.push({
      outPath: join(workDir, `${script.trackId}-${phrase.beatId}.wav`),
      text: phrase.text,
    });

const jobPath = join(workDir, "job.json");
writeFileSync(jobPath, JSON.stringify(jobs), "utf8");

const scriptPath = fileURLToPath(
  new URL("./synthesize-phrases.ps1", import.meta.url),
);

/**
 * The synthesizer is the Windows Speech API, which ships with the operating
 * system and costs nothing — but only exists on Windows. Said plainly here,
 * because the alternative was an opaque ENOENT from `powershell.exe` on a
 * machine where the tool was never going to be available.
 *
 * Regenerating narration is the only Windows-only step. The generated tracks
 * are committed, so rendering the clips, running the tests and reproducing the
 * evidence all work anywhere.
 */
if (process.platform !== "win32")
  throw new Error(
    `Narration synthesis needs the Windows Speech API and this is ${process.platform}. ` +
      "The generated tracks in src/demonstration-proof/narration.generated.ts are committed, " +
      "so renders and tests reproduce on this machine without regenerating them. " +
      "To change the narration, run this script on Windows, or replace synthesize-phrases.ps1 " +
      "with a local synthesizer for this platform that writes one 48 kHz 16-bit mono WAV per phrase.",
  );

process.stdout.write(
  `Synthesizing ${jobs.length} phrases with the local Windows Speech API…\n`,
);
execFileSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    "-JobPath",
    jobPath,
    "-Voice",
    VOICE,
    "-Rate",
    String(RATE),
  ],
  { stdio: ["ignore", "pipe", "inherit"] },
);

// ---------------------------------------------------------------------------
// Measurement and assembly
// ---------------------------------------------------------------------------

/** Reads a 16-bit mono PCM WAV and returns its samples plus its measured rate. */
function readWav(path) {
  const buffer = readFileSync(path);
  if (buffer.toString("ascii", 0, 4) !== "RIFF")
    throw new Error(`${path} is not a RIFF file.`);
  let offset = 12;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let channels = 0;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = buffer.subarray(offset + 8, offset + 8 + size);
    if (id === "fmt ") {
      channels = body.readUInt16LE(2);
      sampleRate = body.readUInt32LE(4);
      bitsPerSample = body.readUInt16LE(14);
    }
    if (id === "data") data = body;
    offset += 8 + size + (size % 2);
  }
  if (data === null) throw new Error(`${path} has no data chunk.`);
  if (channels !== 1 || bitsPerSample !== 16)
    throw new Error(
      `${path} is ${channels}ch/${bitsPerSample}-bit; the proof expects 16-bit mono.`,
    );
  return { sampleRate, samples: data.length / BYTES_PER_SAMPLE, data };
}

function silence(milliseconds) {
  return Buffer.alloc(
    Math.round((milliseconds / 1_000) * SAMPLE_RATE) * BYTES_PER_SAMPLE,
  );
}

function wavFile(pcm) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * BYTES_PER_SAMPLE, 28);
  header.writeUInt16LE(BYTES_PER_SAMPLE, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const samplesToMs = (samples) => Math.round((samples / SAMPLE_RATE) * 1_000);

const tracks = [];
for (const script of scripts) {
  const parts = [silence(LEAD_IN_MS)];
  let cursorSamples = silence(LEAD_IN_MS).length / BYTES_PER_SAMPLE;
  const beats = [];

  for (const [index, phrase] of script.phrases.entries()) {
    const wav = readWav(join(workDir, `${script.trackId}-${phrase.beatId}.wav`));
    if (wav.sampleRate !== SAMPLE_RATE)
      throw new Error(
        `${phrase.beatId} rendered at ${wav.sampleRate}Hz, expected ${SAMPLE_RATE}Hz.`,
      );
    const startSamples = cursorSamples;
    parts.push(wav.data);
    cursorSamples += wav.samples;
    beats.push({
      beatId: phrase.beatId,
      text: phrase.text,
      startMs: samplesToMs(startSamples),
      endMs: samplesToMs(cursorSamples),
    });
    const gap = index === script.phrases.length - 1 ? silence(TAIL_MS) : silence(GAP_MS);
    parts.push(gap);
    cursorSamples += gap.length / BYTES_PER_SAMPLE;
  }

  const pcm = Buffer.concat(parts);
  const file = wavFile(pcm);
  const durationMs = samplesToMs(pcm.length / BYTES_PER_SAMPLE);
  tracks.push({
    trackId: script.trackId,
    sceneId: script.sceneId,
    durationMs,
    checksumSha256: createHash("sha256").update(file).digest("hex"),
    bytes: file.length,
    src: `data:audio/wav;base64,${file.toString("base64")}`,
    beats,
  });
  process.stdout.write(
    `  ${script.trackId}: ${(durationMs / 1_000).toFixed(2)}s, ${beats.length} beats, ${(file.length / 1_048_576).toFixed(2)} MiB\n`,
  );
}

rmSync(workDir, { recursive: true, force: true });

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

const provenance = {
  method: "measured-phrase-boundaries",
  tool: `Windows Speech API (System.Speech), voice "${VOICE}", rate ${RATE}, 48 kHz 16-bit mono`,
  reviewedBy: "ST-095 implementation, reviewed against the rendered clips",
  reviewedOn: new Date().toISOString().slice(0, 10),
  notes:
    "Each phrase was synthesized to its own file and the scene track assembled by concatenation, so every beat boundary is the exact cumulative sample offset of the phrases before it. No forced aligner and no character-count estimate is involved. Synthesized speech, not a recorded human voice.",
};

const body = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Produced by \`scripts/generate-demonstration-narration.mjs\` (ST-095).
 *
 * Each track is one scene's complete narration, shared byte-identically by the
 * demonstration and the standard approach so a comparison isolates the visual
 * behaviour. Beat boundaries are measured, not estimated: see the generator's
 * header for exactly how, and \`timingProvenance\` on every track for the
 * machine-readable record.
 *
 * Regenerate with:
 *   pnpm --filter @avlp/scene-library run generate:demonstration-narration
 */

export const demonstrationTimingProvenance = Object.freeze(${JSON.stringify(
  provenance,
  null,
  2,
).replace(/\n/g, "\n  ")});

/**
 * A deeply-readonly view of a generated track.
 *
 * Deliberately *not* the schema's inferred type: everything here is frozen, so
 * its arrays are \`readonly\`, which the inferred type is not. Consumers run
 * each record through \`demonstrationNarrationTrackSchema.parse\`, which both
 * produces the contract type and re-checks that these generated beats really
 * are ordered, non-overlapping and inside the measured duration — so a defect
 * in this generator surfaces as a fixture failure, not a mistimed clip.
 */
export type DemonstrationNarrationRecord = Readonly<{
  beats: readonly Readonly<{
    beatId: string;
    endMs: number;
    startMs: number;
    text: string;
  }>[];
  bytes: number;
  checksumSha256: string;
  durationMs: number;
  sceneId: string;
  src: string;
  timingProvenance: Readonly<{
    method: "measured-phrase-boundaries" | "manual-waveform-alignment";
    notes: string;
    reviewedBy: string;
    reviewedOn: string;
    tool: string;
  }>;
}>;

export const demonstrationNarrationLibrary: Readonly<
  Record<string, DemonstrationNarrationRecord>
> = Object.freeze({
${tracks
  .map(
    (track) => `  ${JSON.stringify(track.trackId)}: Object.freeze({
    bytes: ${track.bytes},
    checksumSha256: ${JSON.stringify(track.checksumSha256)},
    durationMs: ${track.durationMs},
    sceneId: ${JSON.stringify(track.sceneId)},
    timingProvenance: demonstrationTimingProvenance,
    beats: Object.freeze([
${track.beats
  .map(
    (beat) =>
      `      Object.freeze({ beatId: ${JSON.stringify(beat.beatId)}, endMs: ${beat.endMs}, startMs: ${beat.startMs}, text: ${JSON.stringify(beat.text)} }),`,
  )
  .join("\n")}
    ]),
    src: ${JSON.stringify(track.src)},
  }),`,
  )
  .join("\n")}
});

/** Stable track IDs, in authoring order. */
export const demonstrationNarrationTrackIds = Object.freeze([
${tracks.map((entry) => `  ${JSON.stringify(entry.trackId)},`).join("\n")}
]);
`;

const outPath = fileURLToPath(
  new URL("../src/demonstration-proof/narration.generated.ts", import.meta.url),
);
writeFileSync(outPath, body, "utf8");
process.stdout.write(`Wrote ${outPath}\n`);
