import { describe, expect, it } from "vitest";
import {
  buildSourcePackage,
  sourceBlockLookupEntrySchema,
  sourcePackageNarrowingSchema,
  sourceSnapshotMetadataSchema,
  sourceSnapshotSchema,
  type SourceSnapshot,
} from "./index.js";

const sectionOneId = "019ffbf1-1111-7000-8000-000000000001";
const sectionTwoId = "019ffbf1-2222-7000-8000-000000000001";
const blockOneId = "019ffbf1-aaaa-7000-8000-000000000001";
const blockTwoId = "019ffbf1-bbbb-7000-8000-000000000001";
const figureOneId = "019ffbf1-cccc-7000-8000-000000000001";
const tableOneId = "019ffbf1-dddd-7000-8000-000000000001";
const snapshotId = "019ffbf1-eeee-7000-8000-000000000001";
const projectId = "019ffbf1-ffff-7000-8000-000000000001";
const parsedDocumentId = "019ffbf1-3333-7000-8000-000000000001";
const sourceDocumentId = "019ffbf1-4444-7000-8000-000000000001";
const approvedBy = "019ffbf1-5555-7000-8000-000000000001";

function sampleSnapshot(): SourceSnapshot {
  return sourceSnapshotSchema.parse({
    schemaVersion: "1.0",
    id: snapshotId,
    projectId,
    sourceDocumentId,
    parsedDocumentId,
    parsedDocumentVersion: 1,
    contentHash: "a".repeat(64),
    approvedBy,
    approvedAt: "2026-08-16T10:00:00.000Z",
    sections: [
      {
        sectionId: sectionOneId,
        order: 1,
        level: 1,
        heading: "Introduction",
        pageStart: 1,
        pageEnd: 1,
        reviewOrder: null,
        blockIds: [blockOneId],
        figureIds: [figureOneId],
        tableIds: [],
      },
      {
        sectionId: sectionTwoId,
        order: 2,
        level: 1,
        heading: "Evaporation",
        pageStart: 1,
        pageEnd: 2,
        reviewOrder: null,
        blockIds: [blockTwoId],
        figureIds: [],
        tableIds: [tableOneId],
      },
    ],
    blocks: [
      {
        blockId: blockOneId,
        sectionId: sectionOneId,
        kind: "paragraph",
        order: 1,
        pageStart: 1,
        pageEnd: 1,
        text: "Water evaporates when heated.",
        corrected: false,
        revision: 0,
      },
      {
        blockId: blockTwoId,
        sectionId: sectionTwoId,
        kind: "list",
        order: 1,
        pageStart: 1,
        pageEnd: 2,
        items: ["Condensation", "Precipitation"],
        corrected: true,
        revision: 2,
      },
    ],
    figures: [
      {
        figureId: figureOneId,
        sectionId: sectionOneId,
        order: 1,
        pageStart: 1,
        pageEnd: 1,
        altText: "Water cycle diagram",
        revision: 0,
      },
    ],
    tables: [
      {
        tableId: tableOneId,
        sectionId: sectionTwoId,
        order: 1,
        pageStart: 2,
        pageEnd: 2,
        columns: ["Stage", "Description"],
        rows: [
          ["Evaporation", "Liquid becomes vapour"],
          ["Condensation", "Vapour becomes droplets"],
        ],
      },
    ],
  });
}

describe("source snapshot schemas", () => {
  it("accepts a valid snapshot", () => {
    expect(sampleSnapshot()).toBeDefined();
  });

  it("rejects a block whose section does not exist", () => {
    const snapshot = sampleSnapshot();
    snapshot.blocks = snapshot.blocks.map((block) =>
      block.blockId === blockOneId
        ? { ...block, sectionId: "019ffbf1-9999-7000-8000-000000000001" }
        : block,
    );
    expect(sourceSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });

  it("rejects a section referencing a missing block", () => {
    const snapshot = sampleSnapshot();
    snapshot.sections = snapshot.sections.map((section) =>
      section.sectionId === sectionOneId
        ? { ...section, blockIds: ["019ffbf1-8888-7000-8000-000000000001"] }
        : section,
    );
    expect(sourceSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });

  it("rejects an unreferenced figure", () => {
    const snapshot = sampleSnapshot();
    snapshot.figures = [
      ...snapshot.figures,
      {
        figureId: "019ffbf1-7777-7000-8000-000000000001",
        sectionId: sectionOneId,
        order: 2,
        pageStart: 1,
        pageEnd: 1,
        revision: 0,
      },
    ];
    expect(sourceSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });

  it("rejects an unsupported block kind in a snapshot", () => {
    const snapshot = sampleSnapshot();
    const invalid = {
      ...snapshot,
      blocks: snapshot.blocks.map((block) => ({
        ...block,
        kind: "unsupported",
        text: "raw",
      })),
    };
    expect(sourceSnapshotSchema.safeParse(invalid).success).toBe(false);
  });

  it("parses snapshot metadata", () => {
    const snapshot = sampleSnapshot();
    const metadata = sourceSnapshotMetadataSchema.parse({
      id: snapshot.id,
      snapshotVersion: 1,
      schemaVersion: "1.0",
      parsedDocumentId: snapshot.parsedDocumentId,
      parsedDocumentVersion: snapshot.parsedDocumentVersion,
      contentHash: snapshot.contentHash,
      approvedBy: snapshot.approvedBy,
      approvedAt: snapshot.approvedAt,
      sectionCount: snapshot.sections.length,
      blockCount: snapshot.blocks.length,
      figureCount: snapshot.figures.length,
      tableCount: snapshot.tables.length,
    });
    expect(metadata.sectionCount).toBe(2);
  });

  it("rejects a narrowing without any selection", () => {
    expect(sourcePackageNarrowingSchema.safeParse({}).success).toBe(false);
    expect(
      sourcePackageNarrowingSchema.safeParse({
        sectionIds: [sectionOneId],
      }).success,
    ).toBe(true);
    expect(
      sourcePackageNarrowingSchema.safeParse({
        blockIds: [blockOneId],
      }).success,
    ).toBe(true);
  });
});

describe("buildSourcePackage", () => {
  it("builds the same package deterministically", () => {
    const snapshot = sampleSnapshot();
    const first = buildSourcePackage(snapshot);
    const second = buildSourcePackage(sampleSnapshot());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.sourceSnapshotId).toBe(snapshotId);
    expect(first.normalizedDocumentId).toBe(parsedDocumentId);
    expect(first.parsedDocumentVersion).toBe(1);
  });

  it("converts corrected list blocks into bounded text", () => {
    const snapshot = sampleSnapshot();
    const package_ = buildSourcePackage(snapshot);
    const listSection = package_.sections.find(
      (section) => section.sectionId === sectionTwoId,
    );
    expect(listSection).toBeDefined();
    expect(listSection?.blocks[0]).toMatchObject({
      blockId: blockTwoId,
      page: 1,
      kind: "list",
      text: "Condensation\nPrecipitation",
    });
  });

  it("narrows by section IDs while retaining stable block IDs", () => {
    const snapshot = sampleSnapshot();
    const package_ = buildSourcePackage(snapshot, {
      sectionIds: [sectionOneId],
    });
    expect(package_.sections.map((section) => section.sectionId)).toEqual([
      sectionOneId,
    ]);
    expect(package_.sections[0]?.blocks[0]?.blockId).toBe(blockOneId);
  });

  it("narrows by block IDs", () => {
    const snapshot = sampleSnapshot();
    const package_ = buildSourcePackage(snapshot, {
      blockIds: [blockOneId],
    });
    expect(package_.sections.map((section) => section.sectionId)).toEqual([
      sectionOneId,
    ]);
    expect(package_.sections[0]?.blocks.map((block) => block.blockId)).toEqual([
      blockOneId,
    ]);
  });

  it("throws when the narrowed selection is empty", () => {
    const snapshot = sampleSnapshot();
    expect(() =>
      buildSourcePackage(snapshot, {
        sectionIds: ["019ffbf1-6666-7000-8000-000000000001"],
      }),
    ).toThrow(/empty/);
  });

  it("produces entries consumable by the source-block lookup contract", () => {
    const snapshot = sampleSnapshot();
    const package_ = buildSourcePackage(snapshot);
    const entry = sourceBlockLookupEntrySchema.parse({
      blockId: package_.sections[0]!.blocks[0]!.blockId,
      sectionId: package_.sections[0]!.sectionId,
      sectionHeading: package_.sections[0]!.heading,
      page: package_.sections[0]!.blocks[0]!.page,
      kind: package_.sections[0]!.blocks[0]!.kind,
      text: package_.sections[0]!.blocks[0]!.text,
    });
    expect(entry.blockId).toBe(blockOneId);
  });
});
