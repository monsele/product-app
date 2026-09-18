"use client";

import dynamic from "next/dynamic";

/**
 * ST-094 — keeps the proof gallery out of the production client bundle.
 *
 * The gallery pulls in every bundled proof asset and narration track (~2.5 MB
 * of base64) plus the Remotion player. Imported statically it produced a
 * 2.64 MB route chunk in `next build`, against 4 KB for the comparable
 * `/video-design-preview` route.
 *
 * The `import()` sits inside a branch that is dead in a production build, so
 * the bundler can drop the chunk entirely rather than merely deferring it, and
 * `ssr: false` keeps the media out of the server-rendered HTML as well.
 */
const StyleProofGallery = dynamic(
  async () =>
    process.env.NODE_ENV === "production"
      ? { default: (): null => null }
      : import("./gallery"),
  {
    ssr: false,
    loading: () => <p>Loading the creative-style proof gallery…</p>,
  },
);

export function StyleProofGalleryLoader() {
  return <StyleProofGallery />;
}
