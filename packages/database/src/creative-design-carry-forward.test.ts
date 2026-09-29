import {
  isCreativeDesignManifestV2,
  planCinemaDesign,
  sceneSpecSchema,
  type AnyCreativeDesignManifest,
  type SceneSpec,
} from "@avlp/schemas";
import { createDefaultCreativeDesignManifest } from "@avlp/schemas/creative-design";
import { describe, expect, it } from "vitest";
import { carryForwardCreativeDesignSnapshot } from "./creative-design-carry-forward.js";
import type { DatabaseExecutor } from "./client.js";

const sourceRefs = [
  {
    documentId: "00000000-0000-7000-8000-000000000101",
    parsedDocumentVersion: 1,
    pageStart: 1,
    sectionId: "00000000-0000-7000-8000-000000000301",
    blockIds: ["00000000-0000-7000-8000-000000000111"],
  },
];

function scene(order: number, template: SceneSpec["template"], visual: unknown, narration: string, title: string): SceneSpec {
  return sceneSpecSchema.parse({
    id: `00000000-0000-7000-8000-000000000${400 + order}`,
    order,
    narration,
    title,
    durationSeconds: 20,
    onScreenText: [],
    transition: "fade",
    assetBindings: [],
    sourceRefs,
    generatedAdditions: [],
    template,
    visual,
  });
}

const scenes = [
  scene(1, "hook", { question: "Why does money grow over time?", prompt: "Think about saving." }, "Why does money grow over time? Imagine a jar that adds coins on its own.", "Money that grows"),
  scene(
    2,
    "process",
    { steps: ["Save money", "Earn interest", "Add interest to savings"] },
    "First you save money. Then the bank pays interest. The interest joins your savings.",
    "How compounding works",
  ),
  scene(
    3,
    "cause-effect",
    {
      causes: [{ id: "time", label: "More time saving" }],
      effects: [{ id: "growth", label: "Faster growth" }],
      connections: [{ from: "time", to: "growth" }],
    },
    "The longer you save, the more interest piles up. More time means faster growth.",
    "Why time matters",
  ),
];

/**
 * A drizzle-shaped executor: each awaited select returns the next queued
 * result; inserts and updates are recorded.
 */
function fakeExecutor(selects: unknown[][]) {
  const inserted: unknown[] = [];
  const updated: unknown[] = [];
  const builder = (): unknown => {
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "where", "orderBy", "limit"]) chain[method] = () => chain;
    chain.then = (resolve: (value: unknown) => unknown) => resolve(selects.shift() ?? []);
    return chain;
  };
  const executor = {
    select: () => builder(),
    insert: () => ({
      values: (value: unknown) => {
        inserted.push(value);
        return { onConflictDoNothing: async () => undefined };
      },
    }),
    update: () => ({
      set: (value: unknown) => {
        updated.push(value);
        return { where: async () => undefined };
      },
    }),
  } as unknown as DatabaseExecutor;
  return { executor, inserted, updated };
}

const input = {
  ownerUserId: "00000000-0000-7000-8000-000000000001",
  projectId: "00000000-0000-7000-8000-000000000002",
  lessonSpecId: "00000000-0000-7000-8000-000000000003",
  nextRevision: 2,
  scenes,
  createId: () => "00000000-0000-7000-8000-0000000000ff",
  now: new Date("2026-09-29T12:00:00.000Z"),
};

describe("carryForwardCreativeDesignSnapshot", () => {
  it("keeps a v2 design as v2 on a new storyboard revision (ADR-015)", async () => {
    const previous = planCinemaDesign({ packId: "field-notes", scenes, seed: "0123456789abcdef" });
    const { executor, inserted } = fakeExecutor([[], [{ manifest: previous, manifestHash: "h" }], []]);
    const manifest = await carryForwardCreativeDesignSnapshot(executor, input);
    expect(isCreativeDesignManifestV2(manifest)).toBe(true);
    expect(manifest).toEqual(previous);
    const snapshot = inserted[0] as { manifest: AnyCreativeDesignManifest; lessonSpecRevision: number };
    expect(isCreativeDesignManifestV2(snapshot.manifest)).toBe(true);
    expect(snapshot.lessonSpecRevision).toBe(2);
  });

  it("re-plans a v2 design for changed scenes with the same pack and seed", async () => {
    const previous = planCinemaDesign({ packId: "prism", scenes: scenes.slice(0, 2), seed: "fedcba9876543210" });
    const { executor } = fakeExecutor([[], [{ manifest: previous, manifestHash: "h" }], []]);
    const manifest = await carryForwardCreativeDesignSnapshot(executor, input);
    expect(isCreativeDesignManifestV2(manifest)).toBe(true);
    if (!isCreativeDesignManifestV2(manifest)) return;
    expect(manifest.pack.id).toBe("prism");
    expect(manifest.variationSeed).toBe("fedcba9876543210");
    expect(Object.keys(manifest.scenes).sort()).toEqual(scenes.map((entry) => entry.id).sort());
  });

  it("returns an existing snapshot of either release unchanged", async () => {
    const pinned = planCinemaDesign({ packId: "systems", scenes, seed: "0123456789abcdef" });
    const { executor, inserted } = fakeExecutor([[{ manifest: pinned }]]);
    expect(await carryForwardCreativeDesignSnapshot(executor, input)).toEqual(pinned);
    expect(inserted).toHaveLength(0);
  });

  it("still carries a v1 design as v1", async () => {
    const previous = createDefaultCreativeDesignManifest({ packId: "everyday", scenes });
    const { executor } = fakeExecutor([[], [{ manifest: previous, manifestHash: "h" }], []]);
    const manifest = await carryForwardCreativeDesignSnapshot(executor, input);
    expect(manifest?.manifestVersion).toBe("1.0");
    expect(manifest?.pack.id).toBe("everyday");
  });
});
