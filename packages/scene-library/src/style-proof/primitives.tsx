/**
 * ST-094 — primitives shared by the nine treatments.
 *
 * These are deliberately small. Sharing an image frame and a caption bar keeps
 * asset policy and caption geometry in one place; composition, hierarchy and
 * motion stay in each treatment, which is what makes the three packs different
 * designs rather than one layout with a colour switch.
 */

import type { CSSProperties, JSX, ReactNode } from "react";
import type {
  StyleProofAsset,
  StyleProofAssetSlot,
} from "@avlp/schemas/style-proof";
import {
  styleProofCaptionFamily,
  styleProofCaptionRegion,
  type StyleProofTokens,
} from "@avlp/design-system/style-proof-tokens";
import {
  styleProofContentAttribute,
  styleProofFitAttribute,
  styleProofRegionAttribute,
} from "./validation.js";

/**
 * An asset inside its declared slot.
 *
 * `contain` never crops, so a cutout or a labelled illustration keeps every
 * pixel that carries meaning. `cover` is applied only where a slot declared it,
 * and the focal label chooses `object-position` from a bounded set — a caller
 * cannot supply coordinates.
 */
export function ProofImage({
  asset,
  pack,
  region,
  slot,
  style,
  transform,
}: Readonly<{
  asset: StyleProofAsset;
  pack: StyleProofTokens;
  region: string;
  slot: StyleProofAssetSlot;
  style?: CSSProperties;
  transform?: string;
}>): JSX.Element {
  const treatment = pack.imageTreatment;
  const isRaster = asset.kind === "raster";
  return (
    <div
      {...{ [styleProofRegionAttribute]: region }}
      style={{
        borderRadius: treatment.borderRadius,
        overflow: "hidden",
        position: "relative",
        ...(treatment.borderWidth > 0
          ? {
              border: `${treatment.borderWidth}px solid ${treatment.borderColor}`,
            }
          : {}),
        ...style,
      }}
    >
      <img
        alt={asset.altText}
        data-proof-asset={asset.assetId}
        src={asset.src}
        style={{
          display: "block",
          height: "100%",
          objectFit: slot.fit,
          objectPosition: asset.focal,
          width: "100%",
          // The tonal treatment unifies mixed source exposure. It is applied
          // only to raster evidence: a diagram's factual colour coding must
          // survive a style, so vector artwork is never filtered.
          ...(isRaster && treatment.filter !== "none"
            ? { filter: treatment.filter }
            : {}),
          ...(transform === undefined ? {} : { transform }),
        }}
      />
      {isRaster && treatment.overlay !== "transparent" ? (
        <div
          aria-hidden="true"
          style={{
            background: treatment.overlay,
            inset: 0,
            position: "absolute",
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * A text block that must contain its own content. The `data-proof-fit`
 * attribute names the field path the browser preflight reports when the
 * rendered content exceeds this box.
 */
export function ProofText({
  children,
  fieldPath,
  required = true,
  style,
}: Readonly<{
  children: ReactNode;
  fieldPath: string;
  required?: boolean;
  style?: CSSProperties;
}>): JSX.Element {
  return (
    <div
      {...{ [styleProofFitAttribute]: fieldPath }}
      {...(required ? { [styleProofContentAttribute]: fieldPath } : {})}
      style={{
        overflow: "hidden",
        overflowWrap: "break-word",
        // Descender allowance. The packs set tight display line-heights for
        // rhythm, and at 100px type a glyph's ink overflows its line box by a
        // few pixels; without this reserve `overflow: hidden` would shave the
        // bottom of every descender. The browser preflight measures against
        // this box, so the reserve is part of the fit contract, not padding
        // added to quiet a check.
        paddingBottom: 8,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * The caption plate. Geometry and family are identical in all three packs and
 * match `videoTheme.safeAreas.caption`; only the plate colour is style-tinted.
 * Captions are the one surface where legibility outranks creative direction.
 */
export function ProofCaption({
  pack,
  text,
}: Readonly<{ pack: StyleProofTokens; text: string }>): JSX.Element {
  return (
    <p
      data-testid="style-proof-caption"
      {...{ [styleProofRegionAttribute]: "caption" }}
      style={{
        background: pack.colors.captionPlate,
        borderRadius: 8,
        bottom: styleProofCaptionRegion.bottom,
        color: pack.colors.captionInk,
        fontFamily: styleProofCaptionFamily,
        fontSize: pack.typography.captionSize,
        left: styleProofCaptionRegion.left,
        lineHeight: 1.25,
        margin: 0,
        padding: "14px 24px",
        position: "absolute",
        right: styleProofCaptionRegion.right,
        textAlign: "center",
      }}
    >
      {text}
    </p>
  );
}

/** A pack's small tracked label (`EVIDENCE`, `DEFINITION`, and so on). */
export function ProofLabel({
  children,
  color,
  pack,
  style,
}: Readonly<{
  children: ReactNode;
  color?: string;
  pack: StyleProofTokens;
  style?: CSSProperties;
}>): JSX.Element {
  return (
    <span
      style={{
        color: color ?? pack.colors.accent,
        display: "inline-block",
        fontFamily: pack.typography.bodyFamily,
        fontSize: pack.typography.labelSize,
        fontWeight: pack.typography.labelWeight,
        letterSpacing: pack.typography.labelTracking,
        lineHeight: 1.2,
        textTransform: pack.typography.labelTransform,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/**
 * The source line Editorial prints under its evidence. It reads the scene's
 * existing `sourceRefs`, so attribution comes from the lesson's grounding data
 * rather than from a new style-owned field.
 */
export function formatSourceLine(
  sourceRefs: readonly Readonly<{ pageStart: number; pageEnd?: number | undefined }>[],
  credit: string,
): string {
  const pages = sourceRefs
    .map((ref) =>
      ref.pageEnd === undefined || ref.pageEnd === ref.pageStart
        ? `p.${ref.pageStart}`
        : `pp.${ref.pageStart}-${ref.pageEnd}`,
    )
    .join(", ");
  return pages.length > 0 ? `${credit} · Source ${pages}` : credit;
}
