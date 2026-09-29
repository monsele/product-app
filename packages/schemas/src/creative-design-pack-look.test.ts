import { describe, expect, it } from "vitest";
import {
  carryForwardCreativeDesignManifest,
  createDefaultCreativeDesignManifest,
  creativeDesignPackDefaultSettings,
  creativeDesignPackIds,
  suggestCreativeDesignPack,
  validateCreativeDesignManifest,
} from "./creative-design.js";

const id = (tail: string) => `0198d270-0000-7000-8000-000000000${tail}`;
const scenes = [
  { id: id("101"), template: "hook" as const, durationSeconds: 8 },
  { id: id("102"), template: "definition" as const, durationSeconds: 10 },
  { id: id("103"), template: "summary" as const, durationSeconds: 9 },
];

describe("per-pack starting look", () => {
  it("gives every pack an accessible palette of its own", () => {
    for (const packId of creativeDesignPackIds) {
      const manifest = createDefaultCreativeDesignManifest({ packId, scenes });
      expect(manifest.settings).toEqual(creativeDesignPackDefaultSettings[packId]);
      expect(validateCreativeDesignManifest(manifest, scenes)).toEqual([]);
    }
    const looks = creativeDesignPackIds.map((packId) => {
      const { background, accent } = creativeDesignPackDefaultSettings[packId].colors;
      return `${background}/${accent}`;
    });
    expect(new Set(looks).size).toBe(creativeDesignPackIds.length);
  });
});

describe("carryForwardCreativeDesignManifest", () => {
  const previous = {
    ...createDefaultCreativeDesignManifest({ packId: "systems", scenes }),
  };

  it("keeps a design that still fits the new revision unchanged", () => {
    const retimed = scenes.map((scene) => ({ ...scene, durationSeconds: scene.durationSeconds + 1 }));
    expect(carryForwardCreativeDesignManifest({ previous, scenes: retimed })).toBe(previous);
  });

  it("re-plans the same pack with the teacher's settings when a scene changed template", () => {
    const edited = {
      ...previous,
      settings: { ...previous.settings, fontPair: "nunito-inter" as const },
    };
    const next = carryForwardCreativeDesignManifest({
      previous: edited,
      scenes: [scenes[0]!, { ...scenes[1]!, template: "analogy" }, scenes[2]!],
    });
    expect(next?.pack.id).toBe("systems");
    expect(next?.settings.fontPair).toBe("nunito-inter");
    expect(next?.selections[id("102")]?.treatmentId).toMatch(/^systems\.analogy\./);
  });

  it("starts from the configured pack when there is no previous design", () => {
    expect(
      carryForwardCreativeDesignManifest({ previous: undefined, packId: "prism", scenes })?.pack.id,
    ).toBe("prism");
  });

  it("carries nothing when there is no design and no pack, or the scenes cannot take one", () => {
    expect(carryForwardCreativeDesignManifest({ previous: undefined, scenes })).toBeUndefined();
    expect(
      carryForwardCreativeDesignManifest({
        previous,
        scenes: [{ ...scenes[0]!, durationSeconds: 2 }],
      }),
    ).toBeUndefined();
  });
});

describe("suggestCreativeDesignPack", () => {
  it("matches the subject, then the audience", () => {
    expect(suggestCreativeDesignPack({ subject: "Computer networks", projectId: id("1") })).toBe("systems");
    expect(suggestCreativeDesignPack({ subject: "Plant biology", projectId: id("1") })).toBe("field-notes");
    expect(suggestCreativeDesignPack({ subject: "Modern history", projectId: id("1") })).toBe("editorial");
    expect(suggestCreativeDesignPack({ subject: "Personal finance", projectId: id("1") })).toBe("everyday");
    expect(
      suggestCreativeDesignPack({ subject: "Plant biology", ageBand: "8-10", projectId: id("1") }),
    ).toBe("prism");
  });

  it("does not match a keyword inside another word", () => {
    // "art" must not match "part"; this falls through to the project hash.
    const pack = suggestCreativeDesignPack({ subject: "Part one", projectId: id("1") });
    expect(pack).toBe(suggestCreativeDesignPack({ subject: "Part one", projectId: id("1") }));
  });

  it("varies unmatched lessons by project, deterministically", () => {
    const packs = new Set(
      Array.from({ length: 40 }, (_, index) =>
        suggestCreativeDesignPack({ subject: "Untitled", projectId: `project-${index}` }),
      ),
    );
    expect(packs.size).toBeGreaterThan(3);
  });
});
