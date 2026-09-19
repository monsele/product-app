import { describe, expect, it } from "vitest";
import {
  canonicalCreativeDesignJson,
  createDefaultCreativeDesignManifest,
  creativeDesignHash,
} from "./creative-design.js";

describe("ST-097 creative design identity", () => {
  it("uses a canonical hash independent of object-key insertion order", () => {
    expect(canonicalCreativeDesignJson({ b: 2, a: { z: 1, y: 2 } })).toBe(
      canonicalCreativeDesignJson({ a: { y: 2, z: 1 }, b: 2 }),
    );
    expect(creativeDesignHash({ b: 2, a: 1 })).toBe(
      creativeDesignHash({ a: 1, b: 2 }),
    );
  });

  it("creates a resolved, standard-only manifest without a mutable preset lookup", () => {
    const manifest = createDefaultCreativeDesignManifest({
      packId: "editorial",
      scenes: [
        {
          id: "0198d270-0000-7000-8000-000000000001",
          template: "process",
          durationSeconds: 8,
        },
      ],
    });
    expect(manifest.approach).toBe("standard");
    expect(manifest.presetVersionId).toBeNull();
    expect(
      manifest.selections["0198d270-0000-7000-8000-000000000001"]!.treatmentId,
    ).toMatch(/^editorial\.process\./);
  });
});
