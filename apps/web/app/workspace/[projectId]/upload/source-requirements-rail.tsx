"use client";

import React from "react";
import {
  ShieldCheck,
  Translate,
  Gauge,
  FileText,
} from "@phosphor-icons/react";

export const SourceRequirementsRail: React.FC = () => {
  return (
    <aside
      aria-label="Source Document Requirements"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-card)",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
      }}
    >
      <div>
        <h3
          style={{
            margin: "0 0 6px 0",
            fontSize: "16px",
            fontWeight: 700,
            color: "var(--color-text)",
            letterSpacing: "-0.01em",
          }}
        >
          Document Requirements
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: "13px",
            color: "var(--color-text-muted)",
            lineHeight: "18px",
          }}
        >
          Guidelines for optimal text extraction and visual lesson generation.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Accepted Formats */}
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
          <span
            style={{
              display: "inline-flex",
              padding: "8px",
              borderRadius: "var(--radius-control)",
              backgroundColor: "var(--color-surface-subtle)",
              color: "var(--color-brand)",
              fontSize: "18px",
            }}
          >
            <FileText weight="duotone" />
          </span>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text)" }}>
              Supported Formats
            </div>
            <div style={{ fontSize: "13px", color: "var(--color-text-muted)", marginTop: "2px" }}>
              PDF (<code style={{ fontSize: "12px" }}>.pdf</code>) or Word (<code style={{ fontSize: "12px" }}>.docx</code>) documents.
            </div>
          </div>
        </div>

        {/* Page & Size Limits */}
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
          <span
            style={{
              display: "inline-flex",
              padding: "8px",
              borderRadius: "var(--radius-control)",
              backgroundColor: "var(--color-surface-subtle)",
              color: "var(--color-brand)",
              fontSize: "18px",
            }}
          >
            <Gauge weight="duotone" />
          </span>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text)" }}>
              Limits
            </div>
            <div style={{ fontSize: "13px", color: "var(--color-text-muted)", marginTop: "2px" }}>
              Maximum <strong>20 pages</strong> and up to <strong>25 MB</strong> per document.
            </div>
          </div>
        </div>

        {/* Language Scope */}
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
          <span
            style={{
              display: "inline-flex",
              padding: "8px",
              borderRadius: "var(--radius-control)",
              backgroundColor: "var(--color-surface-subtle)",
              color: "var(--color-brand)",
              fontSize: "18px",
            }}
          >
            <Translate weight="duotone" />
          </span>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text)" }}>
              Language & Scope
            </div>
            <div style={{ fontSize: "13px", color: "var(--color-text-muted)", marginTop: "2px" }}>
              English language, optimized for introductory science topics (learners aged 10–16).
            </div>
          </div>
        </div>

        {/* Security & Privacy */}
        <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
          <span
            style={{
              display: "inline-flex",
              padding: "8px",
              borderRadius: "var(--radius-control)",
              backgroundColor: "var(--color-surface-subtle)",
              color: "var(--color-brand)",
              fontSize: "18px",
            }}
          >
            <ShieldCheck weight="duotone" />
          </span>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text)" }}>
              Safety & Privacy
            </div>
            <div style={{ fontSize: "13px", color: "var(--color-text-muted)", marginTop: "2px" }}>
              Uploaded files stay private in tenant-isolated storage and undergo safety inspection.
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};
