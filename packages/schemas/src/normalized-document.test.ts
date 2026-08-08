import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  normalizedDocumentJsonSchema,
  normalizedDocumentSchema,
  parseNormalizedDocument,
  parseSourcePackage,
  type NormalizedDocument,
} from "./index.js";

const fixture = (name: string): unknown =>
  JSON.parse(
    readFileSync(
      new URL(`../fixtures/normalized-document/${name}.json`, import.meta.url),
      "utf8",
    ),
  ) as unknown;

const clean = fixture("clean") as NormalizedDocument;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("NormalizedDocument v1", () => {
  it.each(["clean", "figure-heavy", "table-heavy", "poor-quality"])(
    "validates the %s representative fixture",
    (name) => expect(parseNormalizedDocument(fixture(name))).toBeDefined(),
  );

  it("rejects duplicate and stale identifiers", () => {
    const duplicateBlock = clone(clean);
    duplicateBlock.blocks.push(clone(duplicateBlock.blocks[0]!));
    expect(normalizedDocumentSchema.safeParse(duplicateBlock).success).toBe(
      false,
    );

    const staleReference = clone(clean);
    staleReference.sections[0]!.blockIds = [
      "018f0000-0000-7000-8000-000000000099",
    ];
    expect(normalizedDocumentSchema.safeParse(staleReference).success).toBe(
      false,
    );
  });

  it("requires complete page provenance, resolvable hierarchy, and unknown-block warnings", () => {
    const missingParent = clone(clean);
    missingParent.sections[0]!.parentSectionId =
      "018f0000-0000-7000-8000-000000000099";
    expect(normalizedDocumentSchema.safeParse(missingParent).success).toBe(
      false,
    );

    const outsidePage = clone(clean);
    outsidePage.blocks[0]!.pageStart = 3;
    expect(normalizedDocumentSchema.safeParse(outsidePage).success).toBe(false);

    const outsideBoundingBox = clone(clean);
    outsideBoundingBox.blocks[0]!.boundingBox = {
      x: 0.8,
      y: 0.2,
      width: 0.3,
      height: 0.1,
    };
    expect(normalizedDocumentSchema.safeParse(outsideBoundingBox).success).toBe(
      false,
    );

    const warningOutsidePage = fixture("poor-quality") as NormalizedDocument;
    warningOutsidePage.warnings[0]!.pageStart = 2;
    expect(normalizedDocumentSchema.safeParse(warningOutsidePage).success).toBe(
      false,
    );

    const missingWarning = fixture("poor-quality") as NormalizedDocument;
    missingWarning.warnings = [];
    expect(normalizedDocumentSchema.safeParse(missingWarning).success).toBe(
      false,
    );
  });

  it("exports a named JSON Schema and a Docling-free source package", () => {
    expect(
      normalizedDocumentJsonSchema.definitions?.NormalizedDocument,
    ).toBeDefined();
    expect(
      parseSourcePackage({
        schemaVersion: "1.0",
        sourceSnapshotId: "018f0000-0000-7000-8000-000000000041",
        normalizedDocumentId: clean.id,
        parsedDocumentVersion: 1,
        language: "en",
        sections: [
          {
            sectionId: clean.sections[0]!.id,
            heading: clean.sections[0]!.heading,
            pageStart: 1,
            blocks: [
              {
                blockId: clean.blocks[0]!.id,
                page: 1,
                kind: "paragraph",
                text: "Water changes state when heated or cooled.",
              },
            ],
          },
        ],
      }),
    ).toBeDefined();
  });
});
