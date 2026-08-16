"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  parsedDocumentReviewResponseSchema,
  parsedDocumentSectionResponseSchema,
  reviewContentBlockSchema,
  reviewFigureSchema,
  sourceSectionSelectionResponseSchema,
  sourceSectionSelectionSchema,
  type ParsedDocumentReviewResponse,
  type ParsedDocumentSectionResponse,
  type ReviewFigure,
  type SourceSectionSelection,
} from "@avlp/schemas";
import {
  buildSectionUpdateInput,
  type SectionSelectionAction,
} from "./source-section-controls";
import {
  blockCorrectionRevision,
  buildBlockCorrectionInput,
  type BlockCorrectionAction,
} from "./source-block-controls";
import {
  buildFigureUpdateInput,
  type FigureSelectionAction,
} from "./source-figure-controls";

type State =
  | { kind: "loading" }
  | { kind: "ready"; value: ParsedDocumentReviewResponse }
  | { kind: "failed"; message: string };

type SectionState = {
  detail?: ParsedDocumentSectionResponse;
  loading: boolean;
  error?: string;
};

function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
}

function selectionFor(
  selections: Record<string, SourceSectionSelection>,
  sectionId: string,
): SourceSectionSelection | undefined {
  return selections[sectionId];
}

export function IngestionReviewViewer({ projectId }: { projectId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [selections, setSelections] = useState<
    Record<string, SourceSectionSelection>
  >({});
  const [selectionError, setSelectionError] = useState<string | undefined>();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(),
  );
  const [sectionStates, setSectionStates] = useState<
    Record<string, SectionState>
  >({});
  const sectionStatesRef = useRef(sectionStates);
  sectionStatesRef.current = sectionStates;

  const refresh = useCallback(async () => {
    try {
      const [reviewResponse, selectionResponse] = await Promise.all([
        fetch(
          apiUrl(`/projects/${encodeURIComponent(projectId)}/parsed-document`),
          { credentials: "include", cache: "no-store" },
        ),
        fetch(
          apiUrl(`/projects/${encodeURIComponent(projectId)}/source-sections`),
          { credentials: "include", cache: "no-store" },
        ),
      ]);
      const [reviewPayload, selectionPayload] = await Promise.all([
        reviewResponse.json().catch(() => null),
        selectionResponse.json().catch(() => null),
      ]);
      const review = reviewResponse.ok
        ? parsedDocumentReviewResponseSchema.safeParse(reviewPayload)
        : undefined;
      const selection = selectionResponse.ok
        ? sourceSectionSelectionResponseSchema.safeParse(selectionPayload)
        : undefined;
      if (review === undefined || !review.success) throw new Error("review");
      if (selection === undefined || !selection.success)
        throw new Error("selection");
      setState({ kind: "ready", value: review.data });
      setSelections(
        Object.fromEntries(
          selection.data.sections.map((entry) => [entry.id, entry]),
        ),
      );
    } catch {
      setState({
        kind: "failed",
        message: "We could not load the document review. Please try again.",
      });
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleSection = useCallback(
    async (sectionId: string) => {
      setExpandedSections((prev) => {
        const next = new Set(prev);
        if (next.has(sectionId)) {
          next.delete(sectionId);
        } else {
          next.add(sectionId);
        }
        return next;
      });
      if (sectionStatesRef.current[sectionId]?.detail !== undefined) return;
      setSectionStates((prev) => ({
        ...prev,
        [sectionId]: { loading: true },
      }));
      try {
        const response = await fetch(
          apiUrl(
            `/projects/${encodeURIComponent(projectId)}/parsed-document/sections/${encodeURIComponent(sectionId)}`,
          ),
          { credentials: "include", cache: "no-store" },
        );
        const payload: unknown = await response.json().catch(() => null);
        const parsed = response.ok
          ? parsedDocumentSectionResponseSchema.safeParse(payload)
          : undefined;
        if (parsed === undefined || !parsed.success)
          throw new Error("Unable to load section content.");
        setSectionStates((prev) => ({
          ...prev,
          [sectionId]: { loading: false, detail: parsed.data },
        }));
      } catch (error) {
        setSectionStates((prev) => ({
          ...prev,
          [sectionId]: {
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "Unable to load section content.",
          },
        }));
      }
    },
    [projectId],
  );

  const updateSection = useCallback(
    async (sectionId: string, action: SectionSelectionAction) => {
      setSelectionError(undefined);
      const current = selectionFor(selections, sectionId);
      const body = buildSectionUpdateInput(
        {
          revision: current?.revision ?? 0,
          included: current?.included ?? true,
          displayHeading: current?.displayHeading ?? null,
        },
        action,
      );
      try {
        const response = await fetch(
          apiUrl(
            `/projects/${encodeURIComponent(projectId)}/source-sections/${encodeURIComponent(sectionId)}`,
          ),
          {
            method: "PATCH",
            credentials: "include",
            cache: "no-store",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "object" &&
            payload.error !== null &&
            "message" in payload.error &&
            typeof payload.error.message === "string"
              ? payload.error.message
              : "Unable to update the section selection.";
          throw new Error(message);
        }
        const parsed = sourceSectionSelectionSchema.safeParse(payload);
        if (!parsed.success) throw new Error("Unable to update the section.");
        setSelections((prev) => ({ ...prev, [sectionId]: parsed.data }));
      } catch (error) {
        setSelectionError(
          error instanceof Error
            ? error.message
            : "Unable to update the section selection.",
        );
      }
    },
    [projectId, selections],
  );

  const correctBlock = useCallback(
    async (
      sectionId: string,
      blockId: string,
      block: Pick<
        ParsedDocumentSectionResponse["section"]["blocks"][number],
        "kind"
      >,
      action: BlockCorrectionAction,
    ) => {
      const current = sectionStatesRef.current[sectionId]?.detail;
      if (current === undefined) return;
      const blockDetail = current.section.blocks.find(
        (entry) => entry.id === blockId,
      );
      if (blockDetail === undefined) return;
      const body = buildBlockCorrectionInput(
        block,
        { revision: blockCorrectionRevision(blockDetail) },
        action,
      );
      const url =
        action.kind === "restore"
          ? apiUrl(
              `/projects/${encodeURIComponent(projectId)}/source-blocks/${encodeURIComponent(blockId)}/restore`,
            )
          : apiUrl(
              `/projects/${encodeURIComponent(projectId)}/source-blocks/${encodeURIComponent(blockId)}`,
            );
      try {
        const response = await fetch(url, {
          method: action.kind === "restore" ? "POST" : "PATCH",
          credentials: "include",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "object" &&
            payload.error !== null &&
            "message" in payload.error &&
            typeof payload.error.message === "string"
              ? payload.error.message
              : "Unable to update the block content.";
          throw new Error(message);
        }
        const parsed = reviewContentBlockSchema.safeParse(payload);
        if (!parsed.success) throw new Error("Unable to update the block.");
        setSectionStates((prev) => {
          const detail = prev[sectionId]?.detail;
          if (detail === undefined) return prev;
          return {
            ...prev,
            [sectionId]: {
              loading: false,
              detail: {
                ...detail,
                section: {
                  ...detail.section,
                  blocks: detail.section.blocks.map((entry) =>
                    entry.id === blockId ? parsed.data : entry,
                  ),
                },
              },
            },
          };
        });
      } catch (error) {
        setSectionStates((prev) => {
          const existing = prev[sectionId];
          return {
            ...prev,
            [sectionId]: {
              loading: false,
              ...(existing?.detail === undefined
                ? {}
                : { detail: existing.detail }),
              error:
                error instanceof Error
                  ? error.message
                  : "Unable to update the block content.",
            },
          };
        });
      }
    },
    [projectId],
  );

  const updateFigure = useCallback(
    async (
      sectionId: string,
      figureId: string,
      figure: Pick<ReviewFigure, "included" | "revision">,
      action: FigureSelectionAction,
    ) => {
      const body = buildFigureUpdateInput(
        { revision: figure.revision, included: figure.included },
        action,
      );
      try {
        const response = await fetch(
          apiUrl(
            `/projects/${encodeURIComponent(projectId)}/source-figures/${encodeURIComponent(figureId)}`,
          ),
          {
            method: "PATCH",
            credentials: "include",
            cache: "no-store",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
        );
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "object" &&
            payload.error !== null &&
            "message" in payload.error &&
            typeof payload.error.message === "string"
              ? payload.error.message
              : "Unable to update the figure inclusion.";
          throw new Error(message);
        }
        const parsed = reviewFigureSchema.safeParse(payload);
        if (!parsed.success) throw new Error("Unable to update the figure.");
        setSectionStates((prev) => {
          const detail = prev[sectionId]?.detail;
          if (detail === undefined) return prev;
          return {
            ...prev,
            [sectionId]: {
              loading: false,
              detail: {
                ...detail,
                section: {
                  ...detail.section,
                  figures: detail.section.figures.map((entry) =>
                    entry.id === figureId
                      ? { ...entry, ...parsed.data }
                      : entry,
                  ),
                },
              },
            },
          };
        });
      } catch (error) {
        setSectionStates((prev) => {
          const existing = prev[sectionId];
          return {
            ...prev,
            [sectionId]: {
              loading: false,
              ...(existing?.detail === undefined
                ? {}
                : { detail: existing.detail }),
              error:
                error instanceof Error
                  ? error.message
                  : "Unable to update the figure inclusion.",
            },
          };
        });
      }
    },
    [projectId],
  );

  const navigateToWarning = useCallback(
    (warning: { id: string; sectionId?: string | undefined }) => {
      if (warning.sectionId !== undefined) {
        const sid = warning.sectionId;
        setExpandedSections((prev) => {
          const next = new Set(prev);
          next.add(sid);
          return next;
        });
        if (sectionStatesRef.current[sid]?.detail === undefined) {
          void toggleSection(sid);
        }
        const element = window.document.getElementById(`section-${sid}`);
        if (element !== null) element.focus();
      }
    },
    [toggleSection],
  );

  if (state.kind === "loading")
    return (
      <section aria-labelledby="review-heading">
        <h2 id="review-heading">Document review</h2>
        <p role="status">Loading document review.</p>
      </section>
    );

  if (state.kind === "failed")
    return (
      <section aria-labelledby="review-heading">
        <h2 id="review-heading">Document review</h2>
        <p role="alert">{state.message}</p>
        <button type="button" onClick={() => void refresh()}>
          Try again
        </button>
      </section>
    );

  const { document: doc, sections, warnings, quality } = state.value;

  return (
    <section aria-labelledby="review-heading">
      <h2 id="review-heading">Document review</h2>

      <dl>
        <dt>Title</dt>
        <dd>{doc.title ?? "Untitled document"}</dd>
        <dt>Pages</dt>
        <dd>{doc.pageCount}</dd>
        <dt>Parsed version</dt>
        <dd>{doc.version}</dd>
        <dt>Schema version</dt>
        <dd>{doc.schemaVersion}</dd>
      </dl>

      {quality !== null ? (
        <p>
          Quality score: {quality.score}/100 —{" "}
          <strong>{quality.status.replace("_", " ")}</strong>
        </p>
      ) : null}

      {selectionError !== undefined ? (
        <p role="alert">{selectionError}</p>
      ) : null}

      {warnings.length > 0 ? (
        <div aria-labelledby="warnings-heading">
          <h3 id="warnings-heading">Warnings ({warnings.length})</h3>
          <ul>
            {warnings.map((warning) => (
              <li
                key={warning.id}
                id={`warning-${warning.id}`}
                aria-label={`Warning: ${warning.message}`}
              >
                <span data-severity={warning.severity}>{warning.severity}</span>
                {" — "}
                {warning.message}
                {" (page "}
                {warning.pageStart}
                {warning.pageEnd !== warning.pageStart
                  ? `–${warning.pageEnd}`
                  : ""}
                {")"}
                {warning.sectionId !== undefined ? (
                  <button
                    type="button"
                    onClick={() => void navigateToWarning(warning)}
                  >
                    Go to section
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div aria-labelledby="sections-heading">
        <h3 id="sections-heading">Sections ({sections.length})</h3>
        {sections.length === 0 ? (
          <p>No sections were detected in this document.</p>
        ) : (
          <ul role="tree" aria-label="Document sections">
            {sections.map((section) => {
              const isExpanded = expandedSections.has(section.id);
              const sectionState = sectionStates[section.id];
              const selection = selectionFor(selections, section.id);
              const included = selection?.included ?? true;
              const effectiveHeading =
                selection?.displayHeading ?? section.heading;
              return (
                <li key={section.id} role="treeitem" aria-expanded={isExpanded}>
                  <button
                    type="button"
                    id={`section-${section.id}`}
                    aria-expanded={isExpanded}
                    aria-controls={`section-content-${section.id}`}
                    tabIndex={0}
                    onClick={() => void toggleSection(section.id)}
                  >
                    {effectiveHeading || "(untitled section)"}
                  </button>
                  {" — page "}
                  {section.pageStart}
                  {section.pageEnd !== section.pageStart
                    ? `–${section.pageEnd}`
                    : ""}
                  {section.blockCount > 0
                    ? ` · ${section.blockCount} blocks`
                    : ""}
                  {section.figureCount > 0
                    ? ` · ${section.figureCount} figures`
                    : ""}
                  {section.tableCount > 0
                    ? ` · ${section.tableCount} tables`
                    : ""}
                  <div data-section-selection>
                    <span data-included={included}>
                      {included ? "Included" : "Excluded"}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void updateSection(section.id, {
                          kind: included ? "exclude" : "include",
                        })
                      }
                    >
                      {included ? "Exclude" : "Include"}
                    </button>
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        const heading = String(
                          data.get("heading") ?? "",
                        ).trim();
                        if (heading.length === 0) return;
                        void updateSection(section.id, {
                          kind: "rename",
                          heading,
                        });
                      }}
                    >
                      <label>
                        Heading
                        <input
                          type="text"
                          name="heading"
                          defaultValue={effectiveHeading || ""}
                          maxLength={1000}
                        />
                      </label>
                      <button type="submit">Rename</button>
                    </form>
                    {selection !== undefined ? (
                      <button
                        type="button"
                        onClick={() =>
                          void updateSection(section.id, { kind: "restore" })
                        }
                      >
                        Restore original
                      </button>
                    ) : null}
                  </div>
                  {isExpanded ? (
                    <div id={`section-content-${section.id}`}>
                      {sectionState?.loading ? (
                        <p role="status">Loading section content.</p>
                      ) : null}
                      {sectionState?.error ? (
                        <p role="alert">{sectionState.error}</p>
                      ) : null}
                      {sectionState?.detail ? (
                        <SectionContent
                          detail={sectionState.detail}
                          onCorrect={(block, action) =>
                            void correctBlock(
                              section.id,
                              block.id,
                              block,
                              action,
                            )
                          }
                          onToggleFigure={(figure, action) =>
                            void updateFigure(
                              section.id,
                              figure.id,
                              figure,
                              action,
                            )
                          }
                        />
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function SectionContent({
  detail,
  onCorrect,
  onToggleFigure,
}: {
  detail: ParsedDocumentSectionResponse;
  onCorrect: (
    block: ParsedDocumentSectionResponse["section"]["blocks"][number],
    action: BlockCorrectionAction,
  ) => void;
  onToggleFigure: (figure: ReviewFigure, action: FigureSelectionAction) => void;
}) {
  const { section } = detail;
  return (
    <div>
      {section.blocks.length === 0 &&
      section.figures.length === 0 &&
      section.tables.length === 0 ? (
        <p>This section has no extractable content.</p>
      ) : null}

      {section.blocks.map((block) => (
        <EditableBlock key={block.id} block={block} onCorrect={onCorrect} />
      ))}

      {section.figures.length > 0 ? (
        <div aria-labelledby={`figures-${section.id}`}>
          <h4 id={`figures-${section.id}`}>
            Figures ({section.figures.length})
          </h4>
          <ul>
            {section.figures.map((figure) => (
              <li key={figure.id} data-figure-id={figure.id}>
                {figure.previewUrl !== undefined ? (
                  <img
                    src={figure.previewUrl}
                    alt={figure.altText ?? "Extracted figure"}
                    width={figure.width ?? undefined}
                    height={figure.height ?? undefined}
                  />
                ) : (
                  <span role="status">
                    Figure preview unavailable
                    {figure.contentType !== null
                      ? ` (${figure.contentType})`
                      : ""}
                  </span>
                )}
                {figure.sourceLocator !== undefined ? (
                  <p>Source: {figure.sourceLocator}</p>
                ) : null}
                <p data-figure-inclusion>
                  <span data-included={figure.included}>
                    {figure.included ? "Included" : "Excluded"}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onToggleFigure(figure, {
                        kind: figure.included ? "exclude" : "restore",
                      })
                    }
                  >
                    {figure.included
                      ? "Exclude from lesson"
                      : "Include in lesson"}
                  </button>
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {section.tables.length > 0 ? (
        <div aria-labelledby={`tables-${section.id}`}>
          <h4 id={`tables-${section.id}`}>Tables ({section.tables.length})</h4>
          {section.tables.map((table) => (
            <table key={table.id} data-table-id={table.id}>
              <thead>
                <tr>
                  {table.columns.map((column, index) => (
                    <th key={index} scope="col">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EditableBlock({
  block,
  onCorrect,
}: {
  block: ParsedDocumentSectionResponse["section"]["blocks"][number];
  onCorrect: (
    block: ParsedDocumentSectionResponse["section"]["blocks"][number],
    action: BlockCorrectionAction,
  ) => void;
}) {
  const [editing, setEditing] = useState(false);

  const renderContent = () => {
    switch (block.kind) {
      case "paragraph":
        return (
          <p data-block-id={block.id}>
            {block.correction?.correctedText ?? block.text}
          </p>
        );
      case "list": {
        const items = block.correction?.correctedItems ?? block.items;
        return (
          <ul data-block-id={block.id}>
            {items.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        );
      }
      case "equation":
        return (
          <p data-block-id={block.id} aria-label="Equation">
            <code>{block.correction?.correctedLatex ?? block.latex}</code>
            {block.text !== undefined ? (
              <span aria-label="Equation text"> ({block.text})</span>
            ) : null}
          </p>
        );
      case "caption":
        return (
          <p data-block-id={block.id}>
            {block.correction?.correctedText ?? block.text}
          </p>
        );
      case "unsupported":
        return (
          <p
            data-block-id={block.id}
            role="status"
            aria-label={`Unsupported block: ${block.parserKind}`}
          >
            Unsupported content type: {block.parserKind}
          </p>
        );
      default:
        return null;
    }
  };

  const corrected =
    block.kind === "unsupported" ? false : block.correction !== undefined;

  return (
    <div data-block-correction data-corrected={corrected}>
      {renderContent()}
      {block.kind === "unsupported" ? null : editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const content = String(data.get("content") ?? "").trim();
            if (content.length === 0) return;
            if (block.kind === "list") {
              onCorrect(block, {
                kind: "edit-items",
                correctedItems: content
                  .split("\n")
                  .map((item) => item.trim())
                  .filter((item) => item.length > 0),
              });
            } else if (block.kind === "equation") {
              onCorrect(block, { kind: "edit-latex", correctedLatex: content });
            } else {
              onCorrect(block, { kind: "edit", correctedText: content });
            }
            setEditing(false);
          }}
        >
          <label>
            Corrected content
            {block.kind === "list" ? (
              <textarea
                name="content"
                rows={4}
                defaultValue={(
                  block.correction?.correctedItems ?? block.items
                ).join("\n")}
              />
            ) : (
              <textarea
                name="content"
                rows={4}
                defaultValue={
                  block.kind === "equation"
                    ? (block.correction?.correctedLatex ?? block.latex)
                    : (block.correction?.correctedText ?? block.text)
                }
              />
            )}
          </label>
          <button type="submit">Save</button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
            }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <span data-block-actions>
          <button type="button" onClick={() => setEditing(true)}>
            {corrected ? "Edit correction" : "Correct text"}
          </button>
          {corrected ? (
            <button
              type="button"
              onClick={() => onCorrect(block, { kind: "restore" })}
            >
              Restore original
            </button>
          ) : null}
        </span>
      )}
    </div>
  );
}
