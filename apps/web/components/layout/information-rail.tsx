"use client";

import React from "react";

export interface InformationRailProps {
  title?: string;
  children: React.ReactNode;
  width?: string;
}

export const InformationRail: React.FC<InformationRailProps> = ({
  title = "Project context",
  children,
  width = "340px",
}) => {
  return (
    <aside
      aria-label={title}
      style={{
        width,
        minWidth: width,
        backgroundColor: "var(--color-surface)",
        borderLeft: "1px solid var(--color-border)",
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        boxSizing: "border-box",
      }}
    >
      {title && (
        <h3
          style={{
            margin: 0,
            fontSize: "15px",
            fontWeight: 600,
            color: "var(--color-text)",
            borderBottom: "1px solid var(--color-border)",
            paddingBottom: "12px",
          }}
        >
          {title}
        </h3>
      )}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
        {children}
      </div>
    </aside>
  );
};
