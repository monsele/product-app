import sharp from "sharp";
import { inspectIsolatedDesignSystemPdf } from "./design-system-pdf-isolation.js";
import { inspectIsolatedDesignSystemFont } from "./design-system-font-isolation.js";

export type InspectedDesignSystemAsset = {
  bytes: Uint8Array;
  inspection: Record<string, unknown>;
};

/** Bound JSON complexity before another subsystem uses imported tokens. */
function checkJson(value: unknown, depth = 0, budget = { nodes: 0 }): void {
  if (depth > 8 || ++budget.nodes > 10000)
    throw new Error("Token JSON exceeds complexity limits.");
  if (typeof value === "number" && !Number.isFinite(value))
    throw new Error("Token numbers must be finite.");
  if (typeof value === "string" && value.length > 10000)
    throw new Error("Token value is too long.");
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (["__proto__", "constructor", "prototype"].includes(key))
        throw new Error("Unsafe token key.");
      checkJson(child, depth + 1, budget);
    }
  }
}

/** Only called by the background job; never by ordinary HTTP requests. */
export async function inspectDesignSystemAsset(
  bytes: Uint8Array,
  mediaType: string,
): Promise<InspectedDesignSystemAsset> {
  if (bytes.length === 0 || bytes.length > 10 * 1024 * 1024)
    throw new Error("Invalid file size.");
  if (mediaType.startsWith("font/")) {
    return {
      bytes,
      inspection: await inspectIsolatedDesignSystemFont(bytes, mediaType),
    };
  }
  if (mediaType === "image/png" || mediaType === "image/jpeg") {
    const image = sharp(bytes, { limitInputPixels: 20000000, animated: false });
    const meta = await image.metadata();
    if (
      meta.format !== (mediaType === "image/png" ? "png" : "jpeg") ||
      !meta.width ||
      !meta.height ||
      meta.width > 8000 ||
      meta.height > 8000 ||
      (meta.pages ?? 1) > 1
    )
      throw new Error("Unsupported image dimensions or format.");
    const decoded = image.rotate();
    const result =
      mediaType === "image/png"
        ? await decoded.png().toBuffer()
        : await decoded.jpeg().toBuffer();
    if (result.length > 10 * 1024 * 1024)
      throw new Error("Decoded image is too large.");
    return {
      bytes: result,
      inspection: {
        kind: "image",
        width: meta.autoOrient.width,
        height: meta.autoOrient.height,
      },
    };
  }
  if (mediaType === "application/pdf") {
    return { bytes, inspection: await inspectIsolatedDesignSystemPdf(bytes) };
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (text.length > 100000 || text.includes(String.fromCharCode(0)))
    throw new Error("Text import is invalid or too long.");
  if (mediaType === "application/json") {
    const tokens: unknown = JSON.parse(text);
    if (!tokens || typeof tokens !== "object" || Array.isArray(tokens))
      throw new Error("Tokens must be a JSON object.");
    checkJson(tokens);
    return { bytes, inspection: { kind: "tokens", tokens } };
  }
  if (mediaType !== "text/markdown")
    throw new Error("Unsupported import type.");
  return {
    bytes,
    inspection: { kind: "markdown", characterCount: text.length },
  };
}
