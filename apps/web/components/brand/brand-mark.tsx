import React from "react";
import styles from "./brand.module.css";

/*
 * The PageMotion "Page P" mark on its 64-unit grid. Source files and usage rules
 * live in the brand folder next to the repository (brand/pagemotion).
 */
const MARK_PAGE =
  "M17 14A4 4 0 0 1 21 10H37L47 20V30A6 6 0 0 1 41 36H29A2 2 0 0 0 27 38V49A5 5 0 0 1 17 49Z";
const MARK_FLAP = "M37 10V18.5A1.5 1.5 0 0 0 38.5 20H47Z";

export interface BrandMarkProps {
  /** Rendered height in pixels. */
  size?: number | undefined;
  /** Trims the grid padding so the mark aligns with neighbouring content. */
  cropped?: boolean | undefined;
  /** Folds the corner in a loop. Use only while a real job is running. */
  working?: boolean | undefined;
  /** Accessible name. Omit when visible brand text sits next to the mark. */
  title?: string | undefined;
  className?: string | undefined;
}

export function BrandMark({
  size = 32,
  cropped = false,
  working = false,
  title,
  className,
}: BrandMarkProps) {
  const viewBox = cropped ? "17 10 30 44" : "0 0 64 64";
  const width = cropped ? (size * 30) / 44 : size;
  return (
    <svg
      viewBox={viewBox}
      width={width}
      height={size}
      className={[styles.mark, working ? styles.working : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path className={styles.page} d={MARK_PAGE} />
      <path className={styles.flap} d={MARK_FLAP} />
    </svg>
  );
}
