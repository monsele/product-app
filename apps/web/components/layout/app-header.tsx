"use client";

import React from "react";

export interface AppHeaderProps {
  projectTitle?: string;
  projectStatus?: React.ReactNode;
  userEmail?: string;
  onSignOut?: () => void;
  actions?: React.ReactNode;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  projectTitle,
  projectStatus,
  userEmail,
  onSignOut,
  actions,
}) => {
  return (
    <header
      style={{
        height: "64px",
        backgroundColor: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <span
          style={{
            fontSize: "16px",
            fontWeight: 700,
            letterSpacing: "-0.01em",
            color: "var(--color-text)",
          }}
        >
          AI Visual Learning Platform
        </span>
      </div>

      {projectTitle && (
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text)" }}>
            {projectTitle}
          </span>
          {projectStatus}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        {actions}
        {userEmail && (
          <span style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>
            {userEmail}
          </span>
        )}
        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-text-muted)",
              fontSize: "13px",
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            Sign out
          </button>
        )}
      </div>
    </header>
  );
};
