import { notFound } from "next/navigation";
import { DemonstrationProofGalleryLoader } from "./gallery-loader";

/**
 * ST-095 — route entry for the development-only demonstration proof gallery.
 *
 * The story authorises a development preview, not a public production route,
 * so this server component refuses the route outside development rather than
 * relying on the gallery being obscure. The heavy gallery module itself is
 * loaded through `gallery-loader`, which keeps it out of the production client
 * bundle.
 *
 * Nothing here is a product feature: approach selection, tenant-owned
 * variants and comparison playback belong to ST-096.
 */
export default function DemonstrationProofPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DemonstrationProofGalleryLoader />;
}
