/**
 * ST-095 — the reproducibility manifest (CR-02).
 *
 * Node-only: it hashes with `node:crypto`, so it is deliberately not part of
 * the browser-safe `./demonstration-proof` surface. The render scripts and the
 * contract tests import it directly at `./demonstration-proof/manifest`.
 *
 * `approach` is part of the identity rather than metadata. The same facts
 * rendered the two ways are two different outputs, and a render identity that
 * could not tell them apart would let one be served for the other (CR-06).
 */

import { createHash } from "node:crypto";
import {
  canonicalDemonstrationJson,
  demonstrationHashPolicy,
  demonstrationManifestSchema,
  demonstrationPlanVersion,
  demonstrationRecipeVersion,
  type DemonstrationApproach,
  type DemonstrationCompositionProps,
  type DemonstrationManifest,
} from "@avlp/schemas/demonstration-proof";
import { videoFont } from "@avlp/design-system/video-theme";
import { demonstrationAssetBytes } from "./assets.generated.js";
import { demonstrationTimeline } from "./composition.js";

/** Pinned faces, with the checksums of the exact files that are bundled. */
export const demonstrationFontFaces = Object.freeze([
  Object.freeze({
    checksumSha256: "",
    family: videoFont.family,
    file: "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2",
    style: "normal" as const,
    weight: 400,
  }),
  Object.freeze({
    checksumSha256: "",
    family: videoFont.family,
    file: "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2",
    style: "normal" as const,
    weight: 700,
  }),
]);

export const demonstrationImplementationVersion =
  `st-095-demonstration-proof@${demonstrationPlanVersion}+recipes@${demonstrationRecipeVersion}` as const;

/** sha256 over the one canonical serialisation, per CR-06. */
export function hashDemonstrationInput(value: unknown): string {
  return createHash("sha256")
    .update(canonicalDemonstrationJson(value))
    .digest("hex");
}

export function buildDemonstrationManifest(
  props: DemonstrationCompositionProps,
  options: Readonly<{
    approach: DemonstrationApproach;
    fontChecksums: Readonly<Record<string, string>>;
    remotionVersion: string;
  }>,
): DemonstrationManifest {
  return demonstrationManifestSchema.parse({
    approach: options.approach,
    assets: Object.values(props.assets).map((asset) => ({
      assetId: asset.assetId,
      bytes: demonstrationAssetBytes[asset.assetId] ?? 0,
      checksumSha256: asset.checksumSha256,
    })),
    audio: props.narrationTracks.map((entry) => ({
      beatCount: entry.beats.length,
      checksumSha256: entry.checksumSha256,
      durationMs: entry.durationMs,
      sceneId: entry.sceneId,
      timingMethod: entry.timingProvenance.method,
    })),
    fixtureId: props.fixtureId,
    fonts: demonstrationFontFaces.map((face) => ({
      ...face,
      checksumSha256: options.fontChecksums[face.file] ?? face.checksumSha256,
    })),
    hashPolicy: demonstrationHashPolicy,
    implementation: {
      proofImplementationVersion: demonstrationImplementationVersion,
      remotionVersion: options.remotionVersion,
    },
    outputProfile: {
      audioCodec: "aac",
      fps: 30,
      height: 1080,
      pixelFormat: "yuv420p",
      videoCodec: "h264",
      width: 1920,
    },
    plans: props.scenes.map((scene) => ({
      eventCount: scene.plan.events.length,
      planVersion: scene.plan.planVersion,
      recipeId: scene.plan.recipe.id,
      recipeVersion: scene.plan.recipe.version,
      sceneId: scene.id,
      seed: scene.plan.seed,
    })),
    resolvedInputSha256: hashDemonstrationInput(props),
    themeId: "mvp-default",
    timeline: demonstrationTimeline(props.scenes).map((segment) => ({ ...segment })),
  });
}
