import { describe, it, expect } from "vitest";
import {
  buildDesignSystemInterpretationProposal,
  designSystemInterpretationOutputSchema,
  requestDesignSystemInterpretationSchema,
  type DesignSystemInterpretationOutput,
} from "./design-system-interpretation.js";
import {
  emptyDesignSystemDefinition,
  designSystemDefinitionSchema,
  compileCustomDesign,
  designSystemContentHash,
} from "./design-systems.js";
import { createDefaultStoryboardSceneSpec } from "./index.js";

const id = "00000000-0000-7000-8000-000000000001";
const output = () => ({
  philosophy: "An annotated field journal",
  rules: [
    {
      rule: {
        id: "imagery",
        category: "imagery" as const,
        instruction: "Avoid decorative icons",
        enforcement: "guidance" as const,
        origin: "supplied" as const,
      },
      sourceId: "request",
      quote: "Avoid decorative icons",
    },
  ],
  presentation: null,
  conflicts: [],
  unsupported: [],
});
describe("design-system interpretation trust boundaries", () => {
  it("preserves every exact font, colour, asset, composition and motion control", () => {
    const presentation = {
      colors: {
        background: "#ffffff",
        surface: "#ffffff",
        text: "#111111",
        accent: "#5b21b6",
        diagramEmphasis: "#2563eb",
      },
      fonts: { heading: id, body: id },
      logoAssetId: null,
      alignment: "left",
      density: "spacious",
      emphasis: "text",
      arrangement: "split",
      imageFrame: "none",
      stroke: "fine",
      corners: "square",
      motion: {
        family: "fade",
        prohibited: [],
        intensity: "calm",
        staggerFrames: 0,
        holdFrames: 36,
      },
    };
    const base = designSystemDefinitionSchema.parse({
      ...emptyDesignSystemDefinition,
      schemaVersion: "1.1",
      assetIds: [id],
      presentation,
    });
    const change = designSystemInterpretationOutputSchema.parse({
      ...output(),
      rules: [],
      presentation: {
        ...presentation,
        alignment: "center",
        motion: { ...presentation.motion, family: "settle" },
      },
    });
    const result = buildDesignSystemInterpretationProposal(base, change, []);
    expect(
      result.definition.schemaVersion === "1.1" &&
        result.definition.presentation,
    ).toEqual(presentation);
    expect(result.suggestedPresentation?.alignment).toBe("center");
    expect(result.conflicts.join(" ")).toContain(
      "exact presentation controls were preserved",
    );
  });
  it("formal guide rules need exact supplied evidence; image observations remain inferred", () => {
    const sources = [
      {
        id: "request",
        kind: "request" as const,
        text: "Avoid decorative icons. Use a field journal style.",
      },
    ];
    const result = buildDesignSystemInterpretationProposal(
      emptyDesignSystemDefinition,
      output(),
      sources,
    );
    expect(result.provenance[0]).toMatchObject({
      origin: "supplied",
      sourceId: "request",
      quote: "Avoid decorative icons",
    });
    expect(result.capabilities[0]?.status).toBe("advisory");
    expect(() =>
      buildDesignSystemInterpretationProposal(
        emptyDesignSystemDefinition,
        output(),
        [{ ...sources[0]!, text: "Use icons" }],
      ),
    ).toThrow("quote");
    const inferred: DesignSystemInterpretationOutput = output();
    inferred.rules[0]!.rule = {
      ...inferred.rules[0]!.rule,
      origin: "inferred",
    };
    expect(() =>
      buildDesignSystemInterpretationProposal(
        emptyDesignSystemDefinition,
        inferred,
        sources,
      ),
    ).toThrow("Inferred");
  });
  it("retains exact rules, reports conflicts, and keeps unsupported locks blocking compilation", () => {
    const base = {
      ...emptyDesignSystemDefinition,
      philosophy: "Keep it calm",
      rules: [
        {
          id: "imagery",
          category: "imagery" as const,
          instruction: "Never use photographs",
          enforcement: "locked" as const,
          origin: "supplied" as const,
        },
      ],
    };
    const result = buildDesignSystemInterpretationProposal(base, output(), []);
    expect(result.definition).toEqual(base);
    expect(result.conflicts).toHaveLength(2);
    expect(result.capabilities[0]?.status).toBe("unsupported");
    // Publication may save a draft with unsupported locks; compilation remains a gate.
    const snapshot = {
      schemaVersion: "1.0",
      name: "Journal",
      definition: result.definition,
      assets: [],
    };
    expect(() =>
      compileCustomDesign({
        systemId: id,
        versionId: id,
        contentHash: designSystemContentHash(snapshot),
        snapshot,
        scenes: [
          createDefaultStoryboardSceneSpec("hook", {
            id,
            order: 0,
            durationSeconds: 10,
          }),
        ],
      }),
    ).toThrow();
  });
  it("rejects arbitrary executable fields and non-authorized paid requests", () => {
    const request = {
      projectId: id,
      expectedRevision: 1,
      request: "More editorial",
      assetIds: [],
      paidActionConfirmed: true,
    };
    expect(
      requestDesignSystemInterpretationSchema.safeParse(request).success,
    ).toBe(true);
    expect(
      requestDesignSystemInterpretationSchema.safeParse({
        ...request,
        paidActionConfirmed: false,
      }).success,
    ).toBe(false);
    expect(
      designSystemInterpretationOutputSchema.safeParse({
        ...output(),
        css: "body{}",
      }).success,
    ).toBe(false);
    expect(
      designSystemInterpretationOutputSchema.safeParse({ ...output(), x: 100 })
        .success,
    ).toBe(false);
  });
});
