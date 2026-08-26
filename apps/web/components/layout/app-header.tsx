"use client";

import React from "react";
import { List } from "@phosphor-icons/react";
import { IconButton } from "../ui/icon-button";

export interface AppHeaderProps {
  projectTitle?: string | undefined;
  projectStatus?: React.ReactNode | undefined;
  userEmail?: string | undefined;
  onSignOut?: (() => void) | undefined;
  actions?: React.ReactNode | undefined;
  onToggleMobileMenu?: (() => void) | undefined;
  isMobileMenuOpen?: boolean | undefined;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  projectTitle,
  projectStatus,
  userEmail,
  onSignOut,
  actions,
  onToggleMobileMenu,
  isMobileMenuOpen = false,
}) => {
  return (
    <header
      style={{
        height: "64px",
        maxHeight: "80px",
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
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {onToggleMobileMenu && (
          <IconButton
            aria-label="Open project pipeline menu"
            aria-expanded={isMobileMenuOpen}
            icon={<List weight="bold" />}
            variant="tertiary"
            size="compact"
            onClick={onToggleMobileMenu}
            className="mobile-pipeline-toggle"
          />
        )}
        <span
          style={{
            fontSize: "16px",
            fontWeight: 700,
            letterSpacing: "-0.01em",
            color: "var(--color-text)",
            whiteSpace: "nowrap",
          }}
        >
          AI Visual Learning Platform
        </span>
      </div>

      {projectTitle && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          <span
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--color-text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {projectTitle}
          </span>
          {projectStatus}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        {actions}
        {userEmail && (
          <span
            style={{
              fontSize: "13px",
              color: "var(--color-text-muted)",
              display: "inline-block",
            }}
          >
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
              fontWeight: 600,
            }}
          >
            Sign out
          </button>
        )}
      </div>
    </header>
  );
};
