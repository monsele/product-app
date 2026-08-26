"use client";

import React from "react";
import { FileText, ShieldCheck, Sparkle } from "@phosphor-icons/react";

export function ContextualInformationRail() {
  return (
    <aside
      aria-label="Workspace Contextual Guidance"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-card)",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Sparkle
            size={18}
            weight="fill"
            style={{ color: "var(--color-brand)" }}
          />
          <h3
            style={{
              margin: 0,
              fontSize: "14px",
              fontWeight: 700,
              letterSpacing: "-0.01em",
              color: "var(--color-text)",
            }}
          >
            Lesson Creation Rules
          </h3>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: "13px",
            color: "var(--color-text-muted)",
            lineHeight: "19px",
          }}
        >
          Upload authoritative teaching material to generate structured, visual,
          and grounded lessons.
        </p>
      </div>

      <div
        style={{
          borderTop: "1px solid var(--color-border)",
          paddingTop: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <FileText
            size={16}
            weight="bold"
            style={{ color: "var(--color-brand)" }}
          />
          <h4
            style={{
              margin: 0,
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--color-text)",
            }}
          >
            Supported Sources
          </h4>
        </div>
        <ul
          style={{
            margin: 0,
            paddingLeft: "20px",
            fontSize: "13px",
            color: "var(--color-text-muted)",
            lineHeight: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          }}
        >
          <li>PDF or Word (.docx) documents</li>
          <li>Maximum 50 pages per document</li>
          <li>Original figures and text preserved</li>
        </ul>
      </div>

      <div
        style={{
          borderTop: "1px solid var(--color-border)",
          paddingTop: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <ShieldCheck
            size={16}
            weight="bold"
            style={{ color: "var(--color-success-fg)" }}
          />
          <h4
            style={{
              margin: 0,
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--color-text)",
            }}
          >
            Privacy & Isolation
          </h4>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: "13px",
            color: "var(--color-text-muted)",
            lineHeight: "19px",
          }}
        >
          Source documents remain private to your workspace. Uploads are
          validated, scanned for safety, and hashed for idempotency.
        </p>
      </div>
    </aside>
  );
}
