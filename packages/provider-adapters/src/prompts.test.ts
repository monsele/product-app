import { describe, expect, it } from "vitest";
import {
  computeGenerationInputVersion,
  promptDefinitionSchema,
  renderPrompt,
  StaticPromptRegistry,
  type PromptDefinition,
} from "./prompts.js";
import { repositoryPrompts } from "./prompts/index.js";

const snapshotHash = "a".repeat(64);

describe("prompt registry", () => {
  it("registers every versioned repository prompt", () => {
    const registry = new StaticPromptRegistry(repositoryPrompts);
    const definitions = registry.list();
    expect([...new Set(definitions.map((definition) => definition.kind))].sort()).toEqual([
      "grounding",
      "narration",
      "objectives",
      "outline",
      "storyboard",
    ]);
    expect(definitions).toHaveLength(repositoryPrompts.length);
    for (const definition of definitions)
      expect(() => promptDefinitionSchema.parse(definition)).not.toThrow();
  });

  it("looks up a specific version and the latest version", () => {
    const registry = new StaticPromptRegistry(repositoryPrompts);
    const latest = registry.latest("objectives");
    expect(latest.promptId).toBe("objectives");
    expect(registry.get("objectives", latest.version)).toBe(latest);
  });

  it("registers the grounded objectives v2 prompt as the latest", () => {
    const registry = new StaticPromptRegistry(repositoryPrompts);
    expect(registry.latest("objectives").version).toBe("v2");
    const v2 = registry.get("objectives", "v2");
    expect(v2.purpose).toContain("measurable");
    expect(v2.evaluationCases).toContain("objectives-v1-faithfulness");
    expect(v2.evaluationCases).toContain("objectives-v1-age-appropriateness");
  });

  it("registers the narration-block v1 prompt with every mode rendered", () => {
    const registry = new StaticPromptRegistry(repositoryPrompts);
    const definition = registry.get("narration-block", "v1");
    expect(definition.kind).toBe("narration");
    for (const mode of ["shorten", "simplify", "expand", "regenerate"]) {
      const { system, user } = renderPrompt(definition, {
        mode,
        instruction: "Keep the opening question.",
        currentBlock: JSON.stringify({ text: "The current block." }),
        neighborBlocks: "[]",
        outlineItem: JSON.stringify({ id: "item-1" }),
        outlineItemId: "item-1",
        wordBudget: JSON.stringify({ min: 10, target: 14, max: 18 }),
        sourcePackage: JSON.stringify({ sections: [] }),
        configuration: JSON.stringify({ ageBand: "11-13" }),
      });
      expect(system).toContain("ONE narration block");
      expect(user).toContain(`Mode: ${mode}`);
      expect(user).toContain("narration-block-v1");
      expect(user).not.toContain("{{mode}}");
      expect(user).not.toContain("{{sourcePackage}}");
    }
  });

  it("renders the latest storyboard prompt with layout preflight guidance", () => {
    const registry = new StaticPromptRegistry(repositoryPrompts);
    const definition = registry.latest("storyboard");
    expect(definition.kind).toBe("storyboard");
    expect(definition.templateCatalogVersion).toBe("mvp-default");
    const { system, user } = renderPrompt(definition, {
      templateCatalog: JSON.stringify([{ template: "definition" }]),
      narration: JSON.stringify([{ id: "block-1", text: "Narration." }]),
      outline: JSON.stringify([{ id: "item-1" }]),
      sourcePackage: JSON.stringify({ sections: [] }),
      configuration: JSON.stringify({ targetDurationSeconds: 300 }),
    });
    expect(system).toContain("storyboard planner");
    expect(system).toContain("pixel coordinates");
    expect(system).toContain("Return ONLY a JSON object");
    expect(definition.version).toBe("v2");
    expect(user).toContain("storyboard-v1");
    expect(user).toContain("narrationBlockIds");
    expect(user).toContain("assetRequirements");
    expect(user).toContain("Layout preflight rules");
    expect(user).not.toContain("{{templateCatalog}}");
    expect(user).not.toContain("{{narration}}");
    expect(user).not.toContain("{{outline}}");
    expect(user).not.toContain("{{sourcePackage}}");
    expect(user).not.toContain("{{configuration}}");
  });

  it("renders the scene-regeneration v1 prompt with read-only neighbors", () => {
    const registry = new StaticPromptRegistry(repositoryPrompts);
    const definition = registry.get("scene-regeneration", "v1");
    expect(definition.kind).toBe("storyboard");
    expect(definition.templateCatalogVersion).toBe("mvp-default");
    for (const mode of [
      "improve-visual",
      "simplify",
      "shorten",
      "regenerate",
    ]) {
      const { system, user } = renderPrompt(definition, {
        templateCatalog: JSON.stringify([{ template: "definition" }]),
        currentScene: JSON.stringify({ id: "scene-1", narrationBlockIds: ["block-1"] }),
        neighborScenes: JSON.stringify([{ id: "scene-0" }, { id: "scene-2" }]),
        narrationBlocks: JSON.stringify([{ id: "block-1", text: "Narration." }]),
        outline: JSON.stringify([{ id: "item-1" }]),
        sourcePackage: JSON.stringify({ sections: [] }),
        configuration: JSON.stringify({ targetDurationSeconds: 300 }),
        mode,
        instruction: "Keep the opening question.",
      });
      expect(system).toContain("exactly ONE scene");
      expect(system).toContain("read-only context");
      expect(system).toContain("narrationBlockIds");
      expect(user).toContain("scene-regeneration-v1");
      expect(user).toContain(`Regeneration mode: ${mode}`);
      expect(user).toContain("MUST equal the current scene's narrationBlockIds");
      expect(user).not.toContain("{{templateCatalog}}");
      expect(user).not.toContain("{{currentScene}}");
      expect(user).not.toContain("{{neighborScenes}}");
      expect(user).not.toContain("{{narrationBlocks}}");
      expect(user).not.toContain("{{outline}}");
      expect(user).not.toContain("{{sourcePackage}}");
      expect(user).not.toContain("{{configuration}}");
      expect(user).not.toContain("{{mode}}");
      expect(user).not.toContain("{{instruction}}");
    }
  });

  it("renders the objectives v2 prompt with bounded and citation instructions", () => {
    const registry = new StaticPromptRegistry(repositoryPrompts);
    const definition = registry.get("objectives", "v2");
    const { system, user } = renderPrompt(definition, {
      sourcePackage: JSON.stringify({ sections: [{ heading: "Water cycle" }] }),
      configuration: JSON.stringify({ ageBand: "11-13", tone: "friendly" }),
    });
    expect(system).toContain("block IDs");
    expect(user).toContain("between 3 and 6");
    expect(user).toContain("measurable verb");
    expect(user).not.toContain("{{sourcePackage}}");
    expect(user).not.toContain("{{configuration}}");
  });

  it("rejects duplicate definitions for the same prompt version", () => {
    const definition = repositoryPrompts[0]!;
    expect(() => new StaticPromptRegistry([definition, definition])).toThrow(
      /must bump its version/,
    );
  });

  it("exposes evaluation cases for the evaluation hook", () => {
    const registry = new StaticPromptRegistry(repositoryPrompts);
    for (const definition of repositoryPrompts) {
      expect(definition.evaluationCases.length).toBeGreaterThan(0);
      expect(
        registry.get(definition.promptId, definition.version).evaluationCases,
      ).toEqual(definition.evaluationCases);
    }
  });

  it("renders prompt templates and rejects missing variables", () => {
    const definition = repositoryPrompts[0]!;
    const { system, user } = renderPrompt(definition, {
      sourcePackage: "{}",
      configuration: "{}",
    });
    expect(system.length).toBeGreaterThan(0);
    expect(user).not.toContain("{{sourcePackage}}");
    expect(user).not.toContain("{{configuration}}");
  });

  it("changes the input version when the prompt version changes", () => {
    const base = {
      operationType: "ai.objectives",
      promptId: "objectives",
      model: "mock-model-1",
      sourceSnapshotId: "019ffbf1-1111-7000-8000-000000000001",
      sourceSnapshotContentHash: snapshotHash,
      paramsHash: "b".repeat(64),
    };
    const v1 = computeGenerationInputVersion({ ...base, promptVersion: "v1" });
    const v2 = computeGenerationInputVersion({ ...base, promptVersion: "v2" });
    expect(v1).not.toBe(v2);
  });

  it("changes the input version when the source snapshot changes", () => {
    const base = {
      operationType: "ai.objectives",
      promptId: "objectives",
      promptVersion: "v1",
      model: "mock-model-1",
      sourceSnapshotId: "019ffbf1-1111-7000-8000-000000000001",
      sourceSnapshotContentHash: snapshotHash,
      paramsHash: "b".repeat(64),
    };
    const original = computeGenerationInputVersion(base);
    const changed = computeGenerationInputVersion({
      ...base,
      sourceSnapshotContentHash: "c".repeat(64),
    });
    expect(original).not.toBe(changed);
  });
});

export type { PromptDefinition };
