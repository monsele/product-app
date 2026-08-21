import type { CitationIssueKind } from "@avlp/schemas";

/** Human-readable label for a citation resolution issue. */
export function citationIssueLabel(kind: CitationIssueKind): string {
  switch (kind) {
    case "document_mismatch":
      return "References a different source document.";
    case "version_mismatch":
      return "References an older source version.";
    case "missing_section":
      return "Source section is missing.";
    case "missing_block":
      return "Source block is missing.";
    case "missing_figure":
      return "Source figure is missing.";
    case "missing_table":
      return "Source table is missing.";
  }
}

/** Compact page label, e.g. "p. 3" or "pp. 3–5". */
export function citationPageLabel(
  pageStart: number,
  pageEnd?: number,
): string {
  if (pageEnd === undefined || pageEnd === pageStart) return `p. ${pageStart}`;
  return `pp. ${pageStart}–${pageEnd}`;
}

/** Deep link into the ingestion review view for a section and optional block. */
export function citationDeepLink(
  projectId: string,
  sectionId: string,
  blockId?: string,
): string {
  const query = new URLSearchParams({ section: sectionId });
  if (blockId !== undefined) query.set("block", blockId);
  return `/workspace/${encodeURIComponent(projectId)}/review?${query.toString()}`;
}
