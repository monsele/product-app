"use client";

import { useCallback, useEffect, useState } from "react";
import {
  sceneCitationsResponseSchema,
  type SceneCitationsResponse,
} from "@avlp/schemas";
import {
  citationDeepLink,
  citationIssueLabel,
  citationPageLabel,
} from "./citation-input";

type State =
  | { kind: "loading" }
  | { kind: "ready"; value: SceneCitationsResponse }
  | { kind: "failed"; message: string };

function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
}

export function SceneCitations({
  projectId,
  sceneId,
}: {
  projectId: string;
  sceneId: string;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(
        apiUrl(
          `/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}/citations`,
        ),
        { credentials: "include", cache: "no-store" },
      );
      const payload: unknown = await response.json().catch(() => null);
      const parsed = response.ok
        ? sceneCitationsResponseSchema.safeParse(payload)
        : undefined;
      if (parsed === undefined || !parsed.success)
        throw new Error("citations");
      setState({ kind: "ready", value: parsed.data });
    } catch {
      setState({
        kind: "failed",
        message: "Source citations are unavailable.",
      });
    }
  }, [projectId, sceneId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (state.kind === "loading")
    return <p role="status">Loading source citations…</p>;

  if (state.kind === "failed")
    return <p role="alert">{state.message}</p>;

  const { citations, generatedAdditions } = state.value;

  return (
    <section aria-label="Source citations" data-testid={`citations-${sceneId}`}>
      <h4>Source citations</h4>

      {citations.length === 0 ? (
        <p role="status">This scene has no source citations.</p>
      ) : (
        <ul aria-label="Resolved citations">
          {citations.map((citation, index) => (
            <li key={index} data-testid={`citation-${sceneId}-${index}`}>
              <p>
                {citationPageLabel(citation.pageStart, citation.pageEnd)}
                {citation.sectionHeading !== undefined
                  ? ` · ${citation.sectionHeading}`
                  : ""}
              </p>

              {citation.blocks.length > 0 ? (
                <ul aria-label="Cited blocks">
                  {citation.blocks.map((block) => (
                    <li key={block.blockId}>
                      <blockquote>{block.text}</blockquote>
                      <a
                        href={citationDeepLink(
                          projectId,
                          block.sectionId,
                          block.blockId,
                        )}
                      >
                        Open in source ({citationPageLabel(block.page)})
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}

              {citation.figures.length > 0 ? (
                <ul aria-label="Cited figures">
                  {citation.figures.map((figure) => (
                    <li key={figure.figureId}>
                      Figure {figure.page}
                      {figure.altText !== undefined
                        ? ` — ${figure.altText}`
                        : ""}{" "}
                      <a
                        href={citationDeepLink(projectId, figure.sectionId)}
                      >
                        Open in source
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}

              {citation.tables.length > 0 ? (
                <ul aria-label="Cited tables">
                  {citation.tables.map((table) => (
                    <li key={table.tableId}>
                      Table {table.page} ({table.columns.join(", ")}){" "}
                      <a href={citationDeepLink(projectId, table.sectionId)}>
                        Open in source
                      </a>
                    </li>
                  ))}
                </ul>
              ) : null}

              {citation.issues.length > 0 ? (
                <ul aria-label="Citation issues">
                  {citation.issues.map((issue) => (
                    <li key={`${issue.kind}-${issue.id}`} role="alert">
                      {citationIssueLabel(issue.kind)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {generatedAdditions.length > 0 ? (
        <div aria-label="Generated additions" data-generated-additions>
          <h4>Generated additions</h4>
          <ul>
            {generatedAdditions.map((addition, index) => (
              <li key={index}>
                <strong>{addition.kind}</strong> — {addition.content}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
