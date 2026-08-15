import type { ReviewContentBlock } from "@avlp/schemas";

export type BlockCorrectionAction =
  | { kind: "edit"; correctedText: string }
  | { kind: "edit-items"; correctedItems: string[] }
  | { kind: "edit-latex"; correctedLatex: string }
  | { kind: "restore" };

export interface BlockCorrectionSnapshot {
  revision: number;
}

/**
 * Maps a teacher UI action onto the `PATCH /source-blocks/:blockId` body.
 * `revision` is carried through for optimistic concurrency and the corrected
 * content is shaped to match the immutable block kind.
 */
export function buildBlockCorrectionInput(
  block: Pick<ReviewContentBlock, "kind">,
  current: BlockCorrectionSnapshot,
  action: BlockCorrectionAction,
): unknown {
  switch (action.kind) {
    case "edit":
      if (block.kind === "equation")
        return {
          kind: "equation" as const,
          revision: current.revision,
          correctedLatex: action.correctedText,
        };
      return {
        kind:
          block.kind === "list" ? ("list" as const) : ("paragraph" as const),
        revision: current.revision,
        correctedText: action.correctedText,
      };
    case "edit-items":
      return {
        kind: "list" as const,
        revision: current.revision,
        correctedItems: action.correctedItems,
      };
    case "edit-latex":
      return {
        kind: "equation" as const,
        revision: current.revision,
        correctedLatex: action.correctedLatex,
      };
    case "restore":
      return { revision: current.revision };
  }
}

export function blockCorrectionRevision(block: ReviewContentBlock): number {
  return block.kind === "unsupported" ? 0 : (block.correction?.revision ?? 0);
}

/** Effective display text: corrected content when present, otherwise original. */
export function effectiveBlockText(block: ReviewContentBlock): string {
  if (block.kind === "unsupported") return "";
  switch (block.kind) {
    case "list":
      return (block.correction?.correctedItems ?? block.items).join("\n");
    case "equation":
      return block.correction?.correctedLatex ?? block.latex;
    case "paragraph":
    case "caption":
      return block.correction?.correctedText ?? block.text;
  }
}
