import type { StyleProofMotionParams } from "@avlp/schemas/style-proof";
import type { StyleProofTokens } from "@avlp/design-system/style-proof-tokens";
import type { ResolvedStyleProofScene } from "../resolver.js";

/**
 * Everything a treatment is given. Note what is absent: no style flags, no
 * layout overrides, no coordinates. A treatment receives resolved content,
 * resolved assets, its pack's tokens and the current frame, and owns every
 * decision about where things go.
 */
export type StyleProofTreatmentProps = Readonly<{
  frame: number;
  motion: StyleProofMotionParams;
  pack: StyleProofTokens;
  resolved: ResolvedStyleProofScene;
}>;

export const proofCanvasWidth = 1920;
export const proofCanvasHeight = 1080;
