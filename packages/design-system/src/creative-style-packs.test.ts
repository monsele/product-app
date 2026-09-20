import { describe, expect, it } from "vitest";
import {
  releasedCreativeStylePackVersion,
  releasedCreativeStylePacks,
} from "./creative-style-packs.js";

describe("ST-101 released creative style packs", () => {
  it("pins the three bounded pack releases to bundled font identities", () => {
    expect(Object.keys(releasedCreativeStylePacks)).toEqual([
      "systems",
      "field-notes",
      "prism",
    ]);
    for (const pack of Object.values(releasedCreativeStylePacks)) {
      expect(pack.version).toBe(releasedCreativeStylePackVersion);
      expect(pack.font.file).toMatch(/^@fontsource\//);
      expect(pack.font.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(pack.motionSignature).not.toHaveLength(0);
    }
  });
});
