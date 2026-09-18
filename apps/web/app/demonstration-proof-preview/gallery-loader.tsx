"use client";

import dynamic from "next/dynamic";

/**
 * ST-095 — keeps the demonstration gallery out of the production client bundle.
 *
 * The gallery pulls in every bundled narration track (~11 MB of base64) plus
 * the Remotion player. The `import()` sits inside a branch that is dead in a
 * production build, so the bundler can drop the chunk entirely rather than
 * merely deferring it, and `ssr: false` keeps the media out of the
 * server-rendered HTML as well.
 */
const DemonstrationProofGallery = dynamic(
  async () =>
    process.env.NODE_ENV === "production"
      ? { default: (): null => null }
      : import("./gallery"),
  {
    ssr: false,
    loading: () => <p>Loading the demonstration proof gallery…</p>,
  },
);

export function DemonstrationProofGalleryLoader() {
  return <DemonstrationProofGallery />;
}
