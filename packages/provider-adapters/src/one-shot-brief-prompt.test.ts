/**
 * ST-107 — the `one-shot-brief/v1` prompt, the `objectives/v4` brief slot,
 * and the deterministic mock brief.
 */
import { describe, expect, it } from "vitest";
import { createOneShotBriefOutputSchema } from "@avlp/schemas/one-shot";
import { DynamicMockLanguageModelProvider } from "./dynamic-mock-provider.js";
import { renderPrompt, StaticPromptRegistry } from "./prompts.js";
import { focusAudienceVariables, repositoryPrompts } from "./prompts/index.js";

const registry = new StaticPromptRegistry(repositoryPrompts);
const sectionIds = ["019ffc80-5ec1-7000-8000-000000000001", "019ffc80-5ec1-7000-8000-000000000002", "019ffc80-5ec1-7000-8000-000000000003"];

function renderBrief(focus: string) {
  return renderPrompt(registry.get("one-shot-brief", "v1"), {
    focus,
    audience: "adult learners",
    targetDurationSeconds: "180",
    minScenes: "3",
    maxScenes: "9",
    documentOutline: JSON.stringify({
      title: "Truss engineering",
      sections: [
        { sectionId: sectionIds[0], heading: "Load paths in trusses", firstBlock: "Loads travel along members." },
        { sectionId: sectionIds[1], heading: "Triangles and rigidity", firstBlock: "Triangles cannot deform." },
        { sectionId: sectionIds[2], heading: "Famous bridges", firstBlock: "The Forth Bridge." },
      ],
    }),
    stylePacks: JSON.stringify([{ id: "systems", description: "Diagrams." }, { id: "essential", description: "Clean." }]),
    soundBeds: JSON.stringify([{ trackId: "morning-pad", title: "Morning Pad", moods: ["calm"] }]),
  });
}

describe("ST-107 one-shot-brief/v1", () => {
  it("fills every slot and never mentions a cost for the model to produce", () => {
    const rendered = renderBrief("How do triangles keep trusses rigid?");
    expect(rendered.user).not.toMatch(/\{\{\w+\}\}/);
    expect(rendered.user).toContain("Plan between 3 and 9 scenes");
    expect(rendered.user.toLowerCase()).not.toContain("cost");
    expect(rendered.system).toContain("never invent a section ID");
  });

  it("gets a schema-valid, focus-matched brief from the deterministic mock", async () => {
    const provider = new DynamicMockLanguageModelProvider();
    const rendered = renderBrief("How do triangles keep trusses rigid under load?");
    const response = await provider.complete({
      model: provider.supportedModels[0],
      messages: [
        { role: "system", content: rendered.system },
        { role: "user", content: rendered.user },
      ],
      responseFormat: "json_object",
    });
    const schema = createOneShotBriefOutputSchema({
      sectionIds,
      soundBedTrackIds: ["morning-pad"],
      targetDurationSeconds: 180,
    });
    const brief = schema.parse(JSON.parse(response.text));
    expect(brief.coverage.flatMap((point) => point.sectionIds)).toContain(sectionIds[1]);
    expect(brief.stylePackId).toBe("systems");
    expect(brief.soundBed).toBe("morning-pad");
  });
});

describe("ST-107 objectives/v4", () => {
  it("renders the confirmed brief coverage, or none without a brief", () => {
    const v4 = registry.get("objectives", "v4");
    const withBrief = renderPrompt(v4, {
      sourcePackage: "{}",
      configuration: "{}",
      ...focusAudienceVariables({ briefCoverage: "Load paths\nWhy triangles are rigid" }),
    });
    expect(withBrief.user).toContain("1. Load paths\n2. Why triangles are rigid");
    const without = renderPrompt(v4, {
      sourcePackage: "{}",
      configuration: "{}",
      ...focusAudienceVariables({}),
    });
    expect(without.user).toContain("there is no brief). When present");
    expect(without.user).toMatch(/support it:\nnone\n/);
  });
});
