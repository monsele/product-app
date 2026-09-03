import { describe, expect, it } from "vitest";
import {
  type AssetProvenance,
  assetBindingComplianceIssues,
  assetBindingRoleViolations,
  assetProvenanceSchema,
  createDefaultStoryboardSceneSpec,
  sceneAssetBindingSchema,
  sceneAssetSlotRequirement,
  sceneAssetSlotRequirementSchema,
  sceneSpecSchema,
  type VisualRole,
  visualRoleSchema,
} from "./index.js";

const documentId = "019ffbf1-3333-7000-8000-000000000001";
const blockId = "019ffbf1-4444-7000-8000-000000000001";
const assetId = "019ffbf1-5555-7000-8000-000000000001";

const sourceRef = {
  documentId,
  parsedDocumentVersion: 1,
  pageStart: 1,
  blockIds: [blockId],
};

function diagramScene(binding: Record<string, unknown>) {
  const base = createDefaultStoryboardSceneSpec("labelled-diagram", {
    id: "019ffbf1-6666-7000-8000-000000000001" as never,
    order: 1,
    durationSeconds: 20,
  });
  return { ...base, sourceRefs: [sourceRef], assetBindings: [binding] };
}

describe("visualRoleSchema / assetProvenanceSchema", () => {
  it("enumerates the three epistemic roles", () => {
    expect(visualRoleSchema.options).toEqual([
      "grounding_critical",
      "source_derived",
      "decorative",
    ]);
  });

  it("enumerates the four provenances", () => {
    expect(assetProvenanceSchema.options).toEqual([
      "catalog",
      "source_figure",
      "teacher_uploaded",
      "ai_generated",
    ]);
  });
});

describe("templateAssetSlotRequirements visual roles", () => {
  it("assigns a role to every declared slot", () => {
    // labelled-diagram.diagram is the only grounding-critical slot.
    expect(sceneAssetSlotRequirement("labelled-diagram", "diagram")?.visualRole).toBe(
      "grounding_critical",
    );
    expect(sceneAssetSlotRequirement("hook", "subject")?.visualRole).toBe(
      "decorative",
    );
    expect(sceneAssetSlotRequirement("analogy", "central-visual")?.visualRole).toBe(
      "decorative",
    );
    expect(sceneAssetSlotRequirement("comparison", "left-subject-image")?.visualRole).toBe(
      "decorative",
    );
  });

  it("requires visualRole on the slot-requirement contract (no silent default)", () => {
    expect(
      sceneAssetSlotRequirementSchema.safeParse({
        acceptedAspectRatios: ["square"],
        acceptedKinds: ["illustration"],
        bindingRole: "illustration",
        required: false,
        slot: "subject",
      }).success,
    ).toBe(false);
  });
});

describe("assetBindingRoleViolations — every visualRole x provenance", () => {
  const roles: VisualRole[] = [
    "grounding_critical",
    "source_derived",
    "decorative",
  ];
  const provenances: AssetProvenance[] = [
    "catalog",
    "source_figure",
    "teacher_uploaded",
    "ai_generated",
  ];

  it("permits and rejects each combination as the visual-role table specifies", () => {
    for (const slotRole of roles)
      for (const provenance of provenances) {
        const withRef = assetBindingRoleViolations({
          slotRole,
          provenance,
          hasSourceRef: true,
        });
        const withoutRef = assetBindingRoleViolations({
          slotRole,
          provenance,
          hasSourceRef: false,
        });
        if (slotRole === "decorative") {
          expect(withRef).toEqual([]);
          expect(withoutRef).toEqual([]);
          continue;
        }
        // Non-decorative slots always require a source reference.
        expect(withoutRef).toContain("missing_source_reference");
        if (slotRole === "grounding_critical" && provenance === "ai_generated") {
          expect(withRef).toEqual(["generated_in_grounding_slot"]);
        } else {
          // source_derived permits a teacher-approved generated illustration.
          expect(withRef).toEqual([]);
        }
      }
  });

  it("grandfathers a binding that declares no provenance", () => {
    for (const slotRole of roles)
      expect(
        assetBindingRoleViolations({ slotRole, hasSourceRef: false }),
      ).toEqual([]);
  });

  it("flags a declared visualRole that disagrees with the slot", () => {
    expect(
      assetBindingRoleViolations({
        slotRole: "grounding_critical",
        declaredVisualRole: "decorative",
        provenance: "source_figure",
        hasSourceRef: true,
      }),
    ).toContain("visual_role_mismatch");
  });
});

describe("assetBindingComplianceIssues", () => {
  const provenances: AssetProvenance[] = [
    "catalog",
    "source_figure",
    "teacher_uploaded",
    "ai_generated",
  ];

  it("covers every visualRole x provenance combination for the diagram slot", () => {
    for (const provenance of provenances) {
      const issues = assetBindingComplianceIssues("labelled-diagram", [
        { assetId, role: "diagram", slot: "diagram", provenance, sourceRef },
      ]);
      if (provenance === "ai_generated")
        expect(issues.map((issue) => issue.path.at(-1))).toContain("provenance");
      else expect(issues).toHaveLength(0);
    }
    // Decorative slot accepts any provenance, including ai_generated.
    for (const provenance of provenances)
      expect(
        assetBindingComplianceIssues("hook", [
          { assetId, role: "illustration", slot: "subject", provenance },
        ]),
      ).toHaveLength(0);
  });

  it("requires a source reference for a non-decorative slot", () => {
    const issues = assetBindingComplianceIssues("labelled-diagram", [
      { assetId, role: "diagram", slot: "diagram", provenance: "source_figure" },
    ]);
    expect(issues.map((issue) => issue.path.at(-1))).toContain("sourceRef");
  });

  it("rejects a declared visualRole that disagrees with the template", () => {
    const issues = assetBindingComplianceIssues("labelled-diagram", [
      {
        assetId,
        role: "diagram",
        slot: "diagram",
        visualRole: "decorative",
        provenance: "source_figure",
        sourceRef,
      },
    ]);
    expect(issues.map((issue) => issue.path.at(-1))).toContain("visualRole");
  });

  it("grandfathers a legacy binding that declares no provenance", () => {
    expect(
      assetBindingComplianceIssues("labelled-diagram", [
        { assetId, role: "diagram", slot: "diagram" },
      ]),
    ).toHaveLength(0);
  });
});

describe("sceneSpecSchema provenance enforcement", () => {
  it("rejects an AI-generated asset in the grounding-critical diagram slot", () => {
    const result = sceneSpecSchema.safeParse(
      diagramScene({
        assetId,
        role: "diagram",
        slot: "diagram",
        provenance: "ai_generated",
        visualRole: "grounding_critical",
        sourceRef,
      }),
    );
    expect(result.success).toBe(false);
  });

  it("cannot be bypassed by omitting visualRole on the binding", () => {
    const result = sceneSpecSchema.safeParse(
      diagramScene({
        assetId,
        role: "diagram",
        slot: "diagram",
        provenance: "ai_generated",
        sourceRef,
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects a grounding-critical binding with no source reference", () => {
    const base = createDefaultStoryboardSceneSpec("labelled-diagram", {
      id: "019ffbf1-6666-7000-8000-000000000002" as never,
      order: 1,
      durationSeconds: 20,
    });
    const result = sceneSpecSchema.safeParse({
      ...base,
      sourceRefs: [],
      assetBindings: [
        {
          assetId,
          role: "diagram",
          slot: "diagram",
          provenance: "source_figure",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a source figure in the diagram slot with a source reference", () => {
    const result = sceneSpecSchema.safeParse(
      diagramScene({
        assetId,
        role: "diagram",
        slot: "diagram",
        provenance: "source_figure",
        visualRole: "grounding_critical",
        sourceRef,
      }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts an AI-generated asset in a decorative slot", () => {
    const base = createDefaultStoryboardSceneSpec("hook", {
      id: "019ffbf1-6666-7000-8000-000000000003" as never,
      order: 1,
      durationSeconds: 20,
    });
    const result = sceneSpecSchema.safeParse({
      ...base,
      assetBindings: [
        {
          assetId,
          role: "illustration",
          slot: "subject",
          provenance: "ai_generated",
          visualRole: "decorative",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("still parses a legacy scene whose bindings predate provenance", () => {
    const result = sceneSpecSchema.safeParse(
      diagramScene({ assetId, role: "diagram", slot: "diagram" }),
    );
    expect(result.success).toBe(true);
  });
});

describe("sceneAssetBindingSchema standalone guard", () => {
  it("rejects a grounding-critical AI-generated binding parsed in isolation", () => {
    expect(
      sceneAssetBindingSchema.safeParse({
        assetId,
        role: "diagram",
        slot: "diagram",
        visualRole: "grounding_critical",
        provenance: "ai_generated",
        sourceRef,
      }).success,
    ).toBe(false);
  });
});
