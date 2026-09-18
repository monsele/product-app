/**
 * ST-095 — the one way to turn a generated narration record into a contract
 * track.
 *
 * Parsing rather than casting is doing real work: it re-checks that the
 * generated beats are ordered, non-overlapping and inside the measured audio
 * duration, so a defect in the narration generator surfaces as a fixture
 * failure rather than as a silently mistimed clip.
 *
 * The fields are listed explicitly because the generated record carries one
 * extra — `bytes`, which is generator bookkeeping reported in the render
 * measurements and is not part of the narration contract. Naming the contract
 * fields keeps the contract narrow instead of widening it to accept
 * bookkeeping.
 */

import {
  demonstrationNarrationTrackSchema,
  type DemonstrationNarrationTrack,
} from "@avlp/schemas/demonstration-proof";
import {
  demonstrationNarrationLibrary,
  type DemonstrationNarrationRecord,
} from "./narration.generated.js";

/**
 * Accepts the generated record or an already-parsed track. `bytes` is omitted
 * from the parameter type rather than the argument, so a caller never has to
 * strip it and a `strict` schema never sees it.
 */
export function toDemonstrationNarrationTrack(
  record: Omit<DemonstrationNarrationRecord, "bytes">,
): DemonstrationNarrationTrack {
  return demonstrationNarrationTrackSchema.parse({
    beats: record.beats,
    checksumSha256: record.checksumSha256,
    durationMs: record.durationMs,
    sceneId: record.sceneId,
    src: record.src,
    timingProvenance: record.timingProvenance,
  });
}

export function demonstrationNarrationRecord(
  trackId: string,
): DemonstrationNarrationRecord {
  const record = demonstrationNarrationLibrary[trackId];
  if (record === undefined)
    throw new Error(
      `No generated narration track "${trackId}". Run generate:demonstration-narration.`,
    );
  return record;
}

/** The parsed contract track for a generated track ID. */
export function demonstrationNarrationTrack(
  trackId: string,
): DemonstrationNarrationTrack {
  return toDemonstrationNarrationTrack(demonstrationNarrationRecord(trackId));
}
