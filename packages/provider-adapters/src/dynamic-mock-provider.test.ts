import { describe, expect, it } from "vitest";
import {
  sceneRegenerationOutputSchema,
  storyboardOutputV1Schema,
} from "@avlp/schemas";
import { DynamicMockLanguageModelProvider } from "./dynamic-mock-provider.js";

describe("DynamicMockLanguageModelProvider", () => {
  const provider = new DynamicMockLanguageModelProvider();

  it("generates valid objectives JSON", async () => {
    const response = await provider.complete({
      model: "mock-model-1",
      messages: [
        {
          role: "user",
          content:
            'Source material:\n{"sections":[{"sectionId":"s1","blocks":[{"blockId":"019ffbf1-2222-7000-8000-000000000001","text":"Sample"}]}]}\n\nLesson configuration:\n{"lessonTitle":"Water Cycle","targetDurationSeconds":180}\n\nPropose between 3 and 6 measurable learning objectives. Return JSON only with schemaVersion of "objectives-v1".',
        },
      ],
    });

    expect(response.providerId).toBe("dynamic-mock");
    const parsed = JSON.parse(response.text);
    expect(parsed.schemaVersion).toBe("objectives-v1");
    expect(parsed.objectives.length).toBeGreaterThanOrEqual(3);
    expect(parsed.objectives[0].sourceBlockIds).toContain(
      "019ffbf1-2222-7000-8000-000000000001",
    );
  });

  it("generates valid outline JSON", async () => {
    const response = await provider.complete({
      model: "mock-model-1",
      messages: [
        {
          role: "user",
          content:
            'Approved objectives:\n[{"id":"019ffbf1-aaaa-7000-8000-000000000001","title":"Learn water"}]\n\nSource material:\n{"sections":[{"blocks":[{"blockId":"019ffbf1-2222-7000-8000-000000000001"}]}]}\n\nReturn JSON with schemaVersion of "outline-v1".',
        },
      ],
    });

    const parsed = JSON.parse(response.text);
    expect(parsed.schemaVersion).toBe("outline-v1");
    expect(parsed.items.length).toBeGreaterThanOrEqual(3);
    expect(parsed.items[0].kind).toBe("hook");
    expect(parsed.items[parsed.items.length - 1].kind).toBe("summary");
  });

  it("generates valid narration JSON", async () => {
    const response = await provider.complete({
      model: "mock-model-1",
      messages: [
        {
          role: "user",
          content:
            'Outline item:\n{"id":"019ffbf1-1111-7000-8000-000000000001"}\n\nSource material:\n{"blocks":[{"blockId":"019ffbf1-2222-7000-8000-000000000001"}]}\n\nReturn spoken narration JSON with schemaVersion of "narration-v1".',
        },
      ],
    });

    const parsed = JSON.parse(response.text);
    expect(parsed.schemaVersion).toBe("narration-v1");
    expect(parsed.blocks.length).toBeGreaterThanOrEqual(1);
  });

  it("generates storyboard JSON that satisfies storyboardOutputV1Schema", async () => {
    const response = await provider.complete({
      model: "mock-model-1",
      messages: [
        {
          role: "system",
          content:
            "You are a storyboard planner turning an approved, spoken narration into visual scenes. " +
            "Choose only from the supported template catalog. One template that shows how inputs " +
            "transform into outputs; another is a lesson outline recap.",
        },
        {
          role: "user",
          content:
            'Approved narration blocks (stable IDs, in order):\n[{"id":"019ffbf1-3333-7000-8000-000000000001"},{"id":"019ffbf1-3333-7000-8000-000000000002"},{"id":"019ffbf1-3333-7000-8000-000000000003"}]\n\n' +
            'Source material (machine-readable blocks with stable IDs):\n{"blocks":[{"blockId":"019ffbf1-2222-7000-8000-000000000001"},{"blockId":"019ffbf1-2222-7000-8000-000000000002"}]}\n\n' +
            'Lesson configuration (JSON):\n{"lessonTitle":"The water cycle","targetDurationSeconds":180}\n\n' +
            'Return a JSON object with a schemaVersion of "storyboard-v1".',
        },
      ],
    });

    const parsed = storyboardOutputV1Schema.parse(JSON.parse(response.text));
    expect(parsed.scenes.length).toBeGreaterThanOrEqual(3);
    expect(
      parsed.scenes.flatMap((scene) => scene.narrationBlockIds),
    ).toEqual([
      "019ffbf1-3333-7000-8000-000000000001",
      "019ffbf1-3333-7000-8000-000000000002",
      "019ffbf1-3333-7000-8000-000000000003",
    ]);
  });

  it("generates scene-regeneration JSON that satisfies sceneRegenerationOutputSchema", async () => {
    const response = await provider.complete({
      model: "mock-model-1",
      messages: [
        {
          role: "system",
          content:
            "You are a storyboard scene editor improving one scene of an existing, approved lesson.",
        },
        {
          role: "user",
          content:
            'Current scene (the one to improve):\n{"template":"hook","narrationBlockIds":["019ffbf1-3333-7000-8000-000000000009"]}\n\n' +
            'Source material (machine-readable blocks with stable IDs):\n{"blocks":[{"blockId":"019ffbf1-2222-7000-8000-000000000001"}]}\n\n' +
            "Regeneration mode: improve-visual\n\n" +
            'Return a JSON object with a schemaVersion of "scene-regeneration-v1".',
        },
      ],
    });

    const parsed = sceneRegenerationOutputSchema.parse(
      JSON.parse(response.text),
    );
    expect(parsed.mode).toBe("improve-visual");
    expect(parsed.scene.narrationBlockIds).toEqual([
      "019ffbf1-3333-7000-8000-000000000009",
    ]);
  });
});
