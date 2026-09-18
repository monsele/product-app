/**
 * ST-094 — the proof's public surface.
 *
 * Exported from a dedicated subpath (`@avlp/scene-library/style-proof`) rather
 * than the package index, so importing the scene library for production work
 * never pulls the proof's bundled media into the graph, and so a production
 * consumer cannot reach a proof pack by accident.
 */

/**
 * `manifest.js` is intentionally NOT re-exported here. It imports `node:crypto`
 * for input hashing, and this surface is consumed by the Next.js development
 * gallery, whose client bundle cannot resolve a `node:` scheme. Node-side
 * callers (the render scripts and the contract tests) import it directly.
 */
export * from "./composition.js";
export * from "./fixtures.js";
export * from "./fonts.js";
export * from "./motion.js";
export * from "./preview-player.js";
export * from "./primitives.js";
export * from "./registry.js";
export * from "./resolver.js";
export * from "./treatments/index.js";
export * from "./validation.js";
export { styleProofAssetLibrary, styleProofAssetBytes } from "./assets.generated.js";
export { styleProofNarrationLibrary } from "./narration.generated.js";
