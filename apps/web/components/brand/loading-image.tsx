"use client";

import React, { useEffect, useRef, useState } from "react";
import { OnionSkinLoader } from "./onion-skin-loader";
import styles from "./loading-image.module.css";

export interface LoadingImageProps
  extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** Class for the frame that holds the image and its loader. */
  frameClassName?: string | undefined;
  /** Style for the frame; give it the size the image should occupy. */
  frameStyle?: React.CSSProperties | undefined;
  /** Loader size in pixels. Defaults to a size suited to thumbnails. */
  loaderSize?: number | undefined;
}

/**
 * An image that shows the Onion Skin loader until its bytes arrive, then fades
 * in. A failed image hides the loader and the browser's broken-image icon,
 * so callers keep their own fallbacks.
 */
export function LoadingImage({
  frameClassName,
  frameStyle,
  loaderSize = 40,
  className,
  onLoad,
  onError,
  src,
  alt,
  ...imgProps
}: LoadingImageProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [settled, setSettled] = useState(false);
  const [failed, setFailed] = useState(false);

  // A cached image can finish before hydration attaches onLoad.
  useEffect(() => {
    const image = imageRef.current;
    setFailed(false);
    setSettled(image !== null && image.complete && image.naturalWidth > 0);
  }, [src]);

  return (
    <span
      className={[styles.frame, frameClassName ?? ""].filter(Boolean).join(" ")}
      style={frameStyle}
      data-loaded={settled ? "true" : "false"}
      data-failed={failed ? "true" : undefined}
    >
      {!settled ? (
        <span className={styles.loader}>
          <OnionSkinLoader size={loaderSize} />
        </span>
      ) : null}
      <img
        {...imgProps}
        ref={imageRef}
        src={src}
        alt={alt}
        className={[styles.image, className ?? ""].filter(Boolean).join(" ")}
        onLoad={(event) => {
          setSettled(true);
          onLoad?.(event);
        }}
        onError={(event) => {
          setSettled(true);
          setFailed(true);
          onError?.(event);
        }}
      />
    </span>
  );
}
