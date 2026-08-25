import { registerRoot } from "remotion";
import type { JSX } from "react";
import { VideoDesignPreviewComposition } from "./video-preview-composition.js";

export function RemotionRoot(): JSX.Element {
  return <VideoDesignPreviewComposition />;
}

registerRoot(RemotionRoot);
