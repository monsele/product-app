"use client";

import React from "react";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  tabs,
  activeTab,
  onChange,
  ariaLabel = "Navigation tabs",
}) => {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: "flex",
        gap: "2px",
        borderBottom: "1px solid var(--color-border)",
        width: "100%",
      }}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            id={`tab-${tab.id}`}
            onClick={() => onChange(tab.id)}
            style={{
              padding: "10px 16px",
              fontSize: "14px",
              fontWeight: isActive ? 600 : 500,
              color: isActive ? "var(--color-brand)" : "var(--color-text-muted)",
              background: "none",
              border: "none",
              borderBottom: isActive ? "2px solid var(--color-brand)" : "2px solid transparent",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              marginBottom: "-1px",
              transition: "color var(--motion-quick) var(--motion-easing)",
            }}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                style={{
                  fontSize: "12px",
                  padding: "2px 6px",
                  borderRadius: "var(--radius-pill)",
                  backgroundColor: isActive
                    ? "var(--color-surface-brand)"
                    : "var(--color-surface-subtle)",
                  color: isActive ? "var(--color-brand)" : "var(--color-text-muted)",
                }}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
