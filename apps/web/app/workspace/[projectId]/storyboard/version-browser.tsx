"use client";

import React from "react";

export type VersionBrowserMetadata = {
  count: number;
  latestModifiedAt: string | null;
  currentVersionId: string | null;
  versions: Array<{ id: string; versionNumber: number; reason: string; createdAt: string }>;
};

export function VersionBrowser(props: {
  metadata: VersionBrowserMetadata | null;
  preview: { id: string; durationSeconds: number; sceneCount: number; schemaVersion: string } | null;
  restoringVersionId: string | null;
  saving: boolean;
  storyboardAvailable: boolean;
  onPreview: (versionId: string) => void;
  onRestore: (versionId: string) => void;
  onSave: () => void;
}) {
  const { metadata } = props;

  return (
    <section
      aria-label="Lesson versions"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        padding: "16px",
        backgroundColor: "var(--color-surface, #211A2B)",
        borderRadius: "8px",
        border: "1px solid var(--color-border, #3A3046)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <h3 style={{ margin: "0 0 4px", fontSize: "15px", fontWeight: 600, color: "var(--color-text, #F4F1F8)" }}>
            Lesson versions
          </h3>
          {metadata !== null && metadata.latestModifiedAt !== null ? (
            <p role="status" style={{ margin: 0, fontSize: "12px", color: "var(--color-text-muted, #BDB5C7)" }}>
              Version {metadata.count} saved {new Date(metadata.latestModifiedAt).toLocaleString()}.
            </p>
          ) : (
            <p role="status" style={{ margin: 0, fontSize: "12px", color: "var(--color-text-muted, #BDB5C7)" }}>
              No saved lesson versions yet.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={props.onSave}
          disabled={props.saving || !props.storyboardAvailable}
          style={{
            padding: "6px 12px",
            borderRadius: "6px",
            backgroundColor: "var(--color-brand, #A883FF)",
            color: "var(--color-on-brand, #1B1027)",
            border: "none",
            fontSize: "12px",
            fontWeight: 600,
            cursor: props.saving || !props.storyboardAvailable ? "not-allowed" : "pointer",
          }}
        >
          {props.saving ? "Saving version..." : "Save version"}
        </button>
      </div>

      {metadata?.versions && metadata.versions.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {metadata.versions.map((version) => {
            const isCurrent = version.id === metadata.currentVersionId;
            return (
              <div
                key={version.id}
                style={{
                  padding: "10px 12px",
                  borderRadius: "6px",
                  backgroundColor: "var(--color-surface-subtle, #292035)",
                  border: isCurrent
                    ? "1px solid var(--color-brand, #A883FF)"
                    : "1px solid var(--color-border, #3A3046)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                  <span style={{ fontSize: "13px", fontWeight: isCurrent ? 600 : 500, color: "var(--color-text, #F4F1F8)" }}>
                    Version {version.versionNumber} ({version.reason}) saved {new Date(version.createdAt).toLocaleString()}.
                    {isCurrent ? (
                      <span
                        style={{
                          marginLeft: "6px",
                          fontSize: "11px",
                          color: "var(--color-brand, #A883FF)",
                          fontWeight: 700,
                        }}
                      >
                        [Current]
                      </span>
                    ) : null}
                  </span>
                </div>

                <div style={{ display: "flex", gap: "8px", marginTop: "2px" }}>
                  <button
                    type="button"
                    onClick={() => props.onPreview(version.id)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: "4px",
                      backgroundColor: "rgba(255, 255, 255, 0.08)",
                      border: "1px solid var(--color-border, #3A3046)",
                      color: "var(--color-text, #F4F1F8)",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    Preview metadata
                  </button>
                  <button
                    type="button"
                    disabled={props.restoringVersionId !== null || isCurrent}
                    onClick={() => props.onRestore(version.id)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: "4px",
                      backgroundColor: isCurrent ? "transparent" : "rgba(168, 131, 255, 0.15)",
                      border: isCurrent ? "1px solid transparent" : "1px solid rgba(168, 131, 255, 0.3)",
                      color: isCurrent ? "var(--color-text-muted, #BDB5C7)" : "var(--color-brand, #A883FF)",
                      fontSize: "12px",
                      cursor: props.restoringVersionId !== null || isCurrent ? "not-allowed" : "pointer",
                    }}
                  >
                    {props.restoringVersionId === version.id ? "Restoring..." : "Restore"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {props.preview !== null ? (
        <div
          style={{
            padding: "8px 12px",
            borderRadius: "6px",
            backgroundColor: "rgba(168, 131, 255, 0.08)",
            border: "1px solid rgba(168, 131, 255, 0.2)",
          }}
        >
          <p role="status" style={{ margin: 0, fontSize: "12px", color: "var(--color-text, #F4F1F8)" }}>
            Version metadata: {props.preview.sceneCount} scenes, {props.preview.durationSeconds} seconds, schema {props.preview.schemaVersion}.
          </p>
        </div>
      ) : null}
    </section>
  );
}
