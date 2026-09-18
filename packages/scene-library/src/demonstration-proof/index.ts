/**
 * ST-095 — the demonstration proof's public surface.
 *
 * Exported from a dedicated subpath (`@avlp/scene-library/demonstration-proof`)
 * rather than the package index, so importing the scene library for production
 * work never pulls the proof's bundled media into the graph, and so a
 * production consumer cannot reach a demonstration plan by accident.
 *
 * `manifest.js` is intentionally NOT re-exported here: it imports `node:crypto`
 * for input hashing, and this surface is consumed by the Next.js development
 * gallery, whose client bundle cannot resolve a `node:` scheme. Node-side
 * callers import it directly at `./demonstration-proof/manifest`.
 */

export * from "./composition.js";
export * from "./fixtures.js";
export * from "./fonts.js";
export * from "./geometry.js";
export * from "./narration.js";
export * from "./plan-builder.js";
export * from "./preview-player.js";
export * from "./primitives.js";
export * from "./registry.js";
export * from "./state.js";
export * from "./validation.js";
export { EvaporationRecipe } from "./recipes/evaporation.js";
export { SavingsRecipe } from "./recipes/savings.js";
export {
  demonstrationAssetLibrary,
  demonstrationAssetBytes,
} from "./assets.generated.js";
export {
  demonstrationNarrationLibrary,
  demonstrationNarrationTrackIds,
  demonstrationTimingProvenance,
  type DemonstrationNarrationRecord,
} from "./narration.generated.js";
