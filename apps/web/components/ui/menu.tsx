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

export const Menu: React.FC<MenuProps> = ({
  items,
  triggerLabel = "Record actions",
}) => {
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
      return () =>
        window.document.removeEventListener("mousedown", handleClickOutside);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const menu = menuRef.current;
    const trigger = menu?.querySelector<HTMLButtonElement>(
      '[aria-haspopup="menu"]',
    );
    const items = () =>
      Array.from(
        menu?.querySelectorAll<HTMLButtonElement>(
          '[role="menuitem"]:not(:disabled)',
        ) ?? [],
      );
    items()[0]?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        trigger?.focus();
      }
      if (event.key === "Tab") {
        setIsOpen(false);
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const enabled = items();
      const current = enabled.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? enabled.length - 1
            : (current +
                (event.key === "ArrowDown" ? 1 : -1) +
                enabled.length) %
              enabled.length;
      enabled[next]?.focus();
    };
    menu?.addEventListener("keydown", handleKey);
    return () => menu?.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  return (
    <div
      ref={menuRef}
      style={{ position: "relative", display: "inline-block" }}
    >
      <IconButton
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        icon={<DotsThreeVertical weight="bold" />}
        variant="tertiary"
        size="compact"
        onClick={() => setIsOpen(!isOpen)}
      />
      {isOpen && (
        <div
          role="menu"
          className="ui-menu"
          aria-label={triggerLabel}
          style={{
            position: "absolute",
            right: 0,
            top: "100%",
            marginTop: "8px",
            minWidth: "160px",
            backgroundColor: "var(--color-surface-raised)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-control)",
            boxShadow: "var(--shadow-elevation)",
            zIndex: 500,
            padding: "6px",
          }}
        >
          {items.map((item, idx) => (
            <button
              key={idx}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              onClick={() => {
                setIsOpen(false);
                menuRef.current
                  ?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')
                  ?.focus();
                item.onClick();
              }}
              style={{
                width: "100%",
                padding: "10px 12px",
                minHeight: "36px",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "13px",
                fontWeight: 500,
                textAlign: "left",
                background: "none",
                border: "none",
                cursor: item.disabled ? "not-allowed" : "pointer",
                color: item.destructive
                  ? "var(--color-danger-text)"
                  : "var(--color-text)",
                opacity: item.disabled ? 0.5 : 1,
              }}
            >
              {item.icon && (
                <span style={{ display: "inline-flex" }}>{item.icon}</span>
              )}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
