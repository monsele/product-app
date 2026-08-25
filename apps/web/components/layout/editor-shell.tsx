"use client";

import React from "react";

export interface EditorShellProps {
  leftNav: React.ReactNode;
  centerCanvas: React.ReactNode;
  rightInspector: React.ReactNode;
  header?: React.ReactNode;
}

export const EditorShell: React.FC<EditorShellProps> = ({
  leftNav,
  centerCanvas,
  rightInspector,
  header,
}) => {
  return (
    <div
      className="theme-focus-studio"
      style={{
        width: "100vw",
        height: "100vh",
        backgroundColor: "var(--color-canvas)",
        color: "var(--color-text)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {header}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        {/* Left Scene Navigation */}
        <div
          style={{
            width: "280px",
            minWidth: "280px",
            borderRight: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface)",
            overflowY: "auto",
          }}
        >
          {leftNav}
        </div>

        {/* Center Preview Canvas */}
        <main
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            overflow: "auto",
            backgroundColor: "var(--color-canvas)",
            minWidth: 0,
          }}
        >
          {centerCanvas}
        </main>

        {/* Right Inspector */}
        <div
          style={{
            width: "340px",
            minWidth: "340px",
            borderLeft: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface)",
            overflowY: "auto",
          }}
        >
          {rightInspector}
        </div>
      </div>
    </div>
  );
};
