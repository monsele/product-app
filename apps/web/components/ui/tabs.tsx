"use client";

import React, { useRef } from "react";
import styles from "./tabs.module.css";

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
  const listRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={listRef}
      className={styles.list}
      role="tablist"
      aria-label={ariaLabel}
      style={{
        display: "flex",
        gap: "4px",
        borderBottom: "1px solid var(--color-border-soft)",
        width: "100%",
      }}
    >
      {tabs.map((tab, index) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            className={styles.tab}
            tabIndex={isActive ? 0 : -1}
            onKeyDown={(event) => {
              let next: number;
              if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
              else if (event.key === "ArrowLeft")
                next = (index - 1 + tabs.length) % tabs.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = tabs.length - 1;
              else return;
              event.preventDefault();
              const nextTab = tabs[next];
              if (nextTab) {
                onChange(nextTab.id);
                const buttons =
                  listRef.current?.querySelectorAll<HTMLButtonElement>(
                    '[role="tab"]',
                  );
                buttons?.[next]?.focus();
              }
            }}
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.id}`}
            id={`tab-${tab.id}`}
            onClick={() => onChange(tab.id)}
            style={{
              padding: "10px 16px",
              fontSize: "14px",
              fontWeight: isActive ? 600 : 500,
              color: isActive
                ? "var(--color-brand)"
                : "var(--color-text-muted)",
              background: "none",
              border: "none",
              borderBottom: isActive
                ? "2px solid var(--color-brand)"
                : "2px solid transparent",
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
                  color: isActive
                    ? "var(--color-brand)"
                    : "var(--color-text-muted)",
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
