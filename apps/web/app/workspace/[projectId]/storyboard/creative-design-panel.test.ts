import { describe, expect, it } from "vitest";
import {
  createDefaultCreativeDesignManifest,
  createDefaultStoryboardSceneSpec,
  planCinemaDesign,
} from "@avlp/schemas";
import {
  creativeDesignApplyBlockers,
  creativeDesignErrorMessage,
  creativeDesignPlanExpectedRevision,
  creativeDesignStatus,
  selectedLayoutName,
} from "./creative-design-panel";

describe("creativeDesignPlanExpectedRevision", () => {
  it("creates a design only when no draft exists", () => {
    expect(creativeDesignPlanExpectedRevision(null)).toBe(0);
  });

  it("updates an existing draft using its current revision", () => {
    expect(creativeDesignPlanExpectedRevision({ revision: 1 })).toBe(1);
    expect(creativeDesignPlanExpectedRevision({ revision: 7 })).toBe(7);
  });

  it("keeps preflight details available when an API error includes them", () => {
    expect(
      creativeDesignErrorMessage(
        {
          error: {
            fieldErrors: {
              "issues.0": "A required storyboard asset has not been bound.",
            },
            message:
              "This lesson cannot use the selected creative style yet. Existing design remains unchanged.",
          },
        },
        "fallback",
      ),
    ).toContain("A required storyboard asset has not been bound.");
  });
});

describe("creativeDesignStatus", () => {
  const manifest = createDefaultCreativeDesignManifest({
    packId: "field-notes",
    scenes: [
      {
        id: "0198d270-0000-7000-8000-000000000101",
        template: "hook",
        durationSeconds: 8,
      },
    ],
  });

  it("reports the applied design", () => {
    expect(creativeDesignStatus({ manifest, applied: true }, manifest)).toBe(
      "applied",
    );
  });

  it("reports a saved draft that the lesson does not use yet", () => {
    expect(creativeDesignStatus({ manifest, applied: false }, manifest)).toBe(
      "not_applied",
    );
  });

  it("reports local edits as unsaved even when the draft was applied", () => {
    const edited = {
      ...manifest,
      settings: {
        ...manifest.settings,
        colors: { ...manifest.settings.colors, accent: "#123456" },
      },
    };
    expect(creativeDesignStatus({ manifest, applied: true }, edited)).toBe(
      "unsaved",
    );
  });
});

describe("creativeDesignApplyBlockers", () => {
  it("lists eligibility and colour issues so Apply never fails silently", () => {
    expect(
      creativeDesignApplyBlockers(
        ["Scene 1 is too short for a readable treatment hold."],
        ["Text needs at least 4.5:1 contrast against the background."],
      ),
    ).toEqual([
      "Scene 1 is too short for a readable treatment hold.",
      "Text needs at least 4.5:1 contrast against the background.",
    ]);
    expect(creativeDesignApplyBlockers([], [])).toEqual([]);
  });
});

describe("selectedLayoutName", () => {
  it("names the selected layout in either design release (ADR-015)", () => {
    const scene = createDefaultStoryboardSceneSpec("hook", {
      id: "01989a3d-8e00-7000-8000-000000000031",
      order: 1,
      durationSeconds: 12,
    });
    const v2 = planCinemaDesign({ packId: "prism", scenes: [scene], seed: "0123456789abcdef" });
    // v2 shows the composition's name, never a raw identifier.
    expect(selectedLayoutName(v2, scene.id)).not.toMatch(/-/u);
    expect(selectedLayoutName(v2, scene.id).length).toBeGreaterThan(3);
    expect(selectedLayoutName(v2, "missing")).toBe("its resolved layout");
    const v1 = createDefaultCreativeDesignManifest({
      packId: "prism",
      scenes: [{ id: scene.id, template: "hook", durationSeconds: 10 }],
    });
    expect(selectedLayoutName(v1, scene.id)).toBe(v1.selections[scene.id]!.treatmentId);
  });
});
