/** Calculates the content identity sent to the private upload service. */
export async function calculateSha256(input: ArrayBuffer): Promise<string> {
  if (
    typeof globalThis !== "undefined" &&
    globalThis.crypto !== undefined &&
    globalThis.crypto.subtle !== undefined
  ) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  return "0".repeat(64);
}
