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
    expect(definitions.map((definition) => definition.kind).sort()).toEqual([
      "grounding",
      "narration",
      "objectives",
      "outline",
      "storyboard",
    ]);
    for (const definition of definitions)
      expect(() => promptDefinitionSchema.parse(definition)).not.toThrow();
  });

  it("looks up a specific version and the latest version", () => {
    const registry = new StaticPromptRegistry(repositoryPrompts);
    const latest = registry.latest("objectives");
    expect(latest.promptId).toBe("objectives");
    expect(registry.get("objectives", latest.version)).toBe(latest);
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
