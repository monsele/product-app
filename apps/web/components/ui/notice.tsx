"use client";

import React from "react";
import { CheckCircle, Warning, XCircle, Info } from "@phosphor-icons/react";
import { Button } from "./button";

export type NoticeType = "success" | "warning" | "error" | "info";

export interface NoticeProps {
  type: NoticeType;
  title?: string;
  message: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  onClose?: () => void;
  className?: string;
}

export const Notice: React.FC<NoticeProps> = ({
  type,
  title,
  message,
  actionLabel,
  onAction,
  onClose,
  className = "",
}) => {
  const getIcon = () => {
    switch (type) {
      case "success":
        return <CheckCircle size={20} weight="fill" />;
      case "warning":
        return <Warning size={20} weight="fill" />;
      case "error":
        return <XCircle size={20} weight="fill" />;
      case "info":
        return <Info size={20} weight="fill" />;
    }
  };

  const getStyles = (): React.CSSProperties => {
    switch (type) {
      case "success":
        return {
          backgroundColor: "var(--color-success-bg)",
          color: "var(--color-success-fg)",
          borderColor: "var(--color-success-border)",
        };
      case "warning":
        return {
          backgroundColor: "var(--color-warning-bg)",
          color: "var(--color-warning-fg)",
          borderColor: "var(--color-warning-border)",
        };
      case "error":
        return {
          backgroundColor: "var(--color-error-bg)",
          color: "var(--color-error-fg)",
          borderColor: "var(--color-error-border)",
        };
      case "info":
        return {
          backgroundColor: "var(--color-info-bg)",
          color: "var(--color-info-fg)",
          borderColor: "var(--color-info-border)",
        };
    }
  };

  return (
    <div
      role="alert"
      className={`ui-notice ui-notice-${type} ${className}`}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        padding: "14px 16px",
        borderRadius: "var(--radius-control)",
        border: "1px solid transparent",
        width: "100%",
        ...getStyles(),
      }}
    >
      <span style={{ display: "inline-flex", marginTop: "2px" }}>{getIcon()}</span>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
        {title && <span style={{ fontWeight: 600, fontSize: "14px" }}>{title}</span>}
        <div style={{ fontSize: "14px", lineHeight: "20px" }}>{message}</div>
        {actionLabel && onAction && (
          <div style={{ marginTop: "8px" }}>
            <Button
              variant={type === "error" ? "destructive" : "secondary"}
              size="compact"
              onClick={onAction}
            >
              {actionLabel}
            </Button>
          </div>
        )}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss notice"
          style={{
            background: "none",
            border: "none",
            color: "inherit",
            cursor: "pointer",
            padding: "2px",
            opacity: 0.8,
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
};
