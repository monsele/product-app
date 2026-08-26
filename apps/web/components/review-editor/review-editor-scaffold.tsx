"use client";

import React from "react";

export interface ReviewEditorScaffoldProps {
  title: string;
  subtitle: string;
  statusBadge?: React.ReactNode;
  notices?: React.ReactNode;
  candidateBanner?: React.ReactNode;
  mainContent: React.ReactNode;
  sidebarContent?: React.ReactNode;
  sourceDrawer?: React.ReactNode;
}

export const ReviewEditorScaffold: React.FC<ReviewEditorScaffoldProps> = ({
  title,
  subtitle,
  statusBadge,
  notices,
  candidateBanner,
  mainContent,
  sidebarContent,
  sourceDrawer,
}) => {
  return (
    <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "24px 20px 80px 20px",
      }}
    >
      {/* Page Header */}
      <header
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "16px",
          }}
        >
          <div>
            <h1
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "var(--color-text)",
                margin: 0,
                letterSpacing: "-0.01em",
              }}
            >
              {title}
            </h1>
            <p
              style={{
                fontSize: "14px",
                color: "var(--color-text-muted)",
                margin: "4px 0 0 0",
              }}
            >
              {subtitle}
            </p>
          </div>
          {statusBadge && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {statusBadge}
            </div>
          )}
        </div>

        {/* Notices & Alerts */}
        {notices && <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>{notices}</div>}

        {/* Candidate comparison banner */}
        {candidateBanner && <div>{candidateBanner}</div>}
      </header>

      {/* Main Grid: Content + Contextual Sidebar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: sidebarContent
            ? "repeat(auto-fit, minmax(320px, 1fr))"
            : "1fr",
          gap: "32px",
          alignItems: "start",
        }}
      >
        {/* Main List & Actions Column */}
        <main
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "24px",
            minWidth: 0,
            maxWidth: sidebarContent ? "760px" : "100%",
          }}
        >
          {mainContent}
        </main>

        {/* Sticky Contextual Sidebar */}
        {sidebarContent && (
          <aside
            aria-label="Artifact context and summary"
            style={{
              position: "sticky",
              top: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-card)",
              padding: "20px",
            }}
          >
            {sidebarContent}
          </aside>
        )}
      </div>

      {/* Source Drawer */}
      {sourceDrawer}
    </div>
  );
};
