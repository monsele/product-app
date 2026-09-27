import { describe, expect, it } from "vitest";
import { togetherModelDefaults } from "@avlp/config";
import {
  currentNarrationGenerationCompatibility,
  currentObjectiveGenerationCompatibility,
  currentOutlineGenerationCompatibility,
  currentStoryboardGenerationCompatibility,
  lessonIntentOutputV1Schema,
  objectiveOutputV2Schema,
} from "@avlp/schemas";
import { DynamicMockLanguageModelProvider } from "./dynamic-mock-provider.js";
import {
  StaticPromptRegistry,
  renderPrompt,
  type PromptDefinition,
} from "./prompts.js";
import {
  describePromptAudience,
  describePromptFocus,
  focusAudienceVariables,
  repositoryPrompts,
} from "./prompts/index.js";

const registry = new StaticPromptRegistry(repositoryPrompts);

/** The ST-104 prompt versions, keyed by the variables each one needs. */
const focusAwarePrompts: ReadonlyArray<{
  definition: PromptDefinition;
  variables: Record<string, string>;
}> = [
  {
    definition: registry.get("objectives", "v3"),
    variables: {},
  },
  {
    definition: registry.get("outline", "v3"),
    variables: { objectives: "[]" },
  },
  {
    definition: registry.get("narration", "v4"),
    variables: { outline: "[]", wordBudgets: "{}" },
  },
  {
    definition: registry.get("storyboard", "v3"),
    variables: { templateCatalog: "[]", narration: "[]", outline: "[]" },
  },
];

const subjects = [
  {
    subject: "Structural engineering",
    heading: "Truss load paths",
    block: "A truss carries load through axial forces in its members.",
  },
  {
    subject: "Modern history",
    heading: "The printing press",
    block: "The printing press spread pamphlets quickly across Europe.",
  },
  {
    subject: "Cell biology",
    heading: "Mitochondria",
    block: "Mitochondria release energy from glucose during respiration.",
  },
] as const;

function configurationFor(subject: string, focusPrompt?: string) {
  return {
    configurationVersion: 1,
    lessonTitle: `${subject} lesson`,
    subject,
    ageBand: "adult-professional",
    difficulty: "advanced",
    tone: "academic",
    targetDurationSeconds: 180,
    includeRecallQuestions: false,
    ...(focusPrompt === undefined ? {} : { focusPrompt }),
  };
}

function render(
  entry: (typeof focusAwarePrompts)[number],
  params: Record<string, unknown>,
) {
  return renderPrompt(entry.definition, {
    sourcePackage: JSON.stringify({ sections: [] }),
    configuration: JSON.stringify(params),
    ...entry.variables,
    ...focusAudienceVariables(params),
  });
}

describe("ST-104 focus-aware prompt versions", () => {
  it("are the current generation versions and older versions stay registered", () => {
    expect(currentObjectiveGenerationCompatibility.promptVersion).toBe("v3");
    expect(currentOutlineGenerationCompatibility.promptVersion).toBe("v3");
    expect(currentNarrationGenerationCompatibility.promptVersion).toBe("v4");
    expect(currentStoryboardGenerationCompatibility.promptVersion).toBe("v3");
    for (const [promptId, version] of [
      ["objectives", "v2"],
      ["outline", "v2"],
      ["narration", "v3"],
      ["storyboard", "v2"],
    ] as const)
      expect(registry.get(promptId, version).version).toBe(version);
  });

  it.each(focusAwarePrompts.map((entry) => [entry.definition.promptId, entry]))(
    "%s renders with and without a focus and leaves no unfilled variable",
    (_promptId, entry) => {
      const withFocus = render(
        entry,
        configurationFor("History", "Why did print change religion?"),
      );
      expect(withFocus.user).toContain("Why did print change religion?");
      expect(withFocus.user).not.toMatch(/{{\s*[a-zA-Z0-9_-]+\s*}}/);
      const withoutFocus = render(entry, configurationFor("History"));
      expect(withoutFocus.user).toContain("\nnone\n");
      expect(withoutFocus.user).not.toMatch(/{{\s*[a-zA-Z0-9_-]+\s*}}/);
      // renderPrompt itself refuses to render with the focus slot unfilled.
      expect(() =>
        renderPrompt(entry.definition, {
          sourcePackage: "{}",
          configuration: "{}",
          ...entry.variables,
          audience: "any",
        }),
      ).toThrow(/missing variables: focus/);
    },
  );

  it.each(focusAwarePrompts.map((entry) => [entry.definition.promptId, entry]))(
    "%s is subject-neutral and drops the hardcoded age range",
    (_promptId, entry) => {
      const copy = `${entry.definition.system}\n${entry.definition.userTemplate}`;
      expect(copy).not.toMatch(/10-16|10–16/);
      expect(copy).not.toMatch(/science/i);
      expect(copy).not.toMatch(/\b(cell|plant)\b, /);
      expect(entry.definition.userTemplate).toContain("{{audience}}");
      expect(entry.definition.userTemplate).toContain("{{focus}}");
    },
  );

  it("describes audience and difficulty from the configuration, not a fixed range", () => {
    expect(
      describePromptAudience({
        ageBand: "adult-professional",
        difficulty: "advanced",
      }),
    ).toMatch(/professional practitioners.*advanced depth/);
    expect(
      describePromptAudience({ ageBand: "8-10", difficulty: "introductory" }),
    ).toMatch(/aged 8-10.*introductory depth/);
    expect(describePromptFocus({})).toBe("none");
    expect(describePromptFocus({ focusPrompt: "  Bearings  " })).toBe(
      "Bearings",
    );
  });

  it("objectives/v3 asks for the focus-coverage report", () => {
    const definition = registry.get("objectives", "v3");
    expect(definition.outputSchema).toBe("ObjectiveOutputV2");
    expect(definition.userTemplate).toContain('"objectives-v2"');
    for (const status of ["covered", "partial", "not_covered"])
      expect(definition.userTemplate).toContain(status);
  });
});

describe("ST-104 lesson-intent/v1", () => {
  it("renders from the focus and outline only", () => {
    const definition = registry.get("lesson-intent", "v1");
    const { user } = renderPrompt(definition, {
      focus: "How do trusses carry load?",
      documentOutline: JSON.stringify({
        title: "Bridges",
        headings: ["Trusses"],
      }),
    });
    expect(user).toContain("How do trusses carry load?");
    expect(user).toContain("Trusses");
    expect(definition.userTemplate).not.toContain("{{sourcePackage}}");
    expect(definition.allowedSourceContext).toMatch(/Never body text/);
  });
});

describe("ST-104 dynamic mock provider", () => {
  const provider = new DynamicMockLanguageModelProvider();

  async function objectivesFor(
    subject: (typeof subjects)[number],
    focusPrompt?: string,
  ) {
    const blockId = "018f1111-1111-7111-8111-111111111114";
    const params = configurationFor(subject.subject, focusPrompt);
    const entry = focusAwarePrompts[0]!;
    const rendered = renderPrompt(entry.definition, {
      sourcePackage: JSON.stringify({
        sections: [
          {
            heading: subject.heading,
            blocks: [{ blockId, text: subject.block }],
          },
        ],
      }),
      configuration: JSON.stringify(params),
      ...focusAudienceVariables(params),
    });
    const response = await provider.complete({
      model: togetherModelDefaults.llm,
      messages: [
        { role: "system", content: rendered.system },
        { role: "user", content: rendered.user },
      ],
      responseFormat: "json_object",
    });
    return objectiveOutputV2Schema.parse(JSON.parse(response.text));
  }

  it.each(subjects.map((subject) => [subject.subject, subject]))(
    "produces subject-appropriate v2 objectives for %s without science wording",
    async (_name, subject) => {
      const output = await objectivesFor(subject);
      expect(output.focusCoverage).toEqual({ status: "covered" });
      const text = JSON.stringify(output);
      expect(text).toContain(subject.subject);
      if (subject.subject !== "Cell biology")
        expect(text).not.toMatch(/science|environmental/i);
    },
  );

  it("reports covered, partial, and not_covered focus states", async () => {
    const history = subjects[1];
    expect((await objectivesFor(history, "pamphlets in Europe")).focusCoverage)
      .toEqual({ status: "covered" });
    expect(
      (await objectivesFor(history, "pamphlets and censorship")).focusCoverage,
    ).toEqual({ status: "partial", missing: ["censorship"] });
    const offTopic = await objectivesFor(history, "quantum entanglement");
    expect(offTopic.focusCoverage.status).toBe("not_covered");
  });

  it("returns a lesson intent from the outline", async () => {
    const definition = registry.get("lesson-intent", "v1");
    const rendered = renderPrompt(definition, {
      focus: "how trusses carry load?",
      documentOutline: JSON.stringify({ title: "Bridges", headings: [] }),
    });
    const response = await provider.complete({
      model: togetherModelDefaults.llm,
      messages: [
        { role: "system", content: rendered.system },
        { role: "user", content: rendered.user },
      ],
      responseFormat: "json_object",
    });
    expect(lessonIntentOutputV1Schema.parse(JSON.parse(response.text))).toEqual(
      {
        schemaVersion: "lesson-intent-v1",
        subject: "Bridges",
        lessonTitle: "How trusses carry load",
      },
    );
  });
});
