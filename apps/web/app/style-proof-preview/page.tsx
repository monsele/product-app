import { notFound } from "next/navigation";
import { StyleProofGalleryLoader } from "./gallery-loader";

/**
 * ST-094 — route entry for the development-only creative-style proof gallery.
 *
 * The story authorises a development preview, not a public production route,
 * so this server component refuses the route outside development rather than
 * relying on the gallery being obscure. The heavy gallery module itself is
 * loaded through `gallery-loader`, which keeps it out of the production client
 * bundle.
 *
 * Production lessons remain single-theme (`mvp-default`); nothing here is a
 * product feature.
 */
export default function StyleProofPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <StyleProofGalleryLoader />;
}
