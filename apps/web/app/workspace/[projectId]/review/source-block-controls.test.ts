import { describe, expect, it } from "vitest";
import type { ReviewContentBlock } from "@avlp/schemas";
import {
  blockCorrectionRevision,
  buildBlockCorrectionInput,
  effectiveBlockText,
} from "./source-block-controls";

const paragraphBlock: ReviewContentBlock = {
  id: "block-1",
  kind: "paragraph",
  order: 1,
  pageStart: 1,
  pageEnd: 1,
  text: "Original paragraph.",
};

const correctedParagraphBlock: ReviewContentBlock = {
  ...paragraphBlock,
  correction: {
    revision: 2,
    correctedText: "Corrected paragraph.",
    correctedItems: null,
    correctedLatex: null,
  },
};

describe("source block controls", () => {
  it("builds a paragraph correction carrying the current revision", () => {
    expect(
      buildBlockCorrectionInput(
        paragraphBlock,
        { revision: 0 },
        {
          kind: "edit",
          correctedText: "New text.",
        },
      ),
    ).toEqual({
      kind: "paragraph",
      revision: 0,
      correctedText: "New text.",
    });
  });

  it("builds a list correction from edited items", () => {
    expect(
      buildBlockCorrectionInput(
        { kind: "list" },
        { revision: 1 },
        {
          kind: "edit-items",
          correctedItems: ["a", "b"],
        },
      ),
    ).toEqual({
      kind: "list",
      revision: 1,
      correctedItems: ["a", "b"],
    });
  });

  it("builds an equation correction from edited latex", () => {
    expect(
      buildBlockCorrectionInput(
        { kind: "equation" },
        { revision: 0 },
        {
          kind: "edit-latex",
          correctedLatex: "E=mc^2",
        },
      ),
    ).toEqual({
      kind: "equation",
      revision: 0,
      correctedLatex: "E=mc^2",
    });
  });

  it("builds a restore body with the current revision", () => {
    expect(
      buildBlockCorrectionInput(
        paragraphBlock,
        { revision: 2 },
        {
          kind: "restore",
        },
      ),
    ).toEqual({ revision: 2 });
  });

  it("uses revision 0 for a block with no correction yet", () => {
    expect(blockCorrectionRevision(paragraphBlock)).toBe(0);
    expect(blockCorrectionRevision(correctedParagraphBlock)).toBe(2);
  });

  it("projects corrected text when present and original otherwise", () => {
    expect(effectiveBlockText(paragraphBlock)).toBe("Original paragraph.");
    expect(effectiveBlockText(correctedParagraphBlock)).toBe(
      "Corrected paragraph.",
    );
  });
});
