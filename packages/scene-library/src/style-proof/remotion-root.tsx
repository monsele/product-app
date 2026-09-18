/**
 * ST-094 — the proof's own Remotion entry point.
 *
 * Deliberately separate from `src/remotion-root.tsx`. The render worker bundles
 * that production root, and nothing here is added to it: no production render
 * identity, bundle size or composition list changes because this proof exists.
 * The proof render scripts and the layout preflight bundle this file instead.
 */

import { Composition, registerRoot } from "remotion";
import type { JSX } from "react";
import { styleProofCanvas } from "@avlp/design-system/style-proof-tokens";
import {
  styleProofCompositionIds,
  StyleProofRenderComposition,
  styleProofDurationInFrames,
} from "./composition.js";
import { conductionProofFixtures, leafProofFixtures } from "./fixtures.js";

export const styleProofLeafCompositionIds = Object.freeze({
  essential: "StyleProofLeafEssential",
  editorial: "StyleProofLeafEditorial",
  everyday: "StyleProofLeafEveryday",
});

export function StyleProofRoot(): JSX.Element {
  return (
    <>
      {(["essential", "editorial", "everyday"] as const).map((packId) => (
        <Composition
          component={StyleProofRenderComposition}
          defaultProps={conductionProofFixtures[packId]}
          durationInFrames={styleProofDurationInFrames(
            conductionProofFixtures[packId].scenes,
          )}
          fps={styleProofCanvas.fps}
          height={styleProofCanvas.height}
          id={styleProofCompositionIds[packId]}
          key={styleProofCompositionIds[packId]}
          width={styleProofCanvas.width}
        />
      ))}
      {(["essential", "editorial", "everyday"] as const).map((packId) => (
        <Composition
          component={StyleProofRenderComposition}
          defaultProps={leafProofFixtures[packId]}
          durationInFrames={styleProofDurationInFrames(
            leafProofFixtures[packId].scenes,
          )}
          fps={styleProofCanvas.fps}
          height={styleProofCanvas.height}
          id={styleProofLeafCompositionIds[packId]}
          key={styleProofLeafCompositionIds[packId]}
          width={styleProofCanvas.width}
        />
      ))}
    </>
  );
}

registerRoot(StyleProofRoot);
