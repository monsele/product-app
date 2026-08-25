"use client";

import React, { useEffect } from "react";
import { IconButton } from "./icon-button";
import { X } from "@phosphor-icons/react";

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  position?: "right" | "left";
  width?: string;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  children,
  position = "right",
  width = "360px",
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 999,
        display: "flex",
        justifyContent: position === "right" ? "flex-end" : "flex-start",
        backgroundColor: "rgba(0, 0, 0, 0.4)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: width,
          height: "100%",
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text)",
          borderLeft: position === "right" ? "1px solid var(--color-border)" : "none",
          borderRight: position === "left" ? "1px solid var(--color-border)" : "none",
          boxShadow: "var(--shadow-elevation)",
          display: "flex",
          flexDirection: "column",
          transition: "transform var(--motion-standard) var(--motion-easing)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <h3
            id="drawer-title"
            style={{ margin: 0, fontSize: "16px", fontWeight: 600, color: "var(--color-text)" }}
          >
            {title}
          </h3>
          <IconButton
            aria-label="Close drawer"
            icon={<X weight="bold" />}
            variant="tertiary"
            size="compact"
            onClick={onClose}
          />
        </div>
        <div style={{ padding: "20px", overflowY: "auto", flex: 1 }}>{children}</div>
      </div>
    </div>
  );
};
