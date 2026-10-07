import React from "react";
import styles from "./onion-skin-loader.module.css";

export interface OnionSkinLoaderProps {
  /** Rendered size of the square loader in pixels. */
  size?: number | undefined;
  /**
   * Announced to assistive technology. Omit when a visible message next to the
   * loader already describes what is loading.
   */
  label?: string | undefined;
  className?: string | undefined;
}

/**
 * The PageMotion loading indicator. Three pages advance through onion-skin
 * frames, faint to solid, the way an animator flips a page into motion. Use it
 * for page, panel and image loading; real job progress keeps its own
 * percentage indicators.
 */
export function OnionSkinLoader({
  size = 56,
  label,
  className,
}: OnionSkinLoaderProps) {
  return (
    <span
      className={[styles.loader, className ?? ""].filter(Boolean).join(" ")}
      style={{ "--pm-loader-size": `${size}px` } as React.CSSProperties}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span className={styles.page} />
      <span className={styles.page} />
      <span className={styles.page} />
    </span>
  );
}

export interface PageLoadingProps {
  /** Short sentence naming what is loading, e.g. "Opening the storyboard". */
  message: string;
  /** Optional second line with more context. */
  detail?: string | undefined;
  size?: number | undefined;
  className?: string | undefined;
}

/** A centred loading state for routes and panels: the loader plus its message. */
export function PageLoading({
  message,
  detail,
  size = 64,
  className,
}: PageLoadingProps) {
  return (
    <div
      className={[styles.pageLoading, className ?? ""].filter(Boolean).join(" ")}
      role="status"
      aria-live="polite"
    >
      <OnionSkinLoader size={size} />
      <p className={styles.message}>{message}</p>
      {detail ? <p className={styles.detail}>{detail}</p> : null}
    </div>
  );
}
