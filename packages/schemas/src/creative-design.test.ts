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

describe("ST-100 creative-design contract", () => {
  it("registers two bounded compositions for every style pack and all ten scene types", () => {
    expect(creativeDesignCatalogue).toHaveLength(60);
    for (const pack of ["essential", "editorial", "everyday"] as const)
      for (const scene of [
        "hook",
        "definition",
        "process",
        "input-process-output",
        "comparison",
        "cause-effect",
        "labelled-diagram",
        "analogy",
        "worked-example",
        "summary",
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

  it("applies lesson-level rhythm arc and hold frames across diverse scene types", () => {
    const scenes = [
      { id: id("10"), template: "hook" as const, durationSeconds: 8 },
      { id: id("11"), template: "input-process-output" as const, durationSeconds: 8 },
      { id: id("12"), template: "cause-effect" as const, durationSeconds: 8 },
      { id: id("13"), template: "labelled-diagram" as const, durationSeconds: 8 },
      { id: id("14"), template: "worked-example" as const, durationSeconds: 10 },
      { id: id("15"), template: "summary" as const, durationSeconds: 8 },
    ];
    const planned = planCreativeDesign({ packId: "editorial", scenes });
    expect(planned[id("10")]!.treatmentId).toBe("editorial.hook.primary"); // opener prefers question
    expect(planned[id("10")]!.requiredHoldFrames).toBe(60);
    expect(planned[id("11")]!.requiredHoldFrames).toBe(75);
    expect(planned[id("12")]!.requiredHoldFrames).toBe(90);
    expect(planned[id("13")]!.requiredHoldFrames).toBe(90);
    expect(planned[id("14")]!.requiredHoldFrames).toBe(105);
    expect(planned[id("15")]!.treatmentId).toBe("editorial.summary.primary"); // resolution prefers recap-cards
    expect(planned[id("15")]!.requiredHoldFrames).toBe(80);
  });

  it("preserves a valid teacher lock and rejects a lock that no longer fits", () => {
    const scene = {
      id: id("04"),
      template: "worked-example" as const,
      durationSeconds: 8,
    };
    expect(
      planCreativeDesign({
        packId: "everyday",
        scenes: [scene],
        locks: { [scene.id]: "everyday.worked-example.alternate" },
      })[scene.id]!.locked,
    ).toBe(true);
    expect(() =>
      planCreativeDesign({
        packId: "everyday",
        scenes: [{ ...scene, durationSeconds: 3 }],
        locks: { [scene.id]: "everyday.worked-example.alternate" },
      }),
    ).toThrow("preserve its lock as a conflict");
  });

  it("fails closed for unsupported approaches and invalid templates while accepting all ten semantic templates", () => {
    expect(
      creativeDesignCapability({
        approach: "demonstration",
        scenes: [{ id: id("05"), template: "summary", durationSeconds: 8 }],
      }),
    ).toContain(
      "Creative styles currently support the standard video approach only.",
    );
    expect(
      creativeDesignCapability({
        approach: "standard",
        scenes: [{ id: id("05"), template: "unknown-template", durationSeconds: 8 }],
      }),
    ).toContain("Scene 0198d270-0000-7000-8000-00000000005 uses unsupported template unknown-template.");
    // All 10 templates pass under standard approach
    const allTen = [
      "hook",
      "definition",
      "process",
      "input-process-output",
      "comparison",
      "cause-effect",
      "labelled-diagram",
      "analogy",
      "worked-example",
      "summary",
    ].map((template, idx) => ({
      id: id(`0${idx}`),
      template,
      durationSeconds: 10,
    }));
    expect(
      creativeDesignCapability({
        approach: "standard",
        scenes: allTen,
      }),
    ).toHaveLength(0);
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
