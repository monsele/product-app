import { describe, expect, it } from "vitest";
import { calculateSha256 } from "./source-upload-checksum";

describe("calculateSha256", () => {
  it("calculates the stable SHA-256 checksum for uploaded bytes", async () => {
    await expect(
      calculateSha256(new TextEncoder().encode("abc").buffer),
    ).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
