import { describe, expect, it } from "vitest";
import {
  creativeDesignCapability,
  creativeDesignCatalogue,
  creativeDesignManifestSchema,
  creativeDesignContrastRatio,
  defaultCreativeDesignSettings,
  planCreativeDesign,
  validateCreativeDesignManifest,
} from "./creative-design.js";

const id = (tail: string) => `0198d270-0000-7000-8000-000000000${tail}`;

describe("ST-097 creative-design contract", () => {
  it("registers two bounded compositions for every pilot pack and scene type", () => {
    expect(creativeDesignCatalogue).toHaveLength(24);
    for (const pack of ["essential", "editorial", "everyday"] as const)
      for (const scene of [
        "hook",
        "definition",
        "process",
        "comparison",
      ] as const)
        expect(
          creativeDesignCatalogue.filter(
            (entry) => entry.packId === pack && entry.sceneType === scene,
          ),
        ).toHaveLength(2);
  });

  it("plans deterministically and avoids an unnecessary repeated composition family", () => {
    const scenes = [
      { id: id("01"), template: "hook" as const, durationSeconds: 8 },
      { id: id("02"), template: "hook" as const, durationSeconds: 8 },
      { id: id("03"), template: "process" as const, durationSeconds: 8 },
    ];
    const first = planCreativeDesign({ packId: "essential", scenes });
    expect(planCreativeDesign({ packId: "essential", scenes })).toEqual(first);
    expect(first[id("01")]!.treatmentId).not.toBe(first[id("02")]!.treatmentId);
  });

  it("preserves a valid teacher lock and rejects a lock that no longer fits", () => {
    const scene = {
      id: id("04"),
      template: "process" as const,
      durationSeconds: 8,
    };
    expect(
      planCreativeDesign({
        packId: "everyday",
        scenes: [scene],
        locks: { [scene.id]: "everyday.process.alternate" },
      })[scene.id]!.locked,
    ).toBe(true);
    expect(() =>
      planCreativeDesign({
        packId: "everyday",
        scenes: [{ ...scene, durationSeconds: 3 }],
        locks: { [scene.id]: "everyday.process.alternate" },
      }),
    ).toThrow("preserve its lock as a conflict");
  });

  it("fails closed for unsupported scenes and approaches", () => {
    expect(
      creativeDesignCapability({
        approach: "demonstration",
        scenes: [{ id: id("05"), template: "summary", durationSeconds: 8 }],
      }),
    ).toHaveLength(2);
  });

  it("rejects arbitrary model styling instructions at the schema boundary", () => {
    expect(
      creativeDesignManifestSchema.safeParse({
        manifestVersion: "1.0",
        plannerVersion: "st-097-planner-v1",
        pack: { id: "essential", version: "1.0.0" },
        approach: "standard",
        settings: {
          ...defaultCreativeDesignSettings,
          css: "position: absolute",
        },
        selections: {},
        presetVersionId: null,
      }).success,
    ).toBe(false);
  });

  it("preflights accessibility contrast and complete scene selections", () => {
    const scene = { id: id("006"), template: "hook" as const, durationSeconds: 8 };
    const manifest = creativeDesignManifestSchema.parse({
      manifestVersion: "1.0",
      plannerVersion: "st-097-planner-v1",
      pack: { id: "essential", version: "1.0.0" },
      approach: "standard",
      settings: { ...defaultCreativeDesignSettings, colors: { ...defaultCreativeDesignSettings.colors, text: "#ffffff", background: "#ffffff" } },
      selections: planCreativeDesign({ packId: "essential", scenes: [scene] }),
      presetVersionId: null,
    });
    expect(creativeDesignContrastRatio("#000000", "#ffffff")).toBeCloseTo(21);
    expect(validateCreativeDesignManifest(manifest, [scene])).toContain(
      "Text color must have at least 4.5:1 contrast against the background.",
    );
  });
});
