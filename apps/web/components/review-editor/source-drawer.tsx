"use client";

import React from "react";
import { Drawer } from "../ui/drawer";
import { StatusLabel } from "../ui/status-label";
import { BookOpen, FileText, Info, Lightbulb } from "@phosphor-icons/react";
import type { SourceRef } from "@avlp/schemas";

export interface SourceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  sourceRefs: SourceRef[];
  projectId: string;
  instructionalContext?: {
    prerequisites?: string[];
    vocabulary?: { term: string; definition: string }[];
    misconceptions?: string[];
    assessmentSuggestions?: string[];
  };
}

export const SourceDrawer: React.FC<SourceDrawerProps> = ({
  isOpen,
  onClose,
  title = "Source & grounding context",
  sourceRefs,
  projectId,
  instructionalContext,
}) => {
  return (
    <Drawer isOpen={isOpen} onClose={onClose} title={title} width="400px">
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {/* Source References Section */}
        <section aria-labelledby="source-citations-heading">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "12px",
            }}
          >
            <BookOpen size={18} weight="bold" style={{ color: "var(--color-brand)" }} />
            <h4
              id="source-citations-heading"
              style={{
                margin: 0,
                fontSize: "14px",
                fontWeight: 600,
                color: "var(--color-text)",
              }}
            >
              Cited Source Passages ({sourceRefs.length})
            </h4>
          </div>

          {sourceRefs.length === 0 ? (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "var(--radius-control)",
                backgroundColor: "var(--color-surface-subtle)",
                border: "1px solid var(--color-border)",
                fontSize: "13px",
                color: "var(--color-text-muted)",
              }}
            >
              No direct source references attached to this item. This may be a
              teacher-added custom item.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {sourceRefs.map((ref, idx) => {
                const pageLabel =
                  ref.pageEnd !== undefined && ref.pageEnd !== ref.pageStart
                    ? `Pages ${ref.pageStart}–${ref.pageEnd}`
                    : `Page ${ref.pageStart}`;

                return (
                  <div
                    key={idx}
                    style={{
                      padding: "12px 14px",
                      borderRadius: "var(--radius-control)",
                      backgroundColor: "var(--color-surface-subtle)",
                      border: "1px solid var(--color-border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "12px",
                          fontWeight: 600,
                          color: "var(--color-text)",
                        }}
                      >
                        {ref.sectionId ? `Section ${ref.sectionId.slice(0, 8)}` : "Source Passage"}
                      </span>
                      <StatusLabel status="info" label={pageLabel} size="compact" />
                    </div>

                    <div
                      style={{
                        fontSize: "12px",
                        color: "var(--color-text-muted)",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <FileText size={14} />
                      <span>
                        {ref.blockIds.length} extracted content block
                        {ref.blockIds.length === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div style={{ marginTop: "4px" }}>
                      <a
                        href={`/workspace/${encodeURIComponent(projectId)}/review`}
                        style={{
                          fontSize: "12px",
                          color: "var(--color-brand)",
                          textDecoration: "underline",
                        }}
                      >
                        Inspect in source review &rarr;
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Instructional Context If Available */}
        {instructionalContext && (
          <>
            {instructionalContext.prerequisites &&
              instructionalContext.prerequisites.length > 0 && (
                <section aria-labelledby="prereq-heading">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "8px",
                    }}
                  >
                    <Info size={16} weight="bold" style={{ color: "var(--color-brand)" }} />
                    <h4
                      id="prereq-heading"
                      style={{
                        margin: 0,
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "var(--color-text)",
                      }}
                    >
                      Prerequisite knowledge
                    </h4>
                  </div>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: "18px",
                      fontSize: "13px",
                      color: "var(--color-text-muted)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    {instructionalContext.prerequisites.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </section>
              )}

            {instructionalContext.misconceptions &&
              instructionalContext.misconceptions.length > 0 && (
                <section aria-labelledby="misconceptions-heading">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "8px",
                    }}
                  >
                    <Lightbulb size={16} weight="bold" style={{ color: "var(--color-warning-fg)" }} />
                    <h4
                      id="misconceptions-heading"
                      style={{
                        margin: 0,
                        fontSize: "13px",
                        fontWeight: 600,
                        color: "var(--color-text)",
                      }}
                    >
                      Common misconceptions
                    </h4>
                  </div>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: "18px",
                      fontSize: "13px",
                      color: "var(--color-text-muted)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    {instructionalContext.misconceptions.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </section>
              )}
          </>
        )}
      </div>
    </Drawer>
  );
};
