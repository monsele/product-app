import { describe, expect, it } from "vitest";
import {
  anyCreativeDesignManifestSchema,
  authoredCinemaBeats,
  carryForwardCinemaDesign,
  cinemaComposition,
  cinemaCompositionCatalogue,
  cinemaCompositionEligibility,
  captionMsToFrame,
  cinemaCaptionsSha256,
  cinemaFinalHoldFrames,
  cinemaIllustrationBudget,
  cinemaIllustrationKey,
  cinemaIllustrationPrompt,
  cinemaPackArtDirection,
  planCinemaIllustrations,
  cinemaBeatRevealFrames,
  creativeDesignAssetIds,
  creativeDesignStyleLabel,
  eligibleCinemaCompositions,
  groundCinemaBeats,
  groundCinemaDisplay,
  groundVisualPlanProposal,
  isGroundedDisplayWording,
  linearGraphOrder,
  planCinemaDesign,
  resolveCinemaBeatFrames,
  resolveCinemaTiming,
  selectCinemaCompositions,
  validateCreativeDesignManifestV2,
  visualPlanProposalSchema,
  type CinemaCompositionFamily,
  type CinemaIllustrationBrief,
} from "./creative-design-v2.js";
import {
  createDefaultCreativeDesignManifest,
  creativeDesignPackIds,
  creativeDesignHash,
  creativeDesignSceneTypes,
} from "./creative-design.js";
import { sceneSpecSchema, sceneTemplateValues, type SceneSpec } from "./index.js";

const sourceRef = (section: number) => ({
  documentId: "00000000-0000-7000-8000-000000000101",
  parsedDocumentVersion: 1,
  pageStart: 1,
  sectionId: `00000000-0000-7000-8000-00000000030${section}`,
  blockIds: ["00000000-0000-7000-8000-000000000111"],
});

let sceneCounter = 0;
function scene(
  template: SceneSpec["template"],
  visual: unknown,
  narration: string,
  extra: Record<string, unknown> = {},
): SceneSpec {
  sceneCounter += 1;
  return sceneSpecSchema.parse({
    id: `00000000-0000-7000-8000-000000000${String(400 + sceneCounter)}`,
    order: sceneCounter,
    narration,
    durationSeconds: 24,
    onScreenText: [],
    transition: "fade",
    assetBindings: [],
    sourceRefs: [sourceRef(Math.min(9, 1 + Math.floor(sceneCounter / 3)))],
    generatedAdditions: [],
    template,
    visual,
    ...extra,
  });
}

/** Mirrors the investigated eight-scene lesson's template mix. */
function investigatedLesson(): SceneSpec[] {
  sceneCounter = 0;
  return [
    scene(
      "hook",
      { question: "Why does money grow over time?", prompt: "Think about saving." },
      "Why does money grow over time? Imagine putting coins in a jar. Now imagine the jar adds coins on its own.",
      { title: "Money that grows" },
    ),
    scene(
      "definition",
      {
        term: "Compound interest",
        definition: "Interest earned on both your savings and past interest.",
        exampleLabel: "For example",
        exampleText: "interest on interest",
      },
      "Compound interest is interest earned on your savings and on the interest you already earned. It builds on itself.",
      { title: "Compound interest" },
    ),
    scene(
      "process",
      { steps: ["Save money", "Earn interest", "Add interest to savings", "Earn more interest"] },
      "First you save money. Then the bank pays interest. The interest joins your savings. Next year you earn interest on the bigger amount.",
      { title: "How compounding works" },
    ),
    scene(
      "comparison",
      {
        leftSubject: { label: "Simple interest" },
        rightSubject: { label: "Compound interest" },
        similarities: ["Both reward saving"],
        differences: ["Simple pays on savings only", "Compound pays on interest too"],
      },
      "Simple interest pays only on what you saved. Compound interest also pays on the interest. Both reward saving.",
      { title: "Simple versus compound" },
    ),
    scene(
      "cause-effect",
      {
        causes: [{ id: "time", label: "More time saving" }],
        effects: [{ id: "growth", label: "Faster growth" }],
        connections: [{ from: "time", to: "growth" }],
      },
      "The longer you save, the more interest piles up. More time means faster growth.",
      { title: "Why time matters" },
    ),
    scene(
      "worked-example",
      {
        problem: "You save 100 dollars at 10 percent a year. How much after two years?",
        steps: ["Year one: 100 plus 10 is 110", "Year two: 110 plus 11 is 121"],
        answer: "121 dollars",
      },
      "You save 100 dollars at 10 percent. After year one you have 110. After year two you have 121 dollars.",
      { title: "Two years of saving" },
    ),
    scene(
      "analogy",
      {
        sourceConcept: "Compound interest",
        familiarSystem: "A snowball rolling downhill",
        mappings: [
          { concept: "Savings", analogy: "Snowball" },
          { concept: "Interest", analogy: "New snow" },
        ],
      },
      "Compound interest is like a snowball rolling downhill. The snowball is your savings. The new snow is interest.",
      { title: "A snowball of savings" },
    ),
    scene(
      "summary",
      {
        takeaways: [
          { text: "Compound interest pays interest on interest." },
          { text: "Time makes savings grow faster." },
          { text: "Start saving early." },
        ],
        callToAction: "Start a savings jar today.",
      },
      "Compound interest pays interest on interest. Time makes savings grow faster. So start saving early.",
      { title: "Remember" },
    ),
  ];
}

const familyOf = (id: Parameters<typeof cinemaComposition>[0]) =>
  cinemaComposition(id).family;

describe("ST-109 composition catalogue", () => {
  it("registers eight families across ten compositions with fixed versions", () => {
    expect(new Set(cinemaCompositionCatalogue.map((entry) => entry.family)).size).toBe(8);
    for (const entry of cinemaCompositionCatalogue)
      expect(entry.version).toBe("1.0.0");
  });

  it("offers every semantic scene type at least two arrangements that differ in placement", () => {
    for (const template of sceneTemplateValues) {
      const compatible = cinemaCompositionCatalogue.filter((entry) =>
        entry.sceneTypes.includes(template),
      );
      expect(compatible.length, template).toBeGreaterThanOrEqual(2);
      // Genuinely different: a different family, or the same family with a
      // different weight (placement) and image use.
      const signatures = new Set(
        compatible.map((entry) => `${entry.family}|${entry.weight}|${entry.imageUse}`),
      );
      expect(signatures.size, template).toBeGreaterThanOrEqual(2);
    }
    expect(creativeDesignSceneTypes).toEqual(sceneTemplateValues);
  });

  it("always has an eligible composition for extreme but valid content", () => {
    sceneCounter = 0;
    const long = (length: number) => "word ".repeat(Math.ceil(length / 5)).slice(0, length).trim();
    const extremes = [
      scene(
        "labelled-diagram",
        {
          kind: "shapes",
          shape: "cell",
          labels: Array.from({ length: 20 }, (_, index) => ({
            anchor: "left",
            id: `part-${index}`,
            text: `Part ${index} ${long(60)}`.slice(0, 80),
          })),
        },
        "A cell has many parts.",
        { durationSeconds: 3 },
      ),
      scene(
        "worked-example",
        {
          problem: long(1_000),
          steps: Array.from({ length: 12 }, () => long(300)),
          answer: long(1_000),
        },
        "Work through it.",
        { durationSeconds: 3 },
      ),
    ];
    for (const template of sceneTemplateValues) {
      const matching = extremes.filter((entry) => entry.template === template);
      for (const entry of matching)
        expect(eligibleCinemaCompositions(entry).length, template).toBeGreaterThanOrEqual(1);
    }
    for (const entry of investigatedLesson().map((value) => ({ ...value, durationSeconds: 3 })))
      expect(eligibleCinemaCompositions(entry).length, entry.template).toBeGreaterThanOrEqual(1);
  });

  it("refuses a sequence for content that is not a single path", () => {
    sceneCounter = 0;
    const branching = scene(
      "cause-effect",
      {
        nodes: [
          { id: "a", label: "Rain", kind: "cause" },
          { id: "b", label: "Flood", kind: "effect" },
          { id: "c", label: "Crops grow", kind: "effect" },
        ],
        edges: [
          { id: "e1", from: "a", to: "b" },
          { id: "e2", from: "a", to: "c" },
        ],
      },
      "Rain can flood a field. Rain also helps crops grow.",
    );
    expect(cinemaCompositionEligibility("sequence", branching).eligible).toBe(false);
    expect(cinemaCompositionEligibility("connected", branching).eligible).toBe(true);
    expect(linearGraphOrder([{ id: "a" }, { id: "b" }], [{ from: "a", to: "b" }])).toEqual(["a", "b"]);
  });
});

describe("ST-109 manifest releases", () => {
  it("reads v1 and v2 through one reader with distinct canonical hashes", () => {
    const scenes = investigatedLesson();
    const v1 = createDefaultCreativeDesignManifest({
      packId: "everyday",
      scenes: scenes.map((entry) => ({
        id: entry.id,
        template: entry.template,
        durationSeconds: entry.durationSeconds,
      })),
    });
    const v2 = planCinemaDesign({ packId: "everyday", scenes, seed: "0123456789abcdef" });
    expect(anyCreativeDesignManifestSchema.parse(v1).manifestVersion).toBe("1.0");
    expect(anyCreativeDesignManifestSchema.parse(v2).manifestVersion).toBe("2.0");
    expect(creativeDesignHash(v1)).not.toBe(creativeDesignHash(v2));
    expect(creativeDesignStyleLabel(v2)).toBe("Everyday");
    expect(creativeDesignStyleLabel(v1)).toBe("Everyday");
    expect(creativeDesignStyleLabel(undefined)).toBe("Legacy default theme");
  });

  it("rejects CSS, coordinates and unknown fields in a v2 manifest", () => {
    const v2 = planCinemaDesign({
      packId: "prism",
      scenes: investigatedLesson(),
      seed: "0123456789abcdef",
    });
    const sceneId = Object.keys(v2.scenes)[0]!;
    const tampered = {
      ...v2,
      scenes: { ...v2.scenes, [sceneId]: { ...v2.scenes[sceneId], style: { left: 20 } } },
    };
    expect(anyCreativeDesignManifestSchema.safeParse(tampered).success).toBe(false);
  });

  it("lists pinned presentation imagery with the logo for asset resolution", () => {
    const scenes = investigatedLesson();
    const heroId = "00000000-0000-7000-8000-000000000999";
    const v2 = planCinemaDesign({
      packId: "everyday",
      scenes,
      seed: "0123456789abcdef",
      imagery: { [scenes[0]!.id]: { assetId: heroId, origin: "generated", altText: "Coins in a jar" } },
    });
    expect(creativeDesignAssetIds(v2)).toEqual([heroId]);
  });
});

describe("ST-109 whole-video selection", () => {
  it("gives the investigated lesson at least six composition families", () => {
    const scenes = investigatedLesson();
    for (const seed of ["0123456789abcdef", "fedcba9876543210", "00000000000000aa"]) {
      const manifest = planCinemaDesign({ packId: "everyday", scenes, seed });
      const families = new Set(
        Object.values(manifest.scenes).map((design) => familyOf(design.compositionId)),
      );
      expect(families.size, seed).toBeGreaterThanOrEqual(6);
      expect(validateCreativeDesignManifestV2(manifest, scenes)).toEqual([]);
    }
  });

  it("is deterministic for a seed and varies across seeds", () => {
    const scenes = investigatedLesson();
    const planning = scenes.map((entry) => ({ scene: entry, hasImage: false }));
    const first = selectCinemaCompositions({ scenes: planning, seed: "0123456789abcdef" });
    expect(selectCinemaCompositions({ scenes: planning, seed: "0123456789abcdef" })).toEqual(first);
    const variants = new Set(
      Array.from({ length: 12 }, (_, index) =>
        JSON.stringify(
          selectCinemaCompositions({
            scenes: planning,
            seed: index.toString(16).padStart(16, "0"),
          }),
        ),
      ),
    );
    expect(variants.size).toBeGreaterThan(1);
  });

  it("never uses one family three times running when an alternative exists", () => {
    sceneCounter = 0;
    const processes = Array.from({ length: 6 }, (_, index) =>
      scene(
        "process",
        { steps: [`Step ${index} a`, `Step ${index} b`, `Step ${index} c`] },
        "First do this. Then do that. Finally finish.",
      ),
    );
    for (const seed of ["0123456789abcdef", "1111111111111111", "abcdefabcdefabcd"]) {
      const selection = selectCinemaCompositions({
        scenes: processes.map((entry) => ({ scene: entry, hasImage: false })),
        seed,
      });
      const families: CinemaCompositionFamily[] = processes.map(
        (entry) => familyOf(selection[entry.id]!.compositionId),
      );
      for (let index = 2; index < families.length; index += 1)
        expect(
          families[index] === families[index - 1] && families[index] === families[index - 2],
          `${seed}: ${families.join(",")}`,
        ).toBe(false);
    }
  });

  it("keeps a teacher lock that still fits and refuses one that does not", () => {
    const scenes = investigatedLesson();
    const hook = scenes[0]!;
    const locked = selectCinemaCompositions({
      scenes: scenes.map((entry) => ({ scene: entry, hasImage: false })),
      seed: "0123456789abcdef",
      locks: { [hook.id]: "chapter" },
    });
    expect(locked[hook.id]).toEqual({ compositionId: "chapter", locked: true });
    expect(() =>
      selectCinemaCompositions({
        scenes: scenes.map((entry) => ({ scene: entry, hasImage: false })),
        seed: "0123456789abcdef",
        locks: { [hook.id]: "connected" },
      }),
    ).toThrow(/no longer fits/);
  });

  it("prefers picture-led arrangements when an illustration is available", () => {
    const scenes = investigatedLesson();
    const hook = scenes[0]!;
    const withImage = Array.from({ length: 16 }, (_, index) =>
      selectCinemaCompositions({
        scenes: [{ scene: hook, hasImage: true }],
        seed: index.toString(16).padStart(16, "0"),
      })[hook.id]!.compositionId,
    );
    expect(withImage.filter((id) => id === "illustrated-headline").length).toBeGreaterThan(8);
  });
});

describe("ST-109 display wording", () => {
  it("accepts wording built from approved content and rejects new words or numbers", () => {
    const approved = [
      "Compound interest is interest earned on your savings and on the interest you already earned.",
    ];
    expect(isGroundedDisplayWording("Interest on your interest", approved)).toBe(true);
    expect(isGroundedDisplayWording("Savings earned", approved)).toBe(true);
    expect(isGroundedDisplayWording("Interest doubles your savings", approved)).toBe(false);
    expect(isGroundedDisplayWording("Earn 20% interest", approved)).toBe(false);
  });

  it("falls back to the authored display for an ungrounded proposal", () => {
    const [hook] = investigatedLesson();
    const grounded = groundCinemaDisplay(hook!, {
      headline: "Money grows by magic",
      kicker: "the big question",
      emphasis: ["grow", "banana"],
    });
    expect(grounded.display.headline).toBe("Money that grows");
    expect(grounded.display.kicker).toBe("the big question");
    expect(grounded.display.emphasis).toEqual(["grow"]);
    expect(grounded.rejected).toEqual(["headline", "emphasis"]);
  });

  it("validation refuses a manifest whose headline was edited to a new claim", () => {
    const scenes = investigatedLesson();
    const manifest = planCinemaDesign({ packId: "essential", scenes, seed: "0123456789abcdef" });
    const sceneId = scenes[1]!.id;
    const tampered = {
      ...manifest,
      scenes: {
        ...manifest.scenes,
        [sceneId]: {
          ...manifest.scenes[sceneId]!,
          display: { ...manifest.scenes[sceneId]!.display, headline: "Banks double money yearly" },
        },
      },
    };
    expect(validateCreativeDesignManifestV2(tampered, scenes).join(" ")).toMatch(
      /wording not in its approved content/,
    );
  });
});

describe("ST-110 visual-plan proposal grounding", () => {
  it("applies grounded preferences and drops beats the composition cannot show", () => {
    const scenes = investigatedLesson();
    const processScene = scenes[2]!;
    const proposal = visualPlanProposalSchema.parse({
      scenes: [
        {
          sceneId: processScene.id,
          compositions: ["hero-indexed"],
          headline: "How savings compound",
          illustration: {
            concept: "savings jar",
            description: "A glass jar of coins that grows taller step by step.",
            subject: "object",
          },
          beats: [
            { target: "item-1", motion: "sequential-reveal", sentence: 0 },
            { target: "item-9", motion: "sequential-reveal", sentence: 1 },
            { target: "item-2", motion: "sequential-reveal", sentence: 1, phrase: "bank pays" },
          ],
        },
      ],
    });
    const manifest = planCinemaDesign({
      packId: "everyday",
      scenes,
      seed: "0123456789abcdef",
      proposal,
      modelCallId: "00000000-0000-7000-8000-000000000777",
    });
    const design = manifest.scenes[processScene.id]!;
    expect(manifest.plan.source).toBe("model");
    expect(design.imagery.brief?.concept).toBe("savings jar");
    expect(design.beats.map((beat) => beat.target)).toEqual(["item-1", "item-2"]);
    expect(validateCreativeDesignManifestV2(manifest, scenes)).toEqual([]);
  });

  it("drops unsupported scenes, compositions, wording and beats without applying them (AC2)", () => {
    const scenes = investigatedLesson();
    const [hook, , processScene, comparison] = scenes;
    const proposal = visualPlanProposalSchema.parse({
      scenes: [
        { sceneId: "00000000-0000-7000-8000-000000000999", compositions: ["statement"] },
        {
          sceneId: comparison!.id,
          // A sequence cannot present a comparison; the split can.
          compositions: ["sequence", "comparison-split"],
          headline: "Compound interest doubles every 7 years",
          kicker: "compare",
          beats: [
            { target: "left", motion: "sequential-reveal", sentence: 0 },
            { target: "right", motion: "sequential-reveal", sentence: 9 },
          ],
        },
        { sceneId: comparison!.id, compositions: ["comparison-stacked"] },
        {
          sceneId: processScene!.id,
          compositions: ["sequence"],
          emphasis: ["interest", "bonus"],
          beats: [{ target: "item-1", motion: "path-build", sentence: 0, phrase: "not said" }],
        },
        { sceneId: hook!.id, compositions: ["statement"], headline: "Why does money grow" },
      ],
    });
    const { proposal: grounded, dropped } = groundVisualPlanProposal(proposal, scenes);
    expect(grounded.scenes.map((entry) => entry.sceneId)).toEqual([
      comparison!.id,
      processScene!.id,
      hook!.id,
    ]);
    const comparisonPlan = grounded.scenes[0]!;
    expect(comparisonPlan.compositions).toEqual(["comparison-split"]);
    expect(comparisonPlan.headline).toBeUndefined();
    expect(comparisonPlan.kicker).toBe("compare");
    expect(comparisonPlan.beats?.map((beat) => beat.target)).toEqual(["left"]);
    expect(grounded.scenes[1]!.beats).toEqual([]);
    expect(grounded.scenes[2]!.headline).toBe("Why does money grow");
    expect(dropped.map((entry) => `${entry.sceneId ?? "-"}:${entry.field}`).sort()).toEqual(
      [
        "-:scene",
        `${comparison!.id}:scene`,
        `${comparison!.id}:compositions`,
        `${comparison!.id}:headline`,
        `${comparison!.id}:beats`,
        `${processScene!.id}:emphasis`,
        `${processScene!.id}:beats`,
      ].sort(),
    );
    // The authored reasons never echo model text back.
    expect(JSON.stringify(dropped)).not.toMatch(/doubles|not said/u);
    // Grounding is idempotent, and the grounded plan builds a valid design.
    expect(groundVisualPlanProposal(grounded, scenes).dropped).toEqual([]);
    const manifest = planCinemaDesign({
      packId: "prism",
      scenes,
      seed: "0123456789abcdef",
      proposal: grounded,
    });
    expect(manifest.scenes[comparison!.id]!.compositionId).toBe("comparison-split");
    expect(validateCreativeDesignManifestV2(manifest, scenes)).toEqual([]);
  });

  it("keeps emphasis only for words the scene sets large", () => {
    const scenes = investigatedLesson();
    const definition = scenes[1]!;
    const { proposal, dropped } = groundVisualPlanProposal(
      visualPlanProposalSchema.parse({
        scenes: [
          {
            sceneId: definition.id,
            compositions: ["statement"],
            emphasis: ["Compound", "unicorn"],
          },
        ],
      }),
      scenes,
    );
    expect(proposal.scenes[0]!.emphasis).toEqual(["Compound"]);
    expect(dropped.map((entry) => entry.field)).toEqual(["emphasis"]);
  });

  it("accepts an emphasised word in another case or form, in the scene's own spelling", () => {
    const definition = investigatedLesson()[1]!;
    const grounded = groundCinemaDisplay(definition, { emphasis: ["compound", "Interests"] });
    expect(grounded.display.emphasis).toEqual(["Compound", "interest"]);
    expect(grounded.rejected).toEqual([]);
  });

  it("keeps the authored emphasis when no proposed word is in the primary text", () => {
    const scenes = investigatedLesson();
    const definition = scenes[1]!;
    const grounded = groundCinemaDisplay(definition, { emphasis: ["unicorn"] });
    expect(grounded.display.emphasis).toEqual(groundCinemaDisplay(definition, {}).display.emphasis);
    expect(grounded.display.emphasis.length).toBeGreaterThan(0);
    expect(grounded.rejected).toEqual(["emphasis"]);
    const { proposal, dropped } = groundVisualPlanProposal(
      visualPlanProposalSchema.parse({
        scenes: [{ sceneId: definition.id, compositions: ["statement"], emphasis: ["unicorn"] }],
      }),
      scenes,
    );
    expect(proposal.scenes[0]!.emphasis).toBeUndefined();
    expect(dropped.map((entry) => entry.field)).toEqual(["emphasis"]);
  });

  it.each([
    ["a hex colour", "A jar of coins in #ff3366 on white."],
    ["a CSS colour function", "A jar tinted rgb(255, 0, 0)."],
    ["CSS declarations", "A jar; color: red; margin: 4px"],
    ["pixel sizes", "A jar 400px tall in the middle."],
    ["a font", "A jar with a serif font title."],
    ["coordinates", "Place the jar at x=120 and y=40."],
    ["a coordinate pair", "A jar drawn at (120, 40) on the canvas."],
    ["a URL", "Like the jar at https://example.com/jar.png"],
    ["code", "const jar = () => coins"],
    ["markup", "<div>A jar</div>"],
    ["writing in the picture", "A jar with the label SAVINGS written on it."],
    ["numbers in the picture", "A jar showing numbers for each year."],
  ])("refuses an illustration brief carrying %s (AC1)", (_, description) => {
    const scenes = investigatedLesson();
    const { proposal, dropped } = groundVisualPlanProposal(
      visualPlanProposalSchema.parse({
        scenes: [
          {
            sceneId: scenes[0]!.id,
            compositions: ["illustrated-headline"],
            illustration: { concept: "savings jar", description, subject: "object" },
          },
        ],
      }),
      scenes,
    );
    expect(proposal.scenes[0]!.illustration).toBeUndefined();
    expect(dropped.map((entry) => entry.field)).toEqual(["illustration"]);
  });

  it("keeps a plain subject brief, including people and ordinary subject colours", () => {
    const scenes = investigatedLesson();
    const illustration = {
      concept: "saver at a bank",
      description: "A smiling child drops a coin into a green piggy bank on a kitchen table.",
      subject: "person" as const,
    };
    const { proposal, dropped } = groundVisualPlanProposal(
      visualPlanProposalSchema.parse({
        artDirection: { treatment: "ink-sketch", humanFigures: true },
        scenes: [{ sceneId: scenes[0]!.id, compositions: ["illustrated-headline"], illustration }],
      }),
      scenes,
    );
    expect(dropped).toEqual([]);
    expect(proposal.scenes[0]!.illustration).toEqual(illustration);
    expect(proposal.artDirection).toEqual({ treatment: "ink-sketch", humanFigures: true });
  });

  it("rejects code, CSS, coordinates, colours and fonts as plan fields (AC1)", () => {
    const scenes = investigatedLesson();
    for (const extra of [
      { css: "color: red" },
      { x: 10, y: 20 },
      { colors: { accent: "#ff0000" } },
      { fontPair: "serif" },
      { code: "render()" },
    ]) {
      expect(
        visualPlanProposalSchema.safeParse({
          scenes: [{ sceneId: scenes[0]!.id, compositions: ["statement"], ...extra }],
        }).success,
      ).toBe(false);
      expect(
        visualPlanProposalSchema.safeParse({
          ...extra,
          scenes: [{ sceneId: scenes[0]!.id, compositions: ["statement"] }],
        }).success,
      ).toBe(false);
    }
  });
});

describe("ST-110 presentation illustrations", () => {
  const jar: CinemaIllustrationBrief = { concept: "savings jar", description: "A glass jar filling with coins.", subject: "object" };
  const snowball: CinemaIllustrationBrief = { concept: "snowball", description: "A snowball rolling downhill and growing.", subject: "object" };

  /** Hook and analogy picture-led, definition text-only, summary with an inset. */
  function designWithBriefs(
    briefs: Readonly<Record<number, CinemaIllustrationBrief | null>>,
    scenes = investigatedLesson(),
  ) {
    const manifest = planCinemaDesign({
      packId: "everyday",
      scenes,
      seed: "0123456789abcdef",
      locks: {
        [scenes[0]!.id]: "illustrated-headline",
        [scenes[1]!.id]: "statement",
        [scenes[6]!.id]: "illustrated-headline",
        [scenes[7]!.id]: "chapter",
      },
    });
    const withBriefs = {
      ...manifest,
      scenes: Object.fromEntries(
        Object.entries(manifest.scenes).map(([id, design]) => {
          const index = scenes.findIndex((entry) => entry.id === id);
          const brief = briefs[index];
          return [id, brief === undefined ? design : { ...design, imagery: { ...design.imagery, brief } }];
        }),
      ),
    };
    return { scenes, manifest: withBriefs };
  }

  it("budgets eight per five minutes, at least one, capped at twelve", () => {
    expect([0, 30, 180, 300, 301, 450, 600, 3_600].map(cinemaIllustrationBudget)).toEqual([
      1, 1, 5, 8, 9, 12, 12, 12,
    ]);
  });

  it("deduplicates by concept and treatment", () => {
    expect(cinemaIllustrationKey("A savings jar", "flat")).toBe(cinemaIllustrationKey("savings jars", "flat"));
    expect(cinemaIllustrationKey("savings jar", "flat")).not.toBe(cinemaIllustrationKey("savings jar", "ink-sketch"));
    expect(cinemaIllustrationKey("savings jar", "flat")).not.toBe(cinemaIllustrationKey("piggy bank", "flat"));
  });

  it("generates one picture per concept, skips text-only compositions and reuses what exists", () => {
    const { scenes, manifest } = designWithBriefs({ 0: jar, 1: snowball, 6: { ...jar, concept: "Savings jars" }, 7: snowball });
    const plan = planCinemaIllustrations({ manifest, scenes, targetDurationSeconds: 180 });
    expect(plan.budget).toBe(5);
    // The definition's composition shows no picture, so its brief costs nothing.
    expect(plan.generate.map((entry) => [entry.brief.concept, entry.sceneIds])).toEqual([
      ["savings jar", [scenes[0]!.id, scenes[6]!.id]],
      ["snowball", [scenes[7]!.id]],
    ]);
    expect(plan.motif).toEqual([]);

    const reused = planCinemaIllustrations({
      manifest,
      scenes,
      targetDurationSeconds: 180,
      reusable: {
        [cinemaIllustrationKey("savings jar", "flat")]: {
          assetId: "00000000-0000-7000-8000-000000000901",
          origin: "generated",
        },
      },
    });
    expect(reused.generate.map((entry) => entry.brief.concept)).toEqual(["snowball"]);
    expect(reused.reuse.map((entry) => [entry.sceneId, entry.hero.assetId])).toEqual([
      [scenes[0]!.id, "00000000-0000-7000-8000-000000000901"],
      [scenes[6]!.id, "00000000-0000-7000-8000-000000000901"],
    ]);
  });

  it("serves picture-led scenes first and falls back to the motif past the budget", () => {
    const { scenes, manifest } = designWithBriefs({ 0: jar, 6: snowball, 7: { ...jar, concept: "coin stack" } });
    const plan = planCinemaIllustrations({
      manifest,
      scenes,
      targetDurationSeconds: 300,
      alreadyGenerated: 6,
    });
    expect(plan.generate.map((entry) => entry.brief.concept)).toEqual(["savings jar", "snowball"]);
    expect(plan.motif).toEqual([{ sceneId: scenes[7]!.id, reason: "over_budget" }]);
    expect(
      planCinemaIllustrations({ manifest, scenes, targetDurationSeconds: 300, alreadyGenerated: 12 }).generate,
    ).toEqual([]);
  });

  it("keeps the scene's own picture and draws no people when the art direction excludes them", () => {
    const scenes = investigatedLesson();
    scenes[0] = sceneSpecSchema.parse({
      ...scenes[0],
      assetBindings: [
        {
          assetId: "00000000-0000-7000-8000-000000000902",
          provenance: "source_figure",
          role: "illustration",
          slot: "subject",
          visualRole: "decorative",
        },
      ],
    });
    const { manifest } = designWithBriefs({ 0: jar, 6: { ...snowball, subject: "person" } }, scenes);
    const plan = planCinemaIllustrations({
      manifest: { ...manifest, artDirection: { ...manifest.artDirection, humanFigures: false } },
      scenes,
      targetDurationSeconds: 180,
    });
    expect(plan.generate).toEqual([]);
    expect(plan.motif).toEqual([{ sceneId: scenes[6]!.id, reason: "no_people" }]);
  });

  it("never plans or accepts a generated picture over evidence (AC5)", () => {
    const scenes = investigatedLesson();
    const diagram = scene(
      "labelled-diagram",
      { kind: "shapes", shape: "cell", labels: [{ anchor: "left", id: "wall", text: "Cell wall" }] },
      "The cell wall protects the cell.",
    );
    const lesson = [...scenes, diagram];
    const manifest = planCinemaDesign({ packId: "systems", scenes: lesson, seed: "0123456789abcdef" });
    const design = manifest.scenes[diagram.id]!;
    expect(cinemaComposition(design.compositionId).imageUse).not.toBe("none");
    const briefed = {
      ...manifest,
      scenes: { ...manifest.scenes, [diagram.id]: { ...design, imagery: { ...design.imagery, brief: jar } } },
    };
    expect(planCinemaIllustrations({ manifest: briefed, scenes: lesson, targetDurationSeconds: 300 })).toMatchObject({
      generate: [],
      motif: [{ sceneId: diagram.id, reason: "evidence_picture" }],
    });
    const pinned = (origin: "generated" | "source_figure") => ({
      ...manifest,
      scenes: {
        ...manifest.scenes,
        [diagram.id]: {
          ...design,
          imagery: {
            ...design.imagery,
            hero: { assetId: "00000000-0000-7000-8000-000000000903", origin, altText: "A cell" },
          },
        },
      },
    });
    expect(validateCreativeDesignManifestV2(pinned("generated"), lesson)).toEqual([
      `Scene ${diagram.id} shows evidence that a presentation illustration cannot replace.`,
    ]);
    expect(validateCreativeDesignManifestV2(pinned("source_figure"), lesson)).toEqual([]);
  });

  it("builds the image prompt from the brief and the shared art direction only", () => {
    const prompt = cinemaIllustrationPrompt({
      brief: jar,
      artDirection: cinemaPackArtDirection["field-notes"],
      palette: { accent: "#aa3300", diagramEmphasis: "#225588", surface: "#fff8ee" },
    });
    expect(prompt).toContain("A glass jar filling with coins. Main subject: savings jar.");
    expect(prompt).toContain("ink and pencil sketch");
    expect(prompt).toContain("No text, letters, numbers");
    expect(prompt.length).toBeLessThanOrEqual(2_000);
  });

  it("ST-112: asks for the identity's own background colour, so a dark style gets no white-backed picture", () => {
    const dark = cinemaIllustrationPrompt({
      brief: jar,
      artDirection: cinemaPackArtDirection.systems,
      palette: { accent: "#38bdf8", diagramEmphasis: "#22d3ee", surface: "#1e293b" },
    });
    expect(dark).toContain("solid #1e293b background");
    const vignette = cinemaIllustrationPrompt({
      brief: jar,
      artDirection: cinemaPackArtDirection.everyday,
      palette: { accent: "#1d4ed8", diagramEmphasis: "#059669", surface: "#ffffff" },
    });
    expect(vignette).toContain("fades to a plain, solid #ffffff background");
  });
});

describe("ST-111 pinned timing", () => {
  it("pins each scene's resolved frames and the captions they came from", () => {
    const scenes = investigatedLesson();
    const manifest = planCinemaDesign({ packId: "everyday", scenes, seed: "0123456789abcdef" });
    const process = scenes[2]!;
    const captions = [
      { startMs: 400, endMs: 2_050, text: "First you save money." },
      { startMs: 2_050, endMs: 5_000, text: "Then the bank pays interest." },
    ];
    const timing = resolveCinemaTiming({ manifest, scenes, captionsBySceneId: { [process.id]: captions } });
    expect(Object.keys(timing.scenes).sort()).toEqual(scenes.map((scene) => scene.id).sort());
    expect(timing.scenes[process.id]).toEqual({
      captionsSha256: cinemaCaptionsSha256(captions),
      beatFrames: [
        ...resolveCinemaBeatFrames({
          beats: manifest.scenes[process.id]!.beats,
          narration: process.narration,
          cues: captions.map((cue) => ({
            startFrame: captionMsToFrame(cue.startMs),
            endFrame: captionMsToFrame(cue.endMs),
            text: cue.text,
          })),
          durationInFrames: process.durationSeconds * 30,
        }),
      ],
    });
    // A scene without captions pins its proportional timing.
    const hook = scenes[0]!;
    expect(timing.scenes[hook.id]!.beatFrames).toEqual([
      ...resolveCinemaBeatFrames({
        beats: manifest.scenes[hook.id]!.beats,
        narration: hook.narration,
        cues: [],
        durationInFrames: hook.durationSeconds * 30,
      }),
    ]);
    // Deterministic, and sensitive to any caption change.
    expect(resolveCinemaTiming({ manifest, scenes, captionsBySceneId: { [process.id]: captions } })).toEqual(timing);
    expect(cinemaCaptionsSha256([{ ...captions[0]!, text: "First you save." }, captions[1]!])).not.toBe(
      cinemaCaptionsSha256(captions),
    );
    expect(cinemaCaptionsSha256([{ ...captions[0]!, endMs: 2_051 }, captions[1]!])).not.toBe(
      cinemaCaptionsSha256(captions),
    );
  });
});

describe("ST-111 beat resolution", () => {
  const narration =
    "First you save money. Then the bank pays interest. The interest joins your savings. Next year you earn more.";

  it("anchors beats to where their text is spoken", () => {
    const cues = [
      { startFrame: 0, endFrame: 60, text: "First you save money." },
      { startFrame: 60, endFrame: 150, text: "Then the bank pays interest." },
      { startFrame: 150, endFrame: 240, text: "The interest joins your savings." },
      { startFrame: 240, endFrame: 330, text: "Next year you earn more." },
    ];
    const frames = resolveCinemaBeatFrames({
      beats: [
        { target: "item-1", motion: "sequential-reveal", anchor: { sentence: 0 } },
        { target: "item-2", motion: "sequential-reveal", anchor: { sentence: 1 } },
        { target: "item-3", motion: "sequential-reveal", anchor: { sentence: 2, phrase: "joins your savings" } },
        { target: "item-4", motion: "sequential-reveal", anchor: { sentence: 3 } },
      ],
      narration,
      cues,
      durationInFrames: 400,
    });
    expect(frames[1]).toBe(60);
    expect(frames[2]!).toBeGreaterThan(150);
    expect(frames[2]!).toBeLessThan(240);
    expect(frames[3]).toBe(240);
    expect([...frames]).toEqual([...frames].sort((left, right) => left - right));
  });

  it("falls back to proportional timing without captions and never enters the final hold", () => {
    const frames = resolveCinemaBeatFrames({
      beats: [0, 1, 2, 3].map((sentence) => ({
        target: `item-${sentence + 1}`,
        motion: "sequential-reveal" as const,
        anchor: { sentence },
      })),
      narration,
      cues: [],
      durationInFrames: 120,
    });
    const latest = 120 - cinemaFinalHoldFrames - cinemaBeatRevealFrames;
    for (const frame of frames) expect(frame).toBeLessThanOrEqual(latest);
    expect(frames[0]).toBeGreaterThanOrEqual(6);
  });

  it("gives a long scene several focus changes from authored beats", () => {
    const scenes = investigatedLesson();
    const processScene = scenes[2]!;
    for (const composition of eligibleCinemaCompositions(processScene)) {
      const beats = authoredCinemaBeats(composition.id, processScene);
      const frames = resolveCinemaBeatFrames({
        beats,
        narration: processScene.narration,
        cues: [],
        durationInFrames: processScene.durationSeconds * 30,
      });
      expect(new Set(frames).size, composition.id).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("ST-112 a plan may time emphasis, never withhold content", () => {
  // As the engineering proof lesson was planned: the definition's own text
  // was anchored to the last sentence, so it showed for two seconds.
  const definition = scene(
    "definition",
    {
      term: "Tension vs. compression",
      definition: "Every member is pulled or pushed along its length.",
      exampleLabel: "Rope and spring",
      exampleText: "Rope = tension; spring = compression",
    },
    "Forces act on a truss. Each member is being pulled or being pushed. A pulled member is in tension. A pushed member is in compression. Think of a tug-of-war rope and a squashed spring.",
  );
  const beat = (target: string, sentence: number, phrase?: string) => ({
    target,
    motion: "sequential-reveal" as const,
    anchor: { sentence, ...(phrase === undefined ? {} : { phrase }) },
  });

  it("brings the heading in with the first sentence and the scene's text by mid-narration", () => {
    const grounded = groundCinemaBeats("hero-annotated", definition, [
      beat("headline", 1),
      beat("image", 2),
      beat("detail", 4, "tug-of-war rope"),
    ]);
    expect(grounded).toEqual([beat("headline", 0), beat("image", 2), beat("detail", 2)]);
    // Resolved against a 22 s scene, the text now has most of the scene to be read.
    const frames = resolveCinemaBeatFrames({
      beats: grounded,
      narration: definition.narration,
      cues: [],
      durationInFrames: 660,
    });
    expect(frames[0]).toBeLessThan(30);
    expect(frames[2]).toBeLessThan(330);
  });

  it("keeps narration order after moving a beat, so nothing is delayed behind it", () => {
    const grounded = groundCinemaBeats("hero-annotated", definition, [
      beat("image", 3),
      beat("detail", 4),
      beat("headline", 2, "tension"),
    ]);
    expect(grounded.map((entry) => [entry.target, entry.anchor.sentence])).toEqual([
      ["headline", 0],
      ["detail", 2],
      ["image", 3],
    ]);
    expect(grounded[0]!.anchor).toEqual({ sentence: 0 });
  });

  it("leaves beats that were already early enough exactly as proposed", () => {
    const proposed = [beat("headline", 0), beat("detail", 1, "pulled or being pushed"), beat("image", 3)];
    expect(groundCinemaBeats("hero-annotated", definition, proposed)).toEqual(proposed);
  });
});

describe("ST-109 carry-forward", () => {
  it("keeps a still-valid design and re-plans with the same seed when content changes", () => {
    const scenes = investigatedLesson();
    const manifest = planCinemaDesign({ packId: "systems", scenes, seed: "0123456789abcdef" });
    expect(carryForwardCinemaDesign({ previous: manifest, scenes })).toBe(manifest);
    const edited = scenes.map((entry, index) =>
      index === 2 ? { ...entry, durationSeconds: 2 } : entry,
    );
    const carried = carryForwardCinemaDesign({ previous: manifest, scenes: edited });
    // A two-second scene fits no composition, so nothing is invented.
    expect(carried).toBeUndefined();
    const retimed = scenes.map((entry, index) =>
      index === 2 ? { ...entry, durationSeconds: 12 } : entry,
    );
    const replanned = carryForwardCinemaDesign({ previous: manifest, scenes: retimed });
    expect(replanned?.variationSeed).toBe("0123456789abcdef");
    expect(replanned?.settings).toEqual(manifest.settings);
  });
});

describe("ST-109 authored fallback headlines", () => {
  it("validates the plan of an untitled scene, whose headline is the authored fallback", () => {
    sceneCounter = 0;
    const untitled = [
      scene("process", { steps: ["The sun warms the water", "The water evaporates", "The vapour rises"] }, "First the sun warms the water. Then the water evaporates. Finally the vapour rises."),
      scene(
        "worked-example",
        { problem: "What is 12 times 3?", steps: ["12 times 3 is 36"], answer: "36" },
        "Multiply 12 by 3. The answer is 36.",
      ),
    ];
    for (const packId of creativeDesignPackIds) {
      const manifest = planCinemaDesign({ packId, scenes: untitled, seed: "0123456789abcdef" });
      expect(manifest.scenes[untitled[0]!.id]!.display.headline).toBe("How it happens");
      expect(validateCreativeDesignManifestV2(manifest, untitled)).toEqual([]);
    }
  });

  it("still refuses an ungrounded headline that is not the authored fallback", () => {
    sceneCounter = 0;
    const untitled = [scene("process", { steps: ["Warm", "Evaporate"] }, "Water warms. Then it evaporates.")];
    const manifest = planCinemaDesign({ packId: "everyday", scenes: untitled, seed: "0123456789abcdef" });
    const id = untitled[0]!.id;
    const tampered = {
      ...manifest,
      scenes: { ...manifest.scenes, [id]: { ...manifest.scenes[id]!, display: { ...manifest.scenes[id]!.display, headline: "Rain causes floods" } } },
    };
    expect(validateCreativeDesignManifestV2(tampered, untitled)).toContain(
      `Scene ${id} headline contains wording not in its approved content.`,
    );
  });
});
