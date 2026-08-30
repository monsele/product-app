import { describe, expect, it } from "vitest";
import {
  groundingOutputSchema,
  narrationOutputV1Schema,
  outlineOutputV1Schema,
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
    expect(parsed.scenes.flatMap((scene) => scene.narrationBlockIds)).toEqual([
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

/**
 * The three planning stages have to agree: the outline decides how many items
 * the lesson has, narration emits exactly one block per item, and every scene
 * covers a whole number of blocks and lasts 3-60s. A lesson therefore needs at
 * least `ceil(target / 60)` outline items, or no valid storyboard exists for
 * it at all. This walks the real chain for every supported target duration.
 */
describe("DynamicMockLanguageModelProvider planning chain", () => {
  const provider = new DynamicMockLanguageModelProvider();
  const uuid = (value: number): string =>
    `01a04d14-1111-7000-8000-${String(value).padStart(12, "0")}`;

  for (const duration of [180, 300, 420] as const) {
    it(`produces a storyboard that covers the narration at ${duration}s`, async () => {
      const configuration = {
        configurationVersion: 1,
        lessonTitle: "Attention",
        subject: "Science",
        ageBand: "middle",
        difficulty: "intermediate",
        tone: "neutral",
        targetDurationSeconds: duration,
        includeRecallQuestions: false,
      };
      const sourcePackage = JSON.stringify({
        sections: [
          {
            blocks: [
              { blockId: uuid(900) },
              { blockId: uuid(901) },
              { blockId: uuid(902) },
            ],
          },
        ],
      });

      const outlineResponse = await provider.complete({
        model: "mock-model-1",
        messages: [
          {
            role: "system",
            content:
              "You are an instructional planner building a lesson outline.",
          },
          {
            role: "user",
            content:
              `Approved objectives:
[{"id":"${uuid(1)}","title":"A"}]

` +
              `Source material (machine-readable blocks with stable IDs):
${sourcePackage}

` +
              `Lesson configuration:
${JSON.stringify(configuration)}

Return JSON only.`,
          },
        ],
      });
      const outline = outlineOutputV1Schema.parse(
        JSON.parse(outlineResponse.text),
      );
      expect(outline.items.length).toBeGreaterThanOrEqual(
        Math.ceil(duration / 60),
      );
      const outlineItems = outline.items.map((item, index) => ({
        id: uuid(100 + index),
        order: index + 1,
        kind: item.kind,
        estimatedSeconds: item.estimatedSeconds,
      }));

      const narrationResponse = await provider.complete({
        model: "mock-model-1",
        messages: [
          {
            role: "system",
            content: "You are a science narrator writing spoken narration.",
          },
          {
            role: "user",
            content:
              `Approved outline items to narrate:
${JSON.stringify(outlineItems)}

` +
              `Source material:
${sourcePackage}

` +
              `Lesson configuration:
${JSON.stringify(configuration)}`,
          },
        ],
      });
      const narration = narrationOutputV1Schema.parse(
        JSON.parse(narrationResponse.text),
      );
      expect(narration.blocks.length).toBe(outline.items.length);
      const narrationBlocks = narration.blocks.map((block, index) => ({
        id: uuid(200 + index),
        order: index + 1,
        outlineItemId: block.outlineItemId,
        text: block.sentences.map((sentence) => sentence.text).join(" "),
      }));

      const storyboardResponse = await provider.complete({
        model: "mock-model-1",
        messages: [
          {
            role: "system",
            content:
              "You are a storyboard planner turning an approved, spoken narration into visual scenes.",
          },
          {
            role: "user",
            content:
              `Approved narration blocks (stable IDs, in order):
${JSON.stringify(narrationBlocks)}

` +
              `Approved outline items (pedagogical purpose per block):
${JSON.stringify(outlineItems)}

` +
              `Source material (machine-readable blocks with stable IDs):
${sourcePackage}

` +
              `Lesson configuration (JSON):
${JSON.stringify(configuration)}`,
          },
        ],
      });
      const storyboard = storyboardOutputV1Schema.parse(
        JSON.parse(storyboardResponse.text),
      );
      expect(storyboard.targetDurationSeconds).toBe(duration);
      expect(
        storyboard.scenes.flatMap((scene) => scene.narrationBlockIds),
      ).toEqual(narrationBlocks.map((block) => block.id));
      expect(
        storyboard.scenes.reduce(
          (total, scene) => total + scene.estimatedSeconds,
          0,
        ),
      ).toBe(duration);
    });
  }

  it("groups narration blocks when the target cannot fit one scene per block", async () => {
    const narrationBlocks = Array.from({ length: 40 }, (_, index) => ({
      id: uuid(300 + index),
      order: index + 1,
    }));
    const response = await provider.complete({
      model: "mock-model-1",
      messages: [
        {
          role: "system",
          content:
            "You are a storyboard planner turning an approved, spoken narration into visual scenes.",
        },
        {
          role: "user",
          content:
            `Approved narration blocks (stable IDs, in order):
${JSON.stringify(narrationBlocks)}

` +
            `Source material (machine-readable blocks with stable IDs):
{"blocks":[{"blockId":"${uuid(900)}"}]}

` +
            `Lesson configuration (JSON):
{"lessonTitle":"Attention","targetDurationSeconds":180}`,
        },
      ],
    });
    const storyboard = storyboardOutputV1Schema.parse(
      JSON.parse(response.text),
    );
    expect(storyboard.scenes.length).toBeLessThanOrEqual(180 / 3);
    expect(
      storyboard.scenes.flatMap((scene) => scene.narrationBlockIds),
    ).toEqual(narrationBlocks.map((block) => block.id));
  });

  it("answers every grounding claim in the shape the check job requires", async () => {
    const blockId = "019ffbf1-2222-7000-8000-000000000001";
    const cited = {
      id: "019ffbf1-5555-7000-8000-000000000001",
      text: "Attention weights every token against every other token.",
    };
    const generated = {
      id: "019ffbf1-5555-7000-8000-000000000002",
      text: "Think of it as a spotlight [and a lens].",
      generatedAddition: { kind: "analogy", label: "Illustrative analogy" },
    };
    const response = await provider.complete({
      model: "mock-model-1",
      messages: [
        {
          role: "system",
          content:
            "You are a source-grounding judge. Compare each claim against only the cited source blocks.",
        },
        {
          role: "user",
          content:
            `Claims to check:
${JSON.stringify([cited, generated])}

` +
            `Cited source blocks:
{"sections":[{"sectionId":"s1","blocks":[{"blockId":"${blockId}","text":"Attention compares tokens."}]}]}`,
        },
      ],
    });

    const output = groundingOutputSchema.parse(JSON.parse(response.text));
    expect(output.results.map((result) => result.claimId)).toEqual([
      cited.id,
      generated.id,
    ]);
    const [supported, addition] = output.results;
    expect(supported!.status).toBe("supported");
    expect(supported!.supportedSpans).toEqual([
      { start: 0, end: cited.text.length, sourceBlockId: blockId },
    ]);
    // Spans must stay inside the claim text, and a claim with no source refs
    // must come back as a generated addition, or the job rejects the batch.
    expect(addition!.status).toBe("generated_addition");
    expect(addition!.supportedSpans).toEqual([]);
  });
});
