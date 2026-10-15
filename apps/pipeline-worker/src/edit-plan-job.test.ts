/**
 * ST-115: the edit planner's input and checks, and the prompt evaluation
 * cases for `edit-plan/v1` run provider-free against the local dynamic mock.
 * Each case renders the registered prompt from the planner input, parses the
 * response with the plan contract and runs the job's deterministic check.
 */
import { describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import type { EditPlanStoryboardContext } from "@avlp/database";
import {
  DynamicMockLanguageModelProvider,
  renderPrompt,
  repositoryPrompts,
  StaticPromptRegistry,
} from "@avlp/provider-adapters";
import {
  editPlanSchema,
  lessonStoryboardSchema,
  sceneSpecSchema,
  type EditPlan,
  type EditThreadScope,
} from "@avlp/schemas";
import { storyboardPayload } from "./cinema-lesson.fixture.js";
import {
  checkEditPlan,
  editPlanInput,
  storedEditPlan,
  type EditPlanJobContext,
} from "./edit-plan-job.js";

const sceneIds = Array.from(
  { length: 10 },
  (_, index) => `019ffbf1-7777-7000-8000-${String(index + 1).padStart(12, "0")}` as Identifier,
);
const narration = "Water evaporates when heated and rises as vapour into the sky.";

function storyboardContext(): EditPlanStoryboardContext {
  const specs = sceneIds.map((id, index) =>
    sceneSpecSchema.parse({
      id,
      order: index + 1,
      title: `Part ${index + 1}`,
      narration,
      durationSeconds: 16,
      onScreenText: ["Heat turns liquid water into vapour"],
      transition: "cut",
      assetBindings: [],
      sourceRefs: [],
      generatedAdditions: [],
      template: "definition",
      visual: { term: "Evaporation", definition: "A liquid becoming a gas." },
    }),
  );
  const base = storyboardPayload();
  const storyboard = lessonStoryboardSchema.parse({
    ...base,
    revision: 4,
    totalDurationSeconds: specs.length * 16,
    scenes: specs.map((scene) => ({
      id: scene.id,
      stableSceneId: scene.id,
      order: scene.order,
      template: scene.template,
      durationSeconds: scene.durationSeconds,
      narrationBlockIds: [],
      assetRequirements: [],
      scene,
    })),
  });
  return {
    lessonSpecId: storyboard.id,
    revision: 4,
    storyboard,
    scenes: specs.map((scene, index) => ({
      stableSceneId: scene.id,
      order: index + 1,
      scene,
      measuredSeconds: 14,
    })),
    narrationBlocks: [],
    narrationEditable: false,
    narrationSetRevision: null,
  };
}

function context(request: string, scope: EditThreadScope): EditPlanJobContext {
  return {
    messageId: "019ffbf1-eeee-7000-8000-000000000115" as Identifier,
    request,
    scope,
    storyboard: storyboardContext(),
    earlierTurns: [],
  };
}

async function planFor(planContext: EditPlanJobContext): Promise<{
  plan: EditPlan;
  user: string;
}> {
  const prompt = new StaticPromptRegistry(repositoryPrompts).get("edit-plan", "v1");
  const rendered = renderPrompt(prompt, { editPlanInput: editPlanInput(planContext) });
  const response = await new DynamicMockLanguageModelProvider().complete({
    model: "mock",
    messages: [
      { role: "system", content: rendered.system },
      { role: "user", content: rendered.user },
    ],
    responseFormat: "json_object",
  });
  const plan = editPlanSchema.parse(JSON.parse(response.text));
  expect(() => checkEditPlan(plan, planContext)).not.toThrow();
  return { plan, user: rendered.user };
}

describe("ST-115 edit-plan input", () => {
  it("gives the planner scene summaries, fields and measured narration, never narration or source text", () => {
    const planContext = context("Make scene 3 simpler", {
      kind: "scene",
      sceneIds: [sceneIds[2]!],
    });
    const input = JSON.parse(editPlanInput(planContext)) as {
      scenes: {
        sceneId: string;
        inScope: boolean;
        measuredNarrationSeconds: number;
        editableFields?: { path: string }[];
      }[];
    };
    expect(input.scenes).toHaveLength(10);
    expect(input.scenes[2]).toMatchObject({ inScope: true, measuredNarrationSeconds: 14 });
    expect(input.scenes[2]!.editableFields?.map((field) => field.path)).toContain("onScreenText");
    expect(input.scenes[0]!.inScope).toBe(false);
    expect(input.scenes[0]!.editableFields).toBeUndefined();
    expect(editPlanInput(planContext)).not.toContain(narration);
  });

  it("renders the registered prompt with no layout, code or coordinate output allowed", () => {
    const prompt = new StaticPromptRegistry(repositoryPrompts).get("edit-plan", "v1");
    expect(prompt.system).toMatch(/Never return pixel coordinates, fonts, colours, CSS, HTML or code/u);
    expect(prompt.evaluationCases).toEqual([
      "edit-plan-v1-single-scene",
      "edit-plan-v1-multi-scene",
      "edit-plan-v1-whole-lesson",
      "edit-plan-v1-timing-conflict",
      "edit-plan-v1-ambiguous",
      "edit-plan-v1-out-of-bounds-layout",
    ]);
  });
});

describe("ST-115 edit-plan/v1 evaluation cases (dynamic mock)", () => {
  it("edit-plan-v1-single-scene: 'make scene 3 simpler' is one simplify regeneration (AC1)", async () => {
    const { plan } = await planFor(
      context("Make scene 3 simpler", { kind: "scene", sceneIds: [sceneIds[2]!] }),
    );
    expect(plan.operations).toEqual([
      expect.objectContaining({ type: "regenerate-scene", sceneId: sceneIds[2], mode: "simplify" }),
    ]);
  });

  it("edit-plan-v1-multi-scene: a request for selected scenes changes only those scenes", async () => {
    const { plan } = await planFor(
      context("Slow down the transition into these scenes", {
        kind: "selected",
        sceneIds: [sceneIds[1]!, sceneIds[4]!],
      }),
    );
    expect(plan.operations.map((operation) => operation.type)).toEqual([
      "edit-scene-field",
      "edit-scene-field",
    ]);
    expect(
      plan.operations.map((operation) => ("sceneId" in operation ? operation.sceneId : null)),
    ).toEqual([sceneIds[1], sceneIds[4]]);
  });

  it("edit-plan-v1-whole-lesson: at most 8 scenes, with the rest left for a follow-up (AC2)", async () => {
    const planContext = context("Make every on-screen line shorter", {
      kind: "lesson",
      sceneIds: [],
    });
    const { plan } = await planFor(planContext);
    expect(plan.operations).toHaveLength(8);
    expect(plan.remainingSceneIds).toEqual(sceneIds.slice(8));
    expect(plan.summary).toMatch(/2 more scenes left for a follow-up/u);
    const stored = storedEditPlan(plan, planContext, "019ffbf1-9999-7000-8000-000000000115" as Identifier);
    expect(stored.remainingSceneIds).toHaveLength(2);
    expect(stored.operations[0]).toMatchObject({
      id: "op-1",
      display: {
        sceneOrder: 1,
        fieldLabel: "On-screen text",
        before: ["Heat turns liquid water into vapour"],
      },
    });
    expect(stored.expectedRevision).toBe(4);
  });

  it("edit-plan-v1-timing-conflict: a duration below measured narration is answer-only with an alternative (AC4)", async () => {
    const { plan } = await planFor(
      context("Make this scene 8 seconds long", { kind: "scene", sceneIds: [sceneIds[3]!] }),
    );
    expect(plan.operations).toHaveLength(1);
    const [operation] = plan.operations;
    expect(operation?.type).toBe("answer-only");
    expect(operation?.type === "answer-only" && operation.answer).toMatch(
      /can't be 8 s: its narration measures 14 s.*Shorten the narration/u,
    );
  });

  it("edit-plan-v1-ambiguous: a whole-lesson 'it' asks which scene", async () => {
    const { plan } = await planFor(context("Make it shorter", { kind: "lesson", sceneIds: [] }));
    expect(plan.operations).toEqual([
      expect.objectContaining({ type: "answer-only", answer: expect.stringMatching(/Which scene/u) }),
    ]);
  });

  it("edit-plan-v1-out-of-bounds-layout: coordinates are answered, never planned", async () => {
    const { plan } = await planFor(
      context("Move the title 40 pixels to the left", { kind: "scene", sceneIds: [sceneIds[0]!] }),
    );
    expect(plan.operations).toEqual([
      expect.objectContaining({ type: "answer-only", answer: expect.stringMatching(/renderer places every element/u) }),
    ]);
  });
});

describe("ST-115 deterministic plan check", () => {
  it("rejects a plan outside the editor metadata or over a limit so it is never partly applied (AC3)", () => {
    const planContext = context("Change the title", { kind: "scene", sceneIds: [sceneIds[0]!] });
    const outside = editPlanSchema.parse({
      schemaVersion: "edit-plan-v1",
      summary: "Move the title.",
      operations: [
        { type: "edit-scene-field", sceneId: sceneIds[0], path: "title", value: "Fine", rationale: "Ok." },
        { type: "edit-scene-field", sceneId: sceneIds[0], path: "visual.position", value: "left", rationale: "No." },
      ],
    });
    expect(() => checkEditPlan(outside, planContext)).toThrow(/edits a field that is not editable for scene 1/u);
    const tooLong = editPlanSchema.parse({
      schemaVersion: "edit-plan-v1",
      summary: "Rename.",
      operations: [
        { type: "edit-scene-field", sceneId: sceneIds[0], path: "visual.term", value: "x".repeat(200), rationale: "Ok." },
      ],
    });
    expect(() => checkEditPlan(tooLong, planContext)).toThrow(
      expect.objectContaining({ code: "EDIT_PLAN_INVALID" }),
    );
  });
});
