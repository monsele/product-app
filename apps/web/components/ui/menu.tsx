"use client";

import React, { useState, useRef, useEffect } from "react";
import { DotsThreeVertical } from "@phosphor-icons/react";
import { IconButton } from "./icon-button";

export interface MenuItem {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
}

export interface MenuProps {
  items: MenuItem[];
  triggerLabel?: string;
}

export const Menu: React.FC<MenuProps> = ({ items, triggerLabel = "Record actions" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (typeof window !== "undefined") {
      window.document.addEventListener("mousedown", handleClickOutside);
      return () => window.document.removeEventListener("mousedown", handleClickOutside);
    }
  }, []);

  return (
    <div ref={menuRef} style={{ position: "relative", display: "inline-block" }}>
      <IconButton
        aria-label={triggerLabel}
        icon={<DotsThreeVertical weight="bold" />}
        variant="tertiary"
        size="compact"
        onClick={() => setIsOpen(!isOpen)}
      />
      {isOpen && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            marginTop: "4px",
            minWidth: "160px",
            backgroundColor: "var(--color-surface-raised)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-control)",
            boxShadow: "var(--shadow-elevation)",
            zIndex: 500,
            padding: "4px 0",
          }}
        >
          {items.map((item, idx) => (
            <button
              key={idx}
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                item.onClick();
                setIsOpen(false);
              }}
              style={{
                width: "100%",
                padding: "8px 14px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13px",
                fontWeight: 500,
                textAlign: "left",
                background: "none",
                border: "none",
                cursor: item.disabled ? "not-allowed" : "pointer",
                color: item.destructive ? "var(--color-error-fg)" : "var(--color-text)",
                opacity: item.disabled ? 0.5 : 1,
              }}
            >
              {item.icon && <span style={{ display: "inline-flex" }}>{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
