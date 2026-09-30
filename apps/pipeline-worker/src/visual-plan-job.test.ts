import { describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import {
  DynamicMockLanguageModelProvider,
  renderPrompt,
  repositoryPrompts,
  StaticPromptRegistry,
} from "@avlp/provider-adapters";
import {
  eligibleCinemaCompositions,
  groundVisualPlanProposal,
  planCinemaDesign,
  sceneSpecSchema,
  visualPlanProposalSchema,
  type SceneSpec,
} from "@avlp/schemas";
import { checkVisualPlan, planVisualDesign, visualPlanInput } from "./visual-plan-job.js";

const sourceRefs = [
  {
    documentId: "019ffbf1-3333-7000-8000-000000000001",
    parsedDocumentVersion: 1,
    pageStart: 1,
    sectionId: "019ffbf1-2222-7000-8000-000000000001",
    blockIds: ["019ffbf1-3333-7000-8000-000000000002"],
  },
];

function scenes(): SceneSpec[] {
  return [
    {
      id: "019ffbf1-7777-7000-8000-000000000201",
      order: 1,
      title: "Evaporation",
      narration: "Water evaporates when heated and rises as water vapour into the sky.",
      template: "definition",
      visual: { term: "Evaporation", definition: "A liquid becoming a gas." },
    },
    {
      id: "019ffbf1-7777-7000-8000-000000000202",
      order: 2,
      title: "How water rises",
      narration: "First the sun warms the water. Then the water evaporates. Finally the vapour rises.",
      template: "process",
      visual: { steps: ["The sun warms the water", "The water evaporates", "The vapour rises"] },
    },
    {
      id: "019ffbf1-7777-7000-8000-000000000203",
      order: 3,
      title: "Remember",
      narration: "Heat turns water into vapour. The vapour rises.",
      template: "summary",
      visual: { takeaways: [{ text: "Heat turns water into vapour" }, { text: "The vapour rises" }] },
    },
  ].map((scene) =>
    sceneSpecSchema.parse({
      durationSeconds: 24,
      onScreenText: [],
      transition: "fade",
      assetBindings: [],
      sourceRefs,
      generatedAdditions: [],
      ...scene,
    }),
  );
}

function context() {
  const lesson = scenes();
  return {
    draftId: "019ffbf1-8888-7000-8000-000000000201" as Identifier,
    draftRevision: 1,
    manifest: planCinemaDesign({ packId: "field-notes", scenes: lesson, seed: "0123456789abcdef" }),
    scenes: lesson,
  };
}

describe("ST-110 visual-plan job", () => {
  it("gives the planner approved content, the identity and each scene's eligible compositions", () => {
    const planContext = context();
    const input = JSON.parse(visualPlanInput(planContext)) as {
      identity: { style: string };
      catalogue: { id: string }[];
      scenes: {
        sceneId: string;
        narration: { sentence: number; text: string }[];
        hasPicture: boolean;
        eligibleCompositions: { id: string; beatTargets: string[] }[];
      }[];
    };
    expect(input.identity.style).toBe("Field Notes");
    expect(input.catalogue).toHaveLength(10);
    const process = input.scenes[1]!;
    expect(process.narration.map((entry) => entry.sentence)).toEqual([0, 1, 2]);
    expect(process.hasPicture).toBe(false);
    expect(process.eligibleCompositions.map((entry) => entry.id)).toEqual(
      eligibleCinemaCompositions(planContext.scenes[1]!).map((entry) => entry.id),
    );
    const sequence = process.eligibleCompositions.find((entry) => entry.id === "sequence");
    expect(sequence?.beatTargets).toEqual(expect.arrayContaining(["item-1", "item-3", "link-2"]));
  });

  it("renders the registered prompt with the planner input only", () => {
    const planContext = context();
    const prompt = new StaticPromptRegistry(repositoryPrompts).get("visual-plan", "v1");
    const rendered = renderPrompt(prompt, { visualPlanInput: visualPlanInput(planContext) });
    expect(rendered.user).toContain('"sceneId":"019ffbf1-7777-7000-8000-000000000202"');
    expect(rendered.system).toMatch(/Never return CSS/u);
  });

  it("gets a fully grounded plan from the local mock provider", async () => {
    const planContext = context();
    const prompt = new StaticPromptRegistry(repositoryPrompts).get("visual-plan", "v1");
    const rendered = renderPrompt(prompt, { visualPlanInput: visualPlanInput(planContext) });
    const response = await new DynamicMockLanguageModelProvider().complete({
      model: "mock",
      messages: [
        { role: "system", content: rendered.system },
        { role: "user", content: rendered.user },
      ],
      responseFormat: "json_object",
    });
    const proposal = visualPlanProposalSchema.parse(JSON.parse(response.text));
    expect(proposal.scenes).toHaveLength(3);
    expect(groundVisualPlanProposal(proposal, planContext.scenes).dropped).toEqual([]);
    expect(checkVisualPlan(proposal, planContext)).toEqual([]);
    const manifest = planVisualDesign(planContext, {
      proposal,
      modelCallId: "019ffbf1-9999-7000-8000-000000000201",
    });
    expect(manifest.plan.source).toBe("model");
    expect(manifest.variationSeed).toBe(planContext.manifest.variationSeed);
  });

  it("rejects a plan that names no scene of the lesson so it can be corrected", () => {
    expect(() =>
      checkVisualPlan(
        visualPlanProposalSchema.parse({
          scenes: [{ sceneId: "019ffbf1-7777-7000-8000-000000000999", compositions: ["statement"] }],
        }),
        context(),
      ),
    ).toThrow(expect.objectContaining({ code: "VISUAL_PLAN_EMPTY" }));
  });

  it("keeps pinned pictures and fitting locks when re-planning", () => {
    const planContext = context();
    const [definition] = planContext.scenes;
    const design = planContext.manifest.scenes[definition!.id]!;
    const hero = {
      assetId: "019ffbf1-4444-7000-8000-000000000201" as Identifier,
      origin: "project_asset" as const,
      altText: "A puddle in the sun",
    };
    const manifest = planVisualDesign({
      ...planContext,
      manifest: {
        ...planContext.manifest,
        scenes: {
          ...planContext.manifest.scenes,
          [definition!.id]: { ...design, locked: true, imagery: { ...design.imagery, hero } },
        },
      },
    });
    expect(manifest.scenes[definition!.id]).toMatchObject({
      compositionId: design.compositionId,
      locked: true,
      imagery: { hero },
    });
    expect(manifest.plan.source).toBe("authored");
  });
});
