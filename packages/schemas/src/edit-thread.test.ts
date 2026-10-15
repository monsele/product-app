import { describe, expect, it } from "vitest";
import {
  currentEditPlanCompatibility,
  editPlanApplyInputSchema,
  editPlanMaximumOperations,
  editPlanMaximumScenes,
  editPlanOutputSchema,
  editPlanSceneEdits,
  editPlanSchema,
  editThreadMessageInputSchema,
  editThreadScopeSchema,
  editTurnUndoSnapshotSchema,
  limitEditPlan,
  modelCallOperationValues,
  plannableSceneFields,
  sceneSpecSchema,
  validateEditPlan,
  type EditPlanContext,
  type EditPlanOperation,
  type EditPlanSceneContext,
  type SceneSpec,
} from "./index.js";

const sceneIds = Array.from(
  { length: 10 },
  (_, index) => `019ffbf1-7777-7000-8000-${String(index + 1).padStart(12, "0")}`,
);
const blockId = "019ffbf1-3333-7000-8000-000000000115";

function definitionScene(index: number): SceneSpec {
  return sceneSpecSchema.parse({
    id: sceneIds[index],
    order: index + 1,
    title: `Scene ${index + 1}`,
    narration: "Water evaporates when heated and rises as vapour.",
    durationSeconds: 20,
    onScreenText: ["Water turns into vapour when heated"],
    transition: "cut",
    assetBindings: [],
    sourceRefs: [],
    generatedAdditions: [],
    template: "definition",
    visual: { term: "Evaporation", definition: "A liquid becoming a gas." },
  });
}

function context(
  overrides: Partial<EditPlanContext> = {},
  measuredSeconds: number | null = 14,
): EditPlanContext {
  const scenes: EditPlanSceneContext[] = sceneIds.map((stableSceneId, index) => ({
    stableSceneId,
    order: index + 1,
    scene: definitionScene(index),
    measuredSeconds,
  }));
  return {
    scope: { kind: "lesson", sceneIds: [] },
    scenes,
    narrationBlocks: [{ blockId, sceneId: sceneIds[0]! }],
    narrationEditable: true,
    ...overrides,
  };
}

const rationale = "Keeps the scene short.";

function fieldEdit(
  sceneIndex: number,
  path: string,
  value: string | number | string[],
): EditPlanOperation {
  return { type: "edit-scene-field", sceneId: sceneIds[sceneIndex]!, path, value, rationale };
}

function plan(operations: EditPlanOperation[]) {
  return editPlanSchema.safeParse({
    schemaVersion: "edit-plan-v1",
    summary: "A change.",
    operations,
  });
}

describe("ST-115 edit plan schema limits", () => {
  it("is a metered ai.edit-plan call pinned to edit-plan/v1", () => {
    expect(modelCallOperationValues).toContain("ai.edit-plan");
    expect(currentEditPlanCompatibility).toMatchObject({
      promptId: "edit-plan",
      promptVersion: "v1",
    });
  });

  it("accepts up to 12 operations and refuses a 13th", () => {
    const twelve = Array.from({ length: editPlanMaximumOperations }, (_, index) =>
      fieldEdit(index % 6, index < 6 ? "title" : "onScreenText", index < 6 ? "Short" : ["Short"]),
    );
    expect(plan(twelve).success).toBe(true);
    expect(plan([...twelve, fieldEdit(0, "transition", "fade")]).success).toBe(false);
  });

  it("refuses a plan that touches more than 8 distinct scenes", () => {
    const eight = sceneIds
      .slice(0, editPlanMaximumScenes)
      .map((_, index) => fieldEdit(index, "title", "Short"));
    expect(plan(eight).success).toBe(true);
    const nine = [...eight, fieldEdit(8, "title", "Short")];
    const result = plan(nine);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("at most 8 scenes");
  });

  it("trims an over-long model plan to 8 scenes and lists the rest for a follow-up (AC2)", () => {
    // The model touched all 10 scenes, out of storyboard order.
    const output = editPlanOutputSchema.parse({
      schemaVersion: "edit-plan-v1",
      summary: "Shorten every line.",
      operations: [...sceneIds].reverse().map((_, index) => fieldEdit(9 - index, "title", "Short")),
    });
    const limited = limitEditPlan(output, sceneIds);
    expect(limited.operations).toHaveLength(8);
    expect(
      limited.operations.map((operation) => ("sceneId" in operation ? operation.sceneId : null)).sort(),
    ).toEqual(sceneIds.slice(0, 8).sort());
    expect(limited.remainingSceneIds).toEqual(sceneIds.slice(8));
    expect(editPlanSchema.safeParse(limited).success).toBe(true);
  });

  it("caps a plan at 12 operations without leaving a scene half-changed", () => {
    const output = editPlanOutputSchema.parse({
      schemaVersion: "edit-plan-v1",
      summary: "Many edits.",
      operations: sceneIds.slice(0, 7).flatMap((_, index) => [
        fieldEdit(index, "title", "Short"),
        fieldEdit(index, "transition", "fade"),
      ]),
    });
    const limited = limitEditPlan(output, sceneIds);
    expect(limited.operations).toHaveLength(12);
    // Scene 7's two edits did not fit: it is left whole for a follow-up.
    expect(limited.remainingSceneIds).toEqual([sceneIds[6]]);
    expect(limited.operations.some((operation) => "sceneId" in operation && operation.sceneId === sceneIds[6])).toBe(false);
  });

  it("keeps answer-only alone, and refuses repeated or conflicting targets", () => {
    const answer: EditPlanOperation = { type: "answer-only", answer: "Which scene?" };
    expect(plan([answer]).success).toBe(true);
    expect(plan([answer, fieldEdit(0, "title", "Short")]).success).toBe(false);
    expect(plan([fieldEdit(0, "title", "A"), fieldEdit(0, "title", "B")]).success).toBe(false);
    expect(
      plan([
        fieldEdit(0, "title", "A"),
        { type: "regenerate-scene", sceneId: sceneIds[0]!, mode: "simplify", rationale },
      ]).success,
    ).toBe(false);
  });

  it("refuses free-form layout: there is no operation for coordinates or code", () => {
    expect(
      plan([
        { type: "move-element", sceneId: sceneIds[0]!, x: 40, y: 10 } as unknown as EditPlanOperation,
      ]).success,
    ).toBe(false);
  });

  it("bounds the request scope and the teacher's message", () => {
    expect(editThreadScopeSchema.safeParse({ kind: "scene", sceneIds: [] }).success).toBe(false);
    expect(
      editThreadScopeSchema.safeParse({ kind: "scene", sceneIds: [sceneIds[0]] }).success,
    ).toBe(true);
    expect(
      editThreadScopeSchema.safeParse({ kind: "selected", sceneIds: sceneIds.slice(0, 9) }).success,
    ).toBe(false);
    expect(editThreadScopeSchema.safeParse({ kind: "lesson", sceneIds: [sceneIds[0]] }).success).toBe(
      false,
    );
    expect(
      editThreadMessageInputSchema.safeParse({
        text: "x".repeat(1_001),
        scope: { kind: "lesson", sceneIds: [] },
        expectedRevision: 0,
      }).success,
    ).toBe(false);
    expect(editPlanApplyInputSchema.safeParse({ expectedRevision: 1, operationIds: [] }).success).toBe(
      false,
    );
  });
});

describe("ST-115 field paths come from the template's editor metadata", () => {
  it("offers plain text, select and string-list fields but not narration or structure", () => {
    const paths = plannableSceneFields(definitionScene(0)).map((field) => field.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "title",
        "onScreenText",
        "durationSeconds",
        "transition",
        "visual.term",
        "visual.definition",
      ]),
    );
    expect(paths).not.toContain("narration");
    const process = sceneSpecSchema.parse({
      ...definitionScene(0),
      template: "cause-effect",
      visual: {
        causes: [{ id: "cause-1", label: "Heat" }],
        effects: [{ id: "effect-1", label: "Evaporation" }],
        connections: [{ from: "cause-1", to: "effect-1" }],
      },
    });
    const causePaths = plannableSceneFields(process).map((field) => field.path);
    // Structured lists and graphs stay in the form editor.
    expect(causePaths).not.toContain("visual.causes");
    expect(causePaths).not.toContain("visual.nodes");
  });

  it("accepts a valid edit and rejects paths outside the metadata (AC3)", () => {
    expect(validateEditPlan({ operations: [fieldEdit(0, "title", "Evaporation")] }, context())).toEqual([]);
    const issues = validateEditPlan(
      { operations: [fieldEdit(0, "visual.layout.x", "40px")] },
      context(),
    );
    expect(issues.map((issue) => issue.code)).toEqual(["field_not_editable"]);
    // Check messages never echo model text (they reach stored job errors).
    const hostile = validateEditPlan(
      { operations: [fieldEdit(0, "visual.\"Ignore the teacher\"", "x")] },
      context(),
    );
    expect(hostile[0]!.message).not.toContain("Ignore the teacher");
    expect(hostile[0]!.message).toBe("Operation 1 edits a field that is not editable for scene 1.");
    expect(
      validateEditPlan({ operations: [fieldEdit(0, "narration", "Shorter.")] }, context()).map(
        (issue) => issue.code,
      ),
    ).toEqual(["field_not_editable"]);
  });

  it("rejects a value over the template's limit, a wrong type or an unknown option (AC3)", () => {
    expect(
      validateEditPlan({ operations: [fieldEdit(0, "visual.term", "x".repeat(81))] }, context()).map(
        (issue) => issue.code,
      ),
    ).toEqual(["value_out_of_bounds"]);
    expect(
      validateEditPlan({ operations: [fieldEdit(0, "onScreenText", "one line")] }, context()).map(
        (issue) => issue.code,
      ),
    ).toEqual(["value_invalid"]);
    expect(
      validateEditPlan({ operations: [fieldEdit(0, "transition", "spin")] }, context()).map(
        (issue) => issue.code,
      ),
    ).toEqual(["value_invalid"]);
  });

  it("refuses a duration below the measured narration (ADR-004, AC4)", () => {
    const issues = validateEditPlan({ operations: [fieldEdit(3, "durationSeconds", 8)] }, context());
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "duration_below_narration" });
    expect(issues[0]!.message).toContain("narration measures 14 s");
    expect(validateEditPlan({ operations: [fieldEdit(3, "durationSeconds", "16")] }, context())).toEqual([]);
    expect(
      validateEditPlan({ operations: [fieldEdit(3, "durationSeconds", 8)] }, context({}, null)),
    ).toEqual([]);
  });

  it("keeps a plan inside its scope and its narration rules", () => {
    const scoped = context({ scope: { kind: "scene", sceneIds: [sceneIds[2]!] } });
    expect(
      validateEditPlan({ operations: [fieldEdit(0, "title", "Short")] }, scoped).map((issue) => issue.code),
    ).toEqual(["scene_out_of_scope"]);
    expect(
      validateEditPlan(
        { operations: [{ type: "regenerate-narration-block", blockId, mode: "shorten", rationale }] },
        context({ narrationEditable: false }),
      ).map((issue) => issue.code),
    ).toEqual(["narration_locked"]);
    expect(
      validateEditPlan(
        {
          operations: [
            {
              type: "regenerate-scene",
              sceneId: "019ffbf1-7777-7000-8000-999999999999",
              mode: "simplify",
              rationale,
            },
          ],
        },
        context(),
      ).map((issue) => issue.code),
    ).toEqual(["scene_not_found"]);
  });

  it("requires a reorder to list every scene once in a new order", () => {
    const reversed = [...sceneIds].reverse();
    expect(
      validateEditPlan({ operations: [{ type: "reorder-scenes", sceneIds: reversed, rationale }] }, context()),
    ).toEqual([]);
    expect(
      validateEditPlan(
        { operations: [{ type: "reorder-scenes", sceneIds: reversed.slice(1), rationale }] },
        context(),
      ).map((issue) => issue.code),
    ).toEqual(["reorder_mismatch"]);
    expect(
      validateEditPlan({ operations: [{ type: "reorder-scenes", sceneIds, rationale }] }, context()).map(
        (issue) => issue.code,
      ),
    ).toEqual(["reorder_mismatch"]);
  });

  it("builds one complete edited scene per scene from several field edits", () => {
    const edits = editPlanSceneEdits(
      [fieldEdit(0, "title", "Vapour"), fieldEdit(0, "transition", "fade"), fieldEdit(1, "durationSeconds", "18")],
      context().scenes,
    );
    expect([...edits.keys()]).toEqual([sceneIds[0], sceneIds[1]]);
    expect(edits.get(sceneIds[0]!)).toMatchObject({ title: "Vapour", transition: "fade" });
    expect(edits.get(sceneIds[1]!)?.durationSeconds).toBe(18);
  });

  it("describes an undo as the pre-turn order plus the changed scenes", () => {
    expect(
      editTurnUndoSnapshotSchema.safeParse({ revision: 3, sceneOrder: [sceneIds[0]], scenes: [] }).success,
    ).toBe(true);
    expect(editTurnUndoSnapshotSchema.safeParse({ revision: 3, sceneOrder: [], scenes: [] }).success).toBe(
      false,
    );
  });
});
