import { describe, expect, it } from "vitest";
import {
  citationIssueSchema,
  resolvedCitationSchema,
  sceneCitationsResponseSchema,
  type CitationIssueKind,
} from "./index.js";

const documentId = "019ffbf1-ffff-7000-8000-000000000001";
const sectionId = "019ffbf1-1111-7000-8000-000000000001";
const blockId = "019ffbf1-aaaa-7000-8000-000000000001";

describe("citation contracts", () => {
  it("accepts a fully resolved citation", () => {
    const citation = resolvedCitationSchema.parse({
      documentId,
      parsedDocumentVersion: 1,
      pageStart: 1,
      pageEnd: 2,
      sectionId,
      sectionHeading: "Introduction",
      blocks: [
        {
          blockId,
          sectionId,
          kind: "paragraph",
          page: 1,
          text: "Water evaporates when heated.",
        },
      ],
      figures: [],
      tables: [],
      issues: [],
    });
    expect(citation.sectionHeading).toBe("Introduction");
  });

  it("accepts every issue kind", () => {
    const kinds: CitationIssueKind[] = [
      "document_mismatch",
      "version_mismatch",
      "missing_section",
      "missing_block",
      "missing_figure",
      "missing_table",
    ];
    for (const kind of kinds)
      expect(citationIssueSchema.parse({ kind, id: blockId }).kind).toBe(kind);
  });

  it("accepts a scene citations response", () => {
    const response = sceneCitationsResponseSchema.parse({
      sceneId: "019ffbf1-6151-738a-b087-6775ff97568c",
      citations: [],
      generatedAdditions: [],
    });
    expect(response.citations).toEqual([]);
  });

  it("rejects an unknown issue kind", () => {
    expect(() =>
      citationIssueSchema.parse({ kind: "not_a_kind", id: blockId }),
    ).toThrow();
  });
});
