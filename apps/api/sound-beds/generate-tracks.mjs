#!/usr/bin/env node
/**
 * ST-103 — authors the curated sound-bed catalog.
 *
 * Every track is synthesised here from first principles: sine partials, simple
 * envelopes and a seeded PRNG. No sample, loop, recording or third-party
 * composition is used, so the output is an original work that the project
 * dedicates to the public domain under CC0-1.0 (see LICENSES.md). This is also
 * a clean-room implementation: nothing is derived from OpenMontage.
 *
 * Each track is a 16-second loop (8 bars at 120 BPM). Notes are accumulated
 * into a circular buffer, so a tail that crosses the loop end is added to the
 * loop start — exactly what continuous repetition would produce. The loop is
 * therefore seamless by construction, and it lasts a whole number of 30 fps
 * frames (480), so every repeat starts on a frame boundary.
 *
 * Loudness is normalised once, here, at authoring/registration time: each
 * track is scaled to the target integrated loudness measured by ffmpeg's
 * `loudnorm` analyser, capped so its sample peak stays at or below -1 dBFS.
 * The measured values are written to catalog.json and seeded into the
 * `sound_bed_tracks` table; renders never re-normalise.
 *
 * Usage: node apps/api/sound-beds/generate-tracks.mjs
 * The output is deterministic; re-running it must reproduce the committed
 * checksums (the script fails if it does not, unless --write is passed).
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RenderInternals } from "@remotion/renderer";

const here = dirname(fileURLToPath(import.meta.url));
const tracksDirectory = join(here, "tracks");
const catalogPath = join(here, "catalog.json");
const write = process.argv.includes("--write");

const sampleRate = 24_000;
const loopSeconds = 16;
const loopSamples = sampleRate * loopSeconds;
const beatSeconds = 0.5;
const targetLufs = -20;
const peakCeilingDbfs = -1;

/** mulberry32 — a tiny seeded PRNG so "humanised" variation is reproducible. */
function prng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const midiToHz = (note) => 440 * 2 ** ((note - 69) / 12);

/**
 * Adds one note to the circular loop buffer.
 * `partials` are [harmonic multiple, relative amplitude] pairs.
 */
function addNote(buffer, input) {
  const start = Math.round(input.startSeconds * sampleRate);
  const attack = Math.max(1, Math.round(input.attackSeconds * sampleRate));
  const hold = Math.round(input.holdSeconds * sampleRate);
  const release = Math.max(1, Math.round(input.releaseSeconds * sampleRate));
  const total = attack + hold + release;
  if (total >= loopSamples)
    throw new Error("A note may not be longer than the loop.");
  const frequency = midiToHz(input.note);
  for (let index = 0; index < total; index += 1) {
    let envelope;
    if (index < attack) envelope = index / attack;
    else if (index < attack + hold) envelope = 1;
    else {
      const progress = (index - attack - hold) / release;
      envelope =
        input.releaseShape === "exponential"
          ? Math.exp(-5 * progress) * (1 - progress)
          : 1 - progress;
    }
    const time = index / sampleRate;
    let sample = 0;
    for (const [multiple, amplitude] of input.partials)
      sample +=
        amplitude *
        Math.sin(2 * Math.PI * frequency * multiple * time + input.phase);
    const position = (start + index) % loopSamples;
    buffer[position] += sample * envelope * input.velocity;
  }
}

const pad = [
  [1, 1],
  [2, 0.35],
  [3, 0.12],
];
const bell = [
  [1, 1],
  [2.76, 0.28],
  [5.4, 0.08],
];
const pluck = [
  [1, 1],
  [2, 0.5],
  [3, 0.25],
  [4, 0.12],
];
const mallet = [
  [1, 1],
  [4, 0.22],
  [9.9, 0.04],
];
const soft = [[1, 1], [2, 0.15]];

function chordPad(buffer, random, chords, velocity) {
  const chordSeconds = loopSeconds / chords.length;
  chords.forEach((chord, index) => {
    for (const note of chord)
      addNote(buffer, {
        attackSeconds: 1.2,
        holdSeconds: chordSeconds - 1.2,
        note,
        partials: pad,
        phase: random() * Math.PI * 2,
        releaseSeconds: 1.6,
        releaseShape: "linear",
        startSeconds: index * chordSeconds,
        velocity: velocity * (0.9 + random() * 0.1),
      });
  });
}

function sequence(buffer, random, input) {
  input.notes.forEach((note, index) => {
    if (note === null) return;
    addNote(buffer, {
      attackSeconds: input.attackSeconds,
      holdSeconds: 0,
      note,
      partials: input.partials,
      phase: random() * Math.PI * 2,
      releaseSeconds: input.releaseSeconds,
      releaseShape: "exponential",
      startSeconds: index * input.stepSeconds,
      velocity: input.velocity * (0.85 + random() * 0.15),
    });
  });
}

// C major progression I–vi–IV–V and relatives; MIDI note numbers.
const cMajor = [
  [48, 55, 60, 64],
  [45, 52, 57, 60],
  [41, 48, 53, 57],
  [43, 50, 55, 59],
];
const aMinor = [
  [45, 52, 57, 60],
  [41, 48, 53, 57],
  [48, 55, 60, 64],
  [43, 50, 55, 62],
];
const fMajor = [
  [41, 48, 53, 57],
  [38, 45, 50, 53],
  [46, 53, 58, 62],
  [48, 55, 60, 64],
];

const tracks = [
  {
    trackId: "morning-pad",
    title: "Morning Pad",
    moodTags: ["calm", "warm"],
    seed: 11,
    build(buffer, random) {
      chordPad(buffer, random, cMajor, 0.22);
    },
  },
  {
    trackId: "quiet-pulse",
    title: "Quiet Pulse",
    moodTags: ["focused", "calm"],
    seed: 23,
    build(buffer, random) {
      chordPad(buffer, random, aMinor, 0.14);
      const roots = aMinor.flatMap((chord) =>
        Array.from({ length: 8 }, () => chord[0] - 12),
      );
      sequence(buffer, random, {
        attackSeconds: 0.01,
        notes: roots,
        partials: soft,
        releaseSeconds: 0.45,
        stepSeconds: beatSeconds,
        velocity: 0.3,
      });
    },
  },
  {
    trackId: "soft-plucks",
    title: "Soft Plucks",
    moodTags: ["bright", "playful"],
    seed: 37,
    build(buffer, random) {
      chordPad(buffer, random, cMajor, 0.08);
      const arpeggio = cMajor.flatMap((chord) =>
        [0, 1, 2, 3, 2, 1, 2, 3].map((step) => chord[step] + 12),
      );
      sequence(buffer, random, {
        attackSeconds: 0.004,
        notes: arpeggio,
        partials: pluck,
        releaseSeconds: 0.9,
        stepSeconds: beatSeconds,
        velocity: 0.16,
      });
    },
  },
  {
    trackId: "warm-drift",
    title: "Warm Drift",
    moodTags: ["warm", "reflective"],
    seed: 41,
    build(buffer, random) {
      chordPad(buffer, random, fMajor, 0.18);
      const bells = [72, null, null, null, 69, null, null, null];
      sequence(buffer, random, {
        attackSeconds: 0.005,
        notes: Array.from({ length: 4 }, () => bells).flat(),
        partials: bell,
        releaseSeconds: 2.8,
        stepSeconds: beatSeconds,
        velocity: 0.12,
      });
    },
  },
  {
    trackId: "bright-steps",
    title: "Bright Steps",
    moodTags: ["bright", "playful"],
    seed: 53,
    build(buffer, random) {
      chordPad(buffer, random, fMajor, 0.07);
      const pentatonic = [65, 67, 69, 72, 74, 72, 69, 67];
      sequence(buffer, random, {
        attackSeconds: 0.003,
        notes: Array.from({ length: 4 }, (_, bar) =>
          pentatonic.map((note) => note + (bar % 2 === 0 ? 0 : -5)),
        ).flat(),
        partials: mallet,
        releaseSeconds: 0.6,
        stepSeconds: beatSeconds,
        velocity: 0.2,
      });
    },
  },
  {
    trackId: "night-glass",
    title: "Night Glass",
    moodTags: ["reflective", "calm"],
    seed: 67,
    build(buffer, random) {
      chordPad(buffer, random, aMinor, 0.12);
      const glass = [81, null, 76, null, null, 79, null, null];
      sequence(buffer, random, {
        attackSeconds: 0.004,
        notes: Array.from({ length: 4 }, () => glass).flat(),
        partials: bell,
        releaseSeconds: 2.2,
        stepSeconds: beatSeconds,
        velocity: 0.07,
      });
    },
  },
];

function toWav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  let peak = 0;
  samples.forEach((value, index) => {
    const clamped = Math.max(-1, Math.min(1, value));
    const integer = Math.round(clamped * 32_767);
    peak = Math.max(peak, Math.abs(integer));
    data.writeInt16LE(integer, index * 2);
  });
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return { bytes: Buffer.concat([header, data]), peakInteger: peak };
}

const ffmpeg = RenderInternals.getExecutablePath({
  binariesDirectory: null,
  indent: false,
  logLevel: "error",
  type: "ffmpeg",
});

/** Integrated loudness (LUFS) via ffmpeg's loudnorm analyser. The loop is
 * measured as three repeats so the gating sees steady-state playback. */
function integratedLufs(path) {
  const run = spawnSync(
    ffmpeg,
    [
      "-hide_banner",
      "-nostats",
      "-stream_loop",
      "2",
      "-i",
      path,
      "-af",
      "loudnorm=print_format=json",
      "-f",
      "null",
      "-",
    ],
    { cwd: dirname(ffmpeg), encoding: "utf8" },
  );
  if (run.status !== 0) throw new Error(`ffmpeg failed measuring ${path}.`);
  const json = run.stderr.slice(run.stderr.lastIndexOf("{"));
  const parsed = JSON.parse(json.slice(0, json.indexOf("}") + 1));
  return Number(parsed.input_i);
}

mkdirSync(tracksDirectory, { recursive: true });
const committed = existsSync(catalogPath)
  ? JSON.parse(readFileSync(catalogPath, "utf8"))
  : { tracks: [] };
const catalog = [];
for (const track of tracks) {
  const buffer = new Float64Array(loopSamples);
  track.build(buffer, prng(track.seed));
  // Pass 1: peak-normalise to a fixed working level and measure loudness.
  let peak = 0;
  for (const value of buffer) peak = Math.max(peak, Math.abs(value));
  const working = Array.from(buffer, (value) => (value / peak) * 0.5);
  const probePath = join(tracksDirectory, `${track.trackId}.probe.wav`);
  writeFileSync(probePath, toWav(working).bytes);
  const measured = integratedLufs(probePath);
  // Pass 2: one gain to reach the target, capped by the sample-peak ceiling.
  const lufsGainDb = targetLufs - measured;
  const peakGainDb = peakCeilingDbfs - 20 * Math.log10(0.5);
  const gain = 10 ** (Math.min(lufsGainDb, peakGainDb) / 20);
  const { bytes, peakInteger } = toWav(working.map((value) => value * gain));
  const path = join(tracksDirectory, `${track.trackId}.wav`);
  writeFileSync(path, bytes);
  rmSync(probePath);
  const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
  const finalLufs = Math.round(integratedLufs(path) * 10) / 10;
  catalog.push({
    trackId: track.trackId,
    title: track.title,
    moodTags: track.moodTags,
    durationMs: loopSeconds * 1_000,
    loops: true,
    integratedLoudnessLufs: finalLufs,
    peakDbfs: Math.round(20 * Math.log10(peakInteger / 32_768) * 10) / 10,
    checksumSha256,
    storageKey: `catalog/sound-beds/${track.trackId}/${checksumSha256}.wav`,
    contentType: "audio/wav",
    licenseId: "CC0-1.0",
    sourceUrl: `https://creativecommons.org/publicdomain/zero/1.0/#avlp-sound-bed-${track.trackId}`,
    attributionText: null,
  });
}

const next = JSON.stringify({ generator: "st-103-synth-v1", tracks: catalog }, null, 2);
if (write || committed.tracks.length === 0) {
  writeFileSync(catalogPath, `${next}\n`);
  console.log(`Wrote ${catalog.length} tracks and catalog.json.`);
} else {
  const drift = catalog.filter(
    (entry, index) =>
      committed.tracks[index]?.checksumSha256 !== entry.checksumSha256,
  );
  if (drift.length > 0) {
    console.error(
      `Regenerated bytes differ from the committed catalog for: ${drift
        .map((entry) => entry.trackId)
        .join(", ")}. Registered checksums are immutable; add a new trackId instead.`,
    );
    process.exit(1);
  }
  console.log("Regenerated tracks match the committed catalog.");
}
