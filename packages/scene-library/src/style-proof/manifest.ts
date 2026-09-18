/**
 * ST-094 — the proof reproducibility manifest (CR-02, CR-06, CR-08).
 *
 * A pack version string alone does not reproduce a render. This records what
 * actually determines the output: the hashed resolved input, the resolved
 * treatments, the asset and audio checksums, the pinned font faces, the motion
 * parameters, the frame timeline, the output profile, and the renderer
 * identity. Signed URLs and temporary paths are absent by construction — the
 * proof's media are bundled data URIs, so there is no credential to leak into
 * content identity.
 */

import { createHash } from "node:crypto";
import {
  canonicalStyleProofJson,
  styleProofHashPolicy,
  styleProofManifestSchema,
  type StyleProofCompositionProps,
  type StyleProofManifest,
} from "@avlp/schemas/style-proof";
import { styleProofFontFaces } from "@avlp/design-system/style-proof-tokens";
import { styleProofAssetBytes } from "./assets.generated.js";
import { styleProofNarrationLibrary } from "./narration.generated.js";
import { styleProofTimeline } from "./composition.js";
import { resolveStyleProofScenes } from "./resolver.js";

/** Bumped whenever a change could alter a rendered proof frame. */
export const styleProofImplementationVersion =
  "st-094-style-proof-packs-v1" as const;
export const styleProofRemotionVersion = "4.0.507" as const;

export const styleProofOutputProfile = Object.freeze({
  audioCodec: "aac",
  fps: 30,
  height: 1080,
  pixelFormat: "yuv420p",
  videoCodec: "h264",
  width: 1920,
} as const);

/** The single hash of the resolved proof inputs (CR-06). */
export function hashStyleProofInput(props: StyleProofCompositionProps): string {
  return createHash("sha256")
    .update(canonicalStyleProofJson(props))
    .digest("hex");
}

export function buildStyleProofManifest(
  props: StyleProofCompositionProps,
): StyleProofManifest {
  const resolution = resolveStyleProofScenes(
    props.scenes,
    props.selection,
    props.assets,
  );
  if (resolution.issues.length > 0)
    throw new Error(
      `Cannot build a manifest for an unresolved proof composition: ${resolution.issues
        .map((issue) => `${issue.code} at ${issue.fieldPath}`)
        .join(", ")}`,
    );
  const narrationByDataUri = new Map(
    Object.values(styleProofNarrationLibrary).map((track) => [
      track.src,
      track,
    ]),
  );
  return styleProofManifestSchema.parse({
    assets: Object.values(props.assets)
      .map((asset) => ({
        assetId: asset.assetId,
        bytes: styleProofAssetBytes[asset.assetId] ?? 0,
        checksumSha256: asset.checksumSha256,
        kind: asset.kind,
      }))
      .sort((left, right) => left.assetId.localeCompare(right.assetId)),
    audio: props.narrationTracks
      .map((track) => {
        const record = narrationByDataUri.get(track.src);
        if (record === undefined)
          throw new Error(
            `Narration for scene ${track.sceneId} is not a bundled proof track.`,
          );
        return {
          checksumSha256: record.checksumSha256,
          durationMs: track.durationMs,
          sceneId: track.sceneId,
        };
      })
      .sort((left, right) => left.sceneId.localeCompare(right.sceneId)),
    fixtureId: props.fixtureId,
    fonts: styleProofFontFaces.map((face) => ({ ...face })),
    hashPolicy: styleProofHashPolicy,
    implementation: {
      proofImplementationVersion: styleProofImplementationVersion,
      remotionVersion: styleProofRemotionVersion,
    },
    motion: props.motion,
    outputProfile: styleProofOutputProfile,
    pack: props.selection.pack,
    resolvedInputSha256: hashStyleProofInput(props),
    timeline: styleProofTimeline(props.scenes).map((segment) => ({ ...segment })),
    treatments: resolution.scenes
      .map((scene) => ({
        sceneId: scene.scene.id,
        sceneType: scene.sceneType,
        treatmentId: scene.treatment.id,
        treatmentVersion: scene.treatment.version,
      }))
      .sort((left, right) => left.sceneId.localeCompare(right.sceneId)),
  });
}
