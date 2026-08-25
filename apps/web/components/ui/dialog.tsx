"use client";

import React, { useEffect } from "react";
import { IconButton } from "./icon-button";
import { X } from "@phosphor-icons/react";

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = "520px",
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
      aria-labelledby="dialog-title"
      aria-describedby={description ? "dialog-description" : undefined}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        padding: "20px",
        backdropFilter: "blur(2px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth,
          backgroundColor: "var(--color-surface)",
          color: "var(--color-text)",
          borderRadius: "var(--radius-card)",
          border: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-elevation)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <div>
            <h2
              id="dialog-title"
              style={{ margin: 0, fontSize: "18px", fontWeight: 600, color: "var(--color-text)" }}
            >
              {title}
            </h2>
            {description && (
              <p
                id="dialog-description"
                style={{ margin: "4px 0 0", fontSize: "14px", color: "var(--color-text-muted)" }}
              >
                {description}
              </p>
            )}
          </div>
          <IconButton
            aria-label="Close dialog"
            icon={<X weight="bold" />}
            variant="tertiary"
            size="compact"
            onClick={onClose}
          />
        </div>

        {children && (
          <div style={{ padding: "20px 24px", overflowY: "auto", flex: 1 }}>{children}</div>
        )}

        {footer && (
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid var(--color-border)",
              backgroundColor: "var(--color-surface-subtle)",
              display: "flex",
              justifyContent: "flex-end",
              gap: "12px",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
