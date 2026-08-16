import { describe, expect, it } from "vitest";
import type { Identifier } from "@avlp/config";
import {
  buildSourcePackage,
  sourceSnapshotSchema,
  type SourceSnapshot,
} from "@avlp/schemas";
import {
  computeSourceSnapshotHash,
  materializeEffectiveSource,
  type EffectiveSourceInput,
} from "./source-snapshot.js";

const documentId: Identifier = "019ffbf1-ffff-7000-8000-000000000001";
const sourceDocumentId: Identifier = "019ffbf1-4444-7000-8000-000000000001";
const sectionOneId: Identifier = "019ffbf1-1111-7000-8000-000000000001";
const sectionTwoId: Identifier = "019ffbf1-2222-7000-8000-000000000001";
const blockOneId: Identifier = "019ffbf1-aaaa-7000-8000-000000000001";
const blockTwoId: Identifier = "019ffbf1-bbbb-7000-8000-000000000001";
const blockThreeId: Identifier = "019ffbf1-cccc-7000-8000-000000000001";
const figureOneId: Identifier = "019ffbf1-dddd-7000-8000-000000000001";

function sampleInput(
  overrides: Partial<EffectiveSourceInput> = {},
): EffectiveSourceInput {
  return {
    document: { id: documentId, sourceDocumentId, version: 1 },
    sections: [
      {
        id: sectionOneId,
        parentSectionId: null,
        order: 1,
        level: 1,
        heading: "Introduction",
        pageStart: 1,
        pageEnd: 1,
      },
      {
        id: sectionTwoId,
        parentSectionId: null,
        order: 2,
        level: 1,
        heading: "Evaporation",
        pageStart: 1,
        pageEnd: 2,
      },
    ],
    blocks: [
      {
        id: blockOneId,
        sectionId: sectionOneId,
        kind: "paragraph",
        order: 1,
        pageStart: 1,
        pageEnd: 1,
        content: { text: "Water evaporates when heated." },
      },
      {
        id: blockTwoId,
        sectionId: sectionTwoId,
        kind: "list",
        order: 1,
        pageStart: 1,
        pageEnd: 2,
        content: { items: ["Condensation", "Precipitation"] },
      },
      {
        id: blockThreeId,
        sectionId: sectionTwoId,
        kind: "unsupported",
        order: 2,
        pageStart: 2,
        pageEnd: 2,
        content: { parserKind: "table-of-contents" },
      },
    ],
    figures: [
      {
        id: figureOneId,
        sectionId: sectionOneId,
        order: 1,
        pageStart: 1,
        pageEnd: 1,
        captionBlockId: null,
        altText: "Water cycle diagram",
        sourceLocator: null,
      },
    ],
    tables: [],
    overlays: {
      sections: new Map(),
      blocks: new Map(),
      figures: new Map(),
    },
    ...overrides,
  };
}

function toSnapshot(
  content: ReturnType<typeof materializeEffectiveSource>,
): SourceSnapshot {
  return sourceSnapshotSchema.parse({
    schemaVersion: "1.0",
    id: "019ffbf1-eeee-7000-8000-000000000001",
    projectId: "019ffbf1-5555-7000-8000-000000000001",
    sourceDocumentId: content.sourceDocumentId,
    parsedDocumentId: content.parsedDocumentId,
    parsedDocumentVersion: content.parsedDocumentVersion,
    contentHash: computeSourceSnapshotHash(content),
    approvedBy: "019ffbf1-6666-7000-8000-000000000001",
    approvedAt: "2026-08-16T10:00:00.000Z",
    sections: content.sections,
    blocks: content.blocks,
    figures: content.figures,
    tables: content.tables,
  });
}

describe("materializeEffectiveSource", () => {
  it("captures exactly the effective reviewed source", () => {
    const content = materializeEffectiveSource(sampleInput());
    expect(content.sections.map((section) => section.sectionId)).toEqual([
      sectionOneId,
      sectionTwoId,
    ]);
    expect(content.blocks.map((block) => block.blockId)).toEqual([
      blockOneId,
      blockTwoId,
    ]);
    expect(content.blocks.some((block) => block.blockId === blockThreeId)).toBe(
      false,
    );
    expect(content.figures.map((figure) => figure.figureId)).toEqual([
      figureOneId,
    ]);
  });

  it("applies excluded-section and corrected-text overlays", () => {
    const content = materializeEffectiveSource(
      sampleInput({
        overlays: {
          sections: new Map([
            [
              sectionOneId,
              {
                included: false,
                displayHeading: null,
                reviewOrder: null,
                revision: 1,
              },
            ],
          ]),
          blocks: new Map([
            [
              blockOneId,
              {
                correctedText:
                  "Evaporation is the process of liquid becoming vapour.",
                correctedItems: null,
                correctedLatex: null,
                revision: 1,
              },
            ],
          ]),
          figures: new Map([[figureOneId, { included: false, revision: 1 }]]),
        },
      }),
    );
    expect(content.sections.map((section) => section.sectionId)).toEqual([
      sectionTwoId,
    ]);
    expect(content.blocks.some((block) => block.blockId === blockOneId)).toBe(
      false,
    );
    expect(content.figures).toEqual([]);
  });

  it("applies corrected text when a block is corrected", () => {
    const content = materializeEffectiveSource(
      sampleInput({
        overlays: {
          sections: new Map(),
          blocks: new Map([
            [
              blockOneId,
              {
                correctedText: "Corrected paragraph text.",
                correctedItems: null,
                correctedLatex: null,
                revision: 2,
              },
            ],
          ]),
          figures: new Map(),
        },
      }),
    );
    const block = content.blocks.find((entry) => entry.blockId === blockOneId);
    expect(block).toBeDefined();
    expect(block).toMatchObject({
      kind: "paragraph",
      text: "Corrected paragraph text.",
      corrected: true,
      revision: 2,
    });
  });

  it("applies renamed section headings", () => {
    const content = materializeEffectiveSource(
      sampleInput({
        overlays: {
          sections: new Map([
            [
              sectionTwoId,
              {
                included: true,
                displayHeading: "Vaporisation",
                reviewOrder: 1,
                revision: 1,
              },
            ],
          ]),
          blocks: new Map(),
          figures: new Map(),
        },
      }),
    );
    const section = content.sections.find(
      (entry) => entry.sectionId === sectionTwoId,
    );
    expect(section?.heading).toBe("Vaporisation");
    expect(section?.reviewOrder).toBe(1);
  });
});

describe("computeSourceSnapshotHash", () => {
  it("is deterministic for identical content", () => {
    const first = computeSourceSnapshotHash(
      materializeEffectiveSource(sampleInput()),
    );
    const second = computeSourceSnapshotHash(
      materializeEffectiveSource(sampleInput()),
    );
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the effective content changes", () => {
    const original = computeSourceSnapshotHash(
      materializeEffectiveSource(sampleInput()),
    );
    const corrected = computeSourceSnapshotHash(
      materializeEffectiveSource(
        sampleInput({
          overlays: {
            sections: new Map(),
            blocks: new Map([
              [
                blockOneId,
                {
                  correctedText: "A different sentence.",
                  correctedItems: null,
                  correctedLatex: null,
                  revision: 1,
                },
              ],
            ]),
            figures: new Map(),
          },
        }),
      ),
    );
    expect(corrected).not.toBe(original);
  });
});

describe("snapshot round-trip", () => {
  it("produces a valid immutable snapshot and a deterministic package", () => {
    const content = materializeEffectiveSource(sampleInput());
    const snapshot = toSnapshot(content);
    const first = buildSourcePackage(snapshot);
    const second = buildSourcePackage(
      toSnapshot(materializeEffectiveSource(sampleInput())),
    );
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.sourceSnapshotId).toBe(snapshot.id);
  });
});
