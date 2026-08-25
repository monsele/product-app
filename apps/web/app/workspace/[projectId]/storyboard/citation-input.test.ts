import { describe, expect, it } from "vitest";
import type { CitationIssueKind } from "@avlp/schemas";
import {
  citationDeepLink,
  citationIssueLabel,
  citationPageLabel,
} from "./citation-input";

describe("citation-input", () => {
  it("labels every citation issue kind", () => {
    const kinds: CitationIssueKind[] = [
      "document_mismatch",
      "version_mismatch",
      "missing_section",
      "missing_block",
      "missing_figure",
      "missing_table",
    ];
    for (const kind of kinds)
      expect(citationIssueLabel(kind)).not.toBe("");
  });

  it("formats single and ranged page labels", () => {
    expect(citationPageLabel(3)).toBe("p. 3");
    expect(citationPageLabel(3, 3)).toBe("p. 3");
    expect(citationPageLabel(3, 5)).toBe("pp. 3–5");
  });

  it("builds deep links with and without a block", () => {
    expect(citationDeepLink("p1", "s1")).toBe(
      "/workspace/p1/review?section=s1",
    );
    expect(citationDeepLink("p1", "s1", "b1")).toBe(
      "/workspace/p1/review?section=s1&block=b1",
    );
  });
});
