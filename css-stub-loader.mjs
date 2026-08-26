/**
 * Node.js module-resolution hook that treats .css imports as empty modules.
 * Required because @avlp/scene-library re-exports Remotion components that
 * import @fontsource CSS files, but Node.js (via tsx) cannot handle CSS in
 * server-side processes (API, renderer, pipeline-worker).
 *
 * Usage: node --import ./css-stub-loader.mjs ...
 *   or via NODE_OPTIONS="--import ./css-stub-loader.mjs"
 */
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(specifier, context, nextResolve) {
        if (specifier.endsWith(".css")) {
          return { url: "data:text/javascript,export default {}", shortCircuit: true };
        }
        return nextResolve(specifier, context);
      }
    `),
  import.meta.url,
);
