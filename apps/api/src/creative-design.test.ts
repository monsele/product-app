import { describe, expect, it } from "vitest";
import {
  canonicalCreativeDesignJson,
  createDefaultCreativeDesignManifest,
  creativeDesignHash,
  hasCreativeDesignDraftEditConflict,
  parseStoredCreativeDesignManifest,
} from "./creative-design.js";
import {
  creativeDesignManifestSchema,
  creativeDesignPlannerVersion,
  legacyCreativeDesignPlannerVersion,
} from "@avlp/schemas";

describe("ST-097 creative design identity", () => {
  it("revalidates a draft against content revisions without treating them as concurrent design edits", () => {
    expect(
      hasCreativeDesignDraftEditConflict({
        currentRevision: 1,
        expectedRevision: 1,
      }),
    ).toBe(false);
    expect(
      hasCreativeDesignDraftEditConflict({
        currentRevision: 2,
        expectedRevision: 1,
      }),
    ).toBe(true);
  });

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

  it("creates a resolved manifest across newly supported semantic scene types", () => {
    const manifest = createDefaultCreativeDesignManifest({
      packId: "essential",
      scenes: [
        {
          id: "0198d270-0000-7000-8000-000000000010",
          template: "input-process-output",
          durationSeconds: 8,
        },
        {
          id: "0198d270-0000-7000-8000-000000000011",
          template: "cause-effect",
          durationSeconds: 8,
        },
        {
          id: "0198d270-0000-7000-8000-000000000012",
          template: "labelled-diagram",
          durationSeconds: 8,
        },
        {
          id: "0198d270-0000-7000-8000-000000000013",
          template: "analogy",
          durationSeconds: 8,
        },
        {
          id: "0198d270-0000-7000-8000-000000000014",
          template: "worked-example",
          durationSeconds: 10,
        },
        {
          id: "0198d270-0000-7000-8000-000000000015",
          template: "summary",
          durationSeconds: 8,
        },
      ],
    });
    expect(
      manifest.selections["0198d270-0000-7000-8000-000000000010"]!.treatmentId,
    ).toMatch(/^essential\.input-process-output\./);
    expect(
      manifest.selections["0198d270-0000-7000-8000-000000000011"]!.treatmentId,
    ).toMatch(/^essential\.cause-effect\./);
    expect(
      manifest.selections["0198d270-0000-7000-8000-000000000012"]!.treatmentId,
    ).toMatch(/^essential\.labelled-diagram\./);
    expect(
      manifest.selections["0198d270-0000-7000-8000-000000000013"]!.treatmentId,
    ).toMatch(/^essential\.analogy\./);
    expect(
      manifest.selections["0198d270-0000-7000-8000-000000000014"]!.treatmentId,
    ).toMatch(/^essential\.worked-example\./);
    expect(
      manifest.selections["0198d270-0000-7000-8000-000000000015"]!.treatmentId,
    ).toMatch(/^essential\.summary\./);
  });

  it("recovers an expanded pilot draft that was incorrectly labelled ST-097", () => {
    const manifest = createDefaultCreativeDesignManifest({
      packId: "essential",
      scenes: [
        {
          id: "0198d270-0000-7000-8000-000000000030",
          template: "labelled-diagram",
          durationSeconds: 30,
        },
        {
          id: "0198d270-0000-7000-8000-000000000031",
          template: "worked-example",
          durationSeconds: 25,
        },
        {
          id: "0198d270-0000-7000-8000-000000000032",
          template: "summary",
          durationSeconds: 20,
        },
      ],
    });
    const incorrectlyLabelled = {
      ...manifest,
      plannerVersion: legacyCreativeDesignPlannerVersion,
    };

    expect(creativeDesignManifestSchema.safeParse(incorrectlyLabelled).success).toBe(
      false,
    );
    expect(parseStoredCreativeDesignManifest(incorrectlyLabelled)).toEqual({
      ...manifest,
      plannerVersion: creativeDesignPlannerVersion,
    });
  });

  it("creates a Systems manifest through the same bounded standard-design path", () => {
    const manifest = createDefaultCreativeDesignManifest({
      packId: "systems",
      scenes: [
        {
          id: "0198d270-0000-7000-8000-000000000020",
          template: "cause-effect",
          durationSeconds: 8,
        },
      ],
    });
    expect(manifest.pack).toEqual({ id: "systems", version: "1.0.0" });
    expect(
      manifest.selections["0198d270-0000-7000-8000-000000000020"]!.treatmentId,
    ).toMatch(/^systems\.cause-effect\./);
  });
});
