/**
 * ST-094 — creative-style proof tokens.
 *
 * These are development-proof tokens only. `videoTheme` remains the single
 * production theme (`mvp-default`) and is not read, wrapped or altered here;
 * treatments receive a pack explicitly rather than through a provider, so the
 * default behaviour of every existing scene is untouched.
 *
 * Tokens describe appearance. Composition, hierarchy and frame computation
 * belong to the treatment components in `@avlp/scene-library`, which is why
 * three palettes alone can never satisfy the story's distinction criteria.
 */

import { VIDEO_FPS, VIDEO_HEIGHT, VIDEO_WIDTH } from "./video-theme.js";

export const styleProofPackVersion = "1.0.0" as const;

export type StyleProofPackId = "essential" | "editorial" | "everyday";

/**
 * Captions share one exclusion region and one highly legible family across all
 * three packs. A style may tint its caption plate, but caption geometry and
 * font are deliberately not style-variable: legibility is not a creative
 * decision. The region matches `videoTheme.safeAreas.caption` so proof output
 * stays comparable with `mvp-default` output.
 */
export const styleProofCaptionRegion = Object.freeze({
  bottom: 96,
  left: 240,
  right: 240,
  /** Top edge of the caption plate in canvas coordinates. */
  top: 876,
});

export const styleProofCanvas = Object.freeze({
  fps: VIDEO_FPS,
  height: VIDEO_HEIGHT,
  width: VIDEO_WIDTH,
});

export type StyleProofFontFace = Readonly<{
  checksumSha256: string;
  family: string;
  file: string;
  style: "normal" | "italic";
  weight: number;
}>;

/**
 * Pinned font files. Checksums are of the bundled `.woff2` bytes at the pinned
 * package versions, so a font update becomes a visible manifest change rather
 * than a silent appearance change (CR-03).
 */
export const styleProofFontFaces: readonly StyleProofFontFace[] = Object.freeze(
  [
    {
      checksumSha256:
        "8909904ab6c872eb994093482a88a28eca2cd95912d7b6fecd72103b0dc07edc",
      family: "Inter",
      file: "@fontsource/inter/files/inter-latin-400-normal.woff2",
      style: "normal",
      weight: 400,
    },
    {
      checksumSha256:
        "f9a06e79cd3a2a20951c0f0e28f66dd0e6d3fda73911d640a2125c8fcb78f21a",
      family: "Inter",
      file: "@fontsource/inter/files/inter-latin-600-normal.woff2",
      style: "normal",
      weight: 600,
    },
    {
      checksumSha256:
        "6f56409fd3d64bb85f7d070bce20749db2d66b6d63cec586cc22d1c761be2491",
      family: "Inter",
      file: "@fontsource/inter/files/inter-latin-700-normal.woff2",
      style: "normal",
      weight: 700,
    },
    {
      checksumSha256:
        "02194deb92d3975dd30e11a3824a1f1db32b48c93654e60560cb81ce8e7b5f95",
      family: "Source Serif 4",
      file: "@fontsource/source-serif-4/files/source-serif-4-latin-400-normal.woff2",
      style: "normal",
      weight: 400,
    },
    {
      checksumSha256:
        "f2b7e1cf1d277b7608231868135648f8ad8e2b58d8e97ca088bee15dc357bee7",
      family: "Source Serif 4",
      file: "@fontsource/source-serif-4/files/source-serif-4-latin-600-normal.woff2",
      style: "normal",
      weight: 600,
    },
    {
      checksumSha256:
        "7691c51bc286a9014db0048277d2c3f2ad0a90b533dc8adfb16cb22a95390d39",
      family: "Source Serif 4",
      file: "@fontsource/source-serif-4/files/source-serif-4-latin-700-normal.woff2",
      style: "normal",
      weight: 700,
    },
    {
      checksumSha256:
        "a5906e15ceb68f73d3b2c2076b4057c3f6ed401186d56283b45ce12944ca0735",
      family: "Nunito",
      file: "@fontsource/nunito/files/nunito-latin-400-normal.woff2",
      style: "normal",
      weight: 400,
    },
    {
      checksumSha256:
        "fa89300b9bbb3bd0f60d6991aa055965d98e2ccca27bf8688fe0c39cdc796846",
      family: "Nunito",
      file: "@fontsource/nunito/files/nunito-latin-700-normal.woff2",
      style: "normal",
      weight: 700,
    },
    {
      checksumSha256:
        "d64ba838ef5472bba248620ec4fd8b5aa7cf0db2908e0bb230600caf279ba7bc",
      family: "Atkinson Hyperlegible",
      file: "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2",
      style: "normal",
      weight: 400,
    },
    {
      checksumSha256:
        "140e2bd25a7315c8a062508391426b0d8c3297400c947b8d847be28f73a199f0",
      family: "Atkinson Hyperlegible",
      file: "@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2",
      style: "normal",
      weight: 700,
    },
  ],
);

/** The caption family, shared by every pack. */
export const styleProofCaptionFamily =
  '"Atkinson Hyperlegible", Arial, sans-serif' as const;

export type StyleProofImageTreatment = Readonly<{
  /** Deterministic CSS filter applied to raster evidence only. */
  filter: string;
  borderRadius: number;
  borderWidth: number;
  borderColor: string;
  /** Overlay tint laid over raster evidence to unify mixed source exposure. */
  overlay: string;
}>;

export type StyleProofTokens = Readonly<{
  id: StyleProofPackId;
  version: typeof styleProofPackVersion;
  label: string;
  /** Prose statement of the pack's authored motion behaviour (AC11). */
  motionSignature: "masked-reveal" | "image-push-annotation" | "object-settle";
  motionSignatureDescription: string;
  colors: Readonly<{
    background: string;
    surface: string;
    ink: string;
    mutedInk: string;
    accent: string;
    rule: string;
    captionPlate: string;
    captionInk: string;
  }>;
  typography: Readonly<{
    displayFamily: string;
    bodyFamily: string;
    displaySize: number;
    displayWeight: number;
    displayTracking: number;
    displayLineHeight: number;
    bodySize: number;
    bodyWeight: number;
    bodyLineHeight: number;
    labelSize: number;
    labelWeight: number;
    labelTracking: number;
    labelTransform: "none" | "uppercase";
    captionSize: number;
  }>;
  spacing: Readonly<{ xs: number; sm: number; md: number; lg: number; xl: number }>;
  /** Outer content inset; each treatment composes within it. */
  frame: Readonly<{ left: number; top: number; right: number; bottom: number }>;
  imageTreatment: StyleProofImageTreatment;
  /** Cubic-bezier control points used by this pack's authored motion. */
  easing: Readonly<{
    entrance: readonly [number, number, number, number];
    exit: readonly [number, number, number, number];
    emphasis: readonly [number, number, number, number];
  }>;
}>;

const essential: StyleProofTokens = Object.freeze({
  id: "essential",
  version: styleProofPackVersion,
  label: "Essential",
  motionSignature: "masked-reveal",
  motionSignatureDescription:
    "Content arrives behind a single-axis clip mask and then stops completely; nothing moves during the explanation hold.",
  colors: {
    background: "#F7F5F0",
    surface: "#ECE8E0",
    ink: "#14161A",
    mutedInk: "#5A6068",
    accent: "#B4451F",
    rule: "#14161A",
    captionPlate: "#14161AE6",
    captionInk: "#F7F5F0",
  },
  typography: {
    displayFamily: '"Inter", Arial, sans-serif',
    bodyFamily: '"Inter", Arial, sans-serif',
    displaySize: 104,
    displayWeight: 700,
    displayTracking: -3,
    displayLineHeight: 1.04,
    bodySize: 40,
    bodyWeight: 400,
    bodyLineHeight: 1.35,
    labelSize: 24,
    labelWeight: 600,
    labelTracking: 6,
    labelTransform: "uppercase" as const,
    captionSize: 34,
  },
  spacing: { xs: 12, sm: 24, md: 48, lg: 88, xl: 136 },
  frame: { left: 152, top: 128, right: 152, bottom: 268 },
  imageTreatment: {
    filter: "none",
    borderRadius: 0,
    borderWidth: 0,
    borderColor: "transparent",
    overlay: "transparent",
  },
  easing: {
    entrance: [0.16, 1, 0.3, 1] as const,
    exit: [0.7, 0, 0.84, 0] as const,
    emphasis: [0.33, 1, 0.68, 1] as const,
  },
});

const editorial: StyleProofTokens = Object.freeze({
  id: "editorial",
  version: styleProofPackVersion,
  label: "Editorial",
  motionSignature: "image-push-annotation",
  motionSignatureDescription:
    "The evidence image drifts continuously across its own frame while annotation rules draw out from it and labels wipe in behind them.",
  colors: {
    background: "#12110F",
    surface: "#1E1C19",
    ink: "#F4F1EA",
    mutedInk: "#A9A399",
    accent: "#D8A23B",
    rule: "#D8A23B",
    captionPlate: "#12110FE6",
    captionInk: "#F4F1EA",
  },
  typography: {
    displayFamily: '"Source Serif 4", Georgia, serif',
    bodyFamily: '"Inter", Arial, sans-serif',
    displaySize: 82,
    displayWeight: 700,
    displayTracking: -1,
    // Source Serif 4 has deeper descenders than the grotesques; 1.1 clipped
    // them at display size, which the browser layout preflight caught.
    displayLineHeight: 1.18,
    bodySize: 34,
    bodyWeight: 400,
    bodyLineHeight: 1.45,
    labelSize: 21,
    labelWeight: 600,
    labelTracking: 3,
    labelTransform: "uppercase" as const,
    captionSize: 34,
  },
  spacing: { xs: 10, sm: 20, md: 36, lg: 64, xl: 104 },
  frame: { left: 104, top: 96, right: 104, bottom: 252 },
  imageTreatment: {
    filter: "saturate(0.82) contrast(1.08) brightness(0.96)",
    borderRadius: 4,
    borderWidth: 0,
    borderColor: "transparent",
    overlay:
      "linear-gradient(180deg, rgba(18,17,15,0) 46%, rgba(18,17,15,0.78) 100%)",
  },
  easing: {
    entrance: [0.25, 0.46, 0.45, 0.94] as const,
    exit: [0.55, 0.06, 0.68, 0.19] as const,
    emphasis: [0.4, 0, 0.2, 1] as const,
  },
});

const everyday: StyleProofTokens = Object.freeze({
  id: "everyday",
  version: styleProofPackVersion,
  label: "Everyday",
  motionSignature: "object-settle",
  motionSignatureDescription:
    "Whole illustrated objects travel a short distance into place and settle with a single damped overshoot; labels follow their object.",
  colors: {
    background: "#FFF6E8",
    surface: "#FFFFFF",
    ink: "#28303B",
    mutedInk: "#5C6B7E",
    accent: "#EF6C4D",
    rule: "#2AA198",
    captionPlate: "#28303BE6",
    captionInk: "#FFF6E8",
  },
  typography: {
    displayFamily: '"Nunito", "Trebuchet MS", sans-serif',
    bodyFamily: '"Nunito", "Trebuchet MS", sans-serif',
    displaySize: 76,
    displayWeight: 700,
    displayTracking: -0.5,
    displayLineHeight: 1.18,
    bodySize: 38,
    bodyWeight: 400,
    bodyLineHeight: 1.4,
    labelSize: 26,
    labelWeight: 700,
    labelTracking: 0,
    labelTransform: "none" as const,
    captionSize: 34,
  },
  spacing: { xs: 14, sm: 26, md: 44, lg: 72, xl: 112 },
  frame: { left: 128, top: 112, right: 128, bottom: 258 },
  imageTreatment: {
    filter: "none",
    borderRadius: 32,
    borderWidth: 6,
    borderColor: "#28303B",
    overlay: "transparent",
  },
  easing: {
    entrance: [0.34, 1.32, 0.64, 1] as const,
    exit: [0.36, 0, 0.66, -0.2] as const,
    emphasis: [0.34, 1.56, 0.64, 1] as const,
  },
});

export const styleProofPacks: Readonly<
  Record<StyleProofPackId, StyleProofTokens>
> = Object.freeze({ essential, editorial, everyday });

export const styleProofPackIds: readonly StyleProofPackId[] = Object.freeze([
  "essential",
  "editorial",
  "everyday",
]);

export function getStyleProofPack(id: StyleProofPackId): StyleProofTokens {
  return styleProofPacks[id];
}
