/**
 * ST-094 — deterministic narration bed for the creative-style proof.
 *
 * IMPORTANT, and recorded as a deviation in the story's Dev Agent Record: this
 * is **not** a recorded human voice. It is an original, seeded, formant-shaped
 * audio bed whose duration equals the scene's authored narration duration, one
 * track per scene, shared byte-identically across all three styles.
 *
 * It exists so the proof can verify what a narration track is *for* in this
 * repository — that measured duration is the timing authority (ADR-004), that
 * every scene carries a real non-silent audio stream through to AAC, that
 * caption cues align with it, and that no style accelerates or truncates it.
 * It cannot verify prosody, intelligibility or voice quality, and no claim of
 * that kind is made anywhere in the proof evidence.
 *
 * No paid TTS or external provider is called. 8 kHz 8-bit mono keeps the
 * bundled data URIs small; the pipeline under test is the timing contract, not
 * audio fidelity.
 *
 * Regenerate with:
 *   pnpm --filter @avlp/scene-library run generate:style-proof-narration
 */

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 8_000;

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds a syllable-paced bed: a pitched carrier with two formants, gated by a
 * syllable envelope and broken by sentence-length pauses. The syllable count is
 * derived from the narration text so the bed's rhythm tracks the script rather
 * than drifting independently of it.
 */
function narrationWav(text, durationSeconds, seed) {
  const random = makeRandom(seed);
  const totalSamples = Math.round(durationSeconds * SAMPLE_RATE);
  const words = text.split(/\s+/).filter(Boolean);
  const syllables = Math.max(4, Math.round(words.length * 1.4));
  const samplesPerSyllable = totalSamples / syllables;
  const basePitch = 118;
  const samples = new Uint8Array(totalSamples);
  let phase = 0;
  let formantPhaseA = 0;
  let formantPhaseB = 0;
  for (let n = 0; n < totalSamples; n++) {
    const syllableIndex = Math.floor(n / samplesPerSyllable);
    const withinSyllable = (n % samplesPerSyllable) / samplesPerSyllable;
    // Every fifth syllable is a breath, giving the bed sentence-like phrasing.
    const isPause = syllableIndex % 5 === 4;
    const envelope = isPause
      ? 0
      : Math.sin(Math.PI * Math.min(1, withinSyllable / 0.86)) ** 1.4;
    const drift = 1 + 0.08 * Math.sin((syllableIndex * 2.3) % (Math.PI * 2));
    const pitch = basePitch * drift;
    phase += (2 * Math.PI * pitch) / SAMPLE_RATE;
    formantPhaseA += (2 * Math.PI * (pitch * 5.6)) / SAMPLE_RATE;
    formantPhaseB += (2 * Math.PI * (pitch * 11.2)) / SAMPLE_RATE;
    const voiced =
      0.62 * Math.sin(phase) +
      0.26 * Math.sin(formantPhaseA) +
      0.12 * Math.sin(formantPhaseB);
    const breath = (random() - 0.5) * 0.06;
    const value = Math.max(-1, Math.min(1, (voiced + breath) * envelope * 0.8));
    samples[n] = Math.round((value + 1) * 127.5);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + totalSamples, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE, 28); // byte rate (8-bit mono)
  header.writeUInt16LE(1, 32); // block align
  header.writeUInt16LE(8, 34); // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(totalSamples, 40);
  return Buffer.concat([header, Buffer.from(samples)]);
}

/**
 * Narration scripts and their authored durations. These durations are the
 * timing authority for the proof: the treatments compose around them, they are
 * identical across all three styles, and no style may shorten them.
 */
const tracks = [
  {
    trackId: "conduction-hook",
    durationSeconds: 7,
    seed: 0x1a2b,
    text: "Put one ice cube on metal and one on wood. Only a minute later, they do not look the same at all.",
  },
  {
    trackId: "conduction-definition",
    durationSeconds: 11,
    seed: 0x3c4d,
    text: "Conduction is the transfer of thermal energy between materials that are touching. Particles with more energy collide with their neighbours and pass some of that energy along, so heat moves through the material without the material itself going anywhere.",
  },
  {
    trackId: "conduction-comparison",
    durationSeconds: 10,
    seed: 0x5e6f,
    text: "Both blocks start at the same room temperature and both receive the same ice cube. Metal conducts that heat towards the ice quickly, while wood conducts it slowly, so the cube on metal melts first.",
  },
  {
    trackId: "leaf-hook",
    durationSeconds: 6,
    seed: 0x7a8b,
    text: "A cactus and a fern are both plants, so why do their leaves look nothing alike?",
  },
  {
    trackId: "leaf-definition",
    durationSeconds: 9,
    seed: 0x9c0d,
    text: "Transpiration is the loss of water vapour through tiny pores on a leaf. Every pore that opens to let carbon dioxide in also lets water escape.",
  },
  {
    trackId: "leaf-comparison",
    durationSeconds: 9,
    seed: 0xbe1f,
    text: "A cactus has few, sunken pores and stores water in a thick stem, while a fern has many pores on broad fronds and lives where water is easy to replace.",
  },
];

const records = tracks.map((track) => {
  const bytes = narrationWav(track.text, track.durationSeconds, track.seed);
  return {
    trackId: track.trackId,
    durationMs: track.durationSeconds * 1_000,
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    src: `data:audio/wav;base64,${bytes.toString("base64")}`,
    text: track.text,
    bytes: bytes.length,
  };
});

const file = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Produced by \`scripts/generate-style-proof-narration.mjs\` (ST-094).
 *
 * These are synthetic narration beds, not recorded speech. See the generator's
 * header for exactly what they do and do not evidence. Each track's duration is
 * the authored narration duration for its scene and is shared unchanged by all
 * three styles.
 *
 * Regenerate with:
 *   pnpm --filter @avlp/scene-library run generate:style-proof-narration
 */

export type StyleProofNarrationRecord = Readonly<{
  bytes: number;
  checksumSha256: string;
  durationMs: number;
  src: string;
  text: string;
  trackId: string;
}>;

export const styleProofNarrationLibrary: Readonly<
  Record<string, StyleProofNarrationRecord>
> = Object.freeze({
${records
  .map(
    (record) => `  ${JSON.stringify(record.trackId)}: Object.freeze({
    bytes: ${record.bytes},
    checksumSha256: ${JSON.stringify(record.checksumSha256)},
    durationMs: ${record.durationMs},
    src: ${JSON.stringify(record.src)},
    text: ${JSON.stringify(record.text)},
    trackId: ${JSON.stringify(record.trackId)},
  }),
`,
  )
  .join("")}});
`;

const outputPath = fileURLToPath(
  new URL("../src/style-proof/narration.generated.ts", import.meta.url),
);
writeFileSync(outputPath, file, "utf8");
process.stdout.write(
  `Wrote ${records.length} narration beds (${(records.reduce((sum, r) => sum + r.bytes, 0) / 1024).toFixed(1)} KiB) to ${outputPath}\n`,
);
