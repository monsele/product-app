/**
 * ST-095 — shared presentation pieces for the two recipes.
 *
 * These carry the `data-demo-*` attributes the browser preflight measures, so
 * a layout regression is caught by a real measurement of wrapped text rather
 * than by a Node-side estimate that cannot see the font.
 */

import type { CSSProperties, JSX, ReactNode } from "react";
import { videoTheme } from "@avlp/design-system/video-theme";
import {
  demonstrationContentAttribute,
  demonstrationObjectAttribute,
  demonstrationRegionAttribute,
} from "./validation.js";
import type { Rect } from "./geometry.js";

export const positioned = (area: Rect): CSSProperties => ({
  position: "absolute",
  left: area.x,
  top: area.y,
  width: area.width,
  height: area.height,
});

export function SceneTitle({
  periodLabel,
  text,
}: Readonly<{ periodLabel?: string | undefined; text: string }>): JSX.Element {
  return (
    <header
      style={{
        alignItems: "baseline",
        display: "flex",
        justifyContent: "space-between",
        left: videoTheme.safeAreas.title.left,
        position: "absolute",
        right: videoTheme.safeAreas.title.right,
        top: videoTheme.safeAreas.title.top - 36,
      }}
    >
      <h1
        {...{ [demonstrationContentAttribute]: "title" }}
        style={{
          color: videoTheme.colors.text,
          fontFamily: videoTheme.typography.fontFamily,
          fontSize: 56,
          fontWeight: 700,
          lineHeight: videoTheme.typography.lineHeight,
          margin: 0,
        }}
      >
        {text}
      </h1>
      {periodLabel === undefined ? null : (
        <span
          {...{ [demonstrationContentAttribute]: "period" }}
          data-testid="demo-period"
          style={{
            background: videoTheme.colors.surface,
            borderRadius: videoTheme.radii.md,
            color: videoTheme.colors.accent,
            fontFamily: videoTheme.typography.fontFamily,
            fontSize: 34,
            fontWeight: 700,
            padding: `${videoTheme.spacing.xs}px ${videoTheme.spacing.md}px`,
          }}
        >
          {periodLabel}
        </span>
      )}
    </header>
  );
}

/** A labelled region — a money tray, a jar, the liquid body. */
export function RegionFrame({
  area,
  children,
  emphasis = 0,
  icon,
  label,
  regionId,
  status,
  tone = "surface",
}: Readonly<{
  area: Rect;
  children?: ReactNode;
  /**
   * A small mark beside the region's heading.
   *
   * The savings jar started as a watermark behind the notes, where it was
   * clipped by the frame edge and read as a stray shape. Beside the heading it
   * does the one job it is good for — saying at a glance which tray this is —
   * without competing with the objects the scene is about.
   */
  icon?: Readonly<{ alt: string; src: string }> | undefined;
  /**
   * A short right-aligned note on the heading row — how much is still to come,
   * how much is arriving.
   *
   * On the heading row rather than inside the frame, because the first version
   * put it inside and travelling notes passed straight through the text. The
   * heading row is the one band in a region that objects never occupy.
   */
  status?: string | undefined;
  /** 0..1 from the evaluated state, so an `emphasise` event naming a container
   * or a region has a visible effect rather than validating into nothing. */
  emphasis?: number;
  label: string;
  regionId: string;
  tone?: "surface" | "accent" | "quiet";
}>): JSX.Element {
  const border =
    tone === "accent"
      ? videoTheme.colors.primary
      : tone === "quiet"
        ? videoTheme.colors.mutedText
        : videoTheme.colors.surface;
  return (
    <section
      {...{ [demonstrationRegionAttribute]: regionId }}
      style={{
        ...positioned(area),
        background:
          tone === "quiet" ? "transparent" : `${videoTheme.colors.surface}66`,
        border: `3px solid ${emphasis > 0 ? videoTheme.colors.accent : border}`,
        borderRadius: videoTheme.radii.md * 1.5,
        // A widening ring rather than a scale or a move: the contents are being
        // read at this moment, and text that shifts while it is read is worse
        // than no emphasis at all.
        boxShadow:
          emphasis > 0
            ? `0 0 0 ${6 * emphasis}px ${videoTheme.colors.accent}33`
            : "none",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          justifyContent: "space-between",
          left: videoTheme.spacing.sm,
          position: "absolute",
          right: videoTheme.spacing.sm,
          top: -46,
        }}
      >
        <span
          {...{ [demonstrationContentAttribute]: `region-label:${regionId}` }}
          style={{
            alignItems: "center",
            color: videoTheme.colors.mutedText,
            display: "flex",
            fontFamily: videoTheme.typography.fontFamily,
            fontSize: 28,
            fontWeight: 700,
            gap: videoTheme.spacing.xs,
            letterSpacing: 0.5,
          }}
        >
          {icon === undefined ? null : (
            <img
              alt={icon.alt}
              src={icon.src}
              style={{ height: 44, objectFit: "contain", width: 44 }}
            />
          )}
          {label}
        </span>
        {status === undefined ? null : (
          <span
            {...{ [demonstrationContentAttribute]: `region-status:${regionId}` }}
            data-testid={`demo-region-status-${regionId}`}
            style={{
              color: videoTheme.colors.accent,
              fontFamily: videoTheme.typography.fontFamily,
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            {status}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * A balance readout.
 *
 * `value` is always passed in from the evaluated ledger — there is no path by
 * which this component could be shown a number the token positions do not
 * agree with.
 */
export function Readout({
  area,
  goalMinor,
  label,
  valueMinor,
  format,
}: Readonly<{
  area: Rect;
  goalMinor?: number | undefined;
  label: string;
  valueMinor: number;
  format: (minor: number) => string;
}>): JSX.Element {
  const progress =
    goalMinor === undefined ? 0 : Math.min(1, valueMinor / goalMinor);
  return (
    <div
      data-testid={`demo-readout-${label.toLowerCase()}`}
      style={{ ...positioned(area) }}
    >
      <p
        {...{ [demonstrationContentAttribute]: `readout-label:${label}` }}
        style={{
          color: videoTheme.colors.mutedText,
          fontFamily: videoTheme.typography.fontFamily,
          fontSize: 26,
          fontWeight: 700,
          margin: 0,
        }}
      >
        {label}
      </p>
      <p
        {...{ [demonstrationContentAttribute]: `readout-value:${label}` }}
        style={{
          color: videoTheme.colors.text,
          fontFamily: videoTheme.typography.fontFamily,
          fontSize: 52,
          fontWeight: 700,
          margin: 0,
          // Tabular figures keep the digits from shifting sideways as a
          // balance changes, so the number reads as counting rather than
          // re-laying-out.
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {format(valueMinor)}
      </p>
      {goalMinor === undefined ? null : (
        <div
          style={{
            background: `${videoTheme.colors.surface}`,
            borderRadius: 8,
            height: 14,
            marginTop: videoTheme.spacing.xs,
            overflow: "hidden",
            width: area.width,
          }}
        >
          <div
            style={{
              background: videoTheme.colors.primary,
              height: "100%",
              width: `${progress * 100}%`,
            }}
          />
        </div>
      )}
      {goalMinor === undefined ? null : (
        <p
          {...{ [demonstrationContentAttribute]: `readout-goal:${label}` }}
          style={{
            color: videoTheme.colors.mutedText,
            fontFamily: videoTheme.typography.fontFamily,
            fontSize: 24,
            margin: `${videoTheme.spacing.xs}px 0 0`,
          }}
        >
          {`Goal ${format(goalMinor)}`}
        </p>
      )}
    </div>
  );
}

/**
 * An authored note. Never composed by a recipe: the text comes from the
 * validated plan, which is what keeps an explanation of a model's limits from
 * being quietly reworded by the renderer.
 */
export function NoteStrip({
  area,
  reveal,
  text,
}: Readonly<{ area: Rect; reveal: number; text: string }>): JSX.Element | null {
  if (reveal <= 0) return null;
  return (
    <aside
      {...{ [demonstrationContentAttribute]: "note" }}
      data-testid="demo-note"
      style={{
        ...positioned(area),
        alignItems: "center",
        background: videoTheme.colors.surface,
        borderLeft: `${videoTheme.lineWidths.emphasis}px solid ${videoTheme.colors.accent}`,
        borderRadius: videoTheme.radii.md,
        boxSizing: "border-box",
        color: videoTheme.colors.text,
        display: "flex",
        fontFamily: videoTheme.typography.fontFamily,
        fontSize: 28,
        lineHeight: videoTheme.typography.lineHeight,
        opacity: reveal,
        padding: `${videoTheme.spacing.sm}px ${videoTheme.spacing.md}px`,
      }}
    >
      {text}
    </aside>
  );
}

/** A moving explanatory object. Marked so the preflight can check it stays on
 * canvas and clear of the caption band at every sampled frame. */
export function ExplanatoryObject({
  children,
  objectId,
  style,
}: Readonly<{
  children: ReactNode;
  objectId: string;
  style: CSSProperties;
}>): JSX.Element {
  return (
    <div
      {...{ [demonstrationObjectAttribute]: objectId }}
      data-testid={`demo-object-${objectId}`}
      style={{ position: "absolute", ...style }}
    >
      {children}
    </div>
  );
}
