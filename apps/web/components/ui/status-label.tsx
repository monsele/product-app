"use client";

import React from "react";
import {
  CheckCircle,
  Warning,
  XCircle,
  Info,
  SpinnerGap,
  Lock,
} from "@phosphor-icons/react";

export type StatusType =
  | "success"
  | "warning"
  | "error"
  | "info"
  | "in_progress"
  | "blocked";

export interface StatusLabelProps {
  status: StatusType;
  label?: string;
  size?: "compact" | "default";
}

export const StatusLabel: React.FC<StatusLabelProps> = ({
  status,
  label,
  size = "default",
}) => {
  const getIcon = () => {
    switch (status) {
      case "success":
        return <CheckCircle weight="fill" />;
      case "warning":
        return <Warning weight="fill" />;
      case "error":
        return <XCircle weight="fill" />;
      case "info":
        return <Info weight="fill" />;
      case "in_progress":
        return (
          <SpinnerGap
            weight="bold"
            style={{ animation: "spin 1s linear infinite" }}
          />
        );
      case "blocked":
        return <Lock weight="bold" />;
    }
  };

  const getDefaultLabel = () => {
    switch (status) {
      case "success":
        return "Complete";
      case "warning":
        return "Warning";
      case "error":
        return "Failed";
      case "info":
        return "Information";
      case "in_progress":
        return "In Progress";
      case "blocked":
        return "Blocked";
    }
  };

  const getStyles = (): React.CSSProperties => {
    switch (status) {
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
      case "in_progress":
      case "blocked":
        return {
          backgroundColor: "var(--color-info-bg)",
          color: "var(--color-info-fg)",
          borderColor: "var(--color-info-border)",
        };
    }
  };

  const displayLabel = label || getDefaultLabel();

  return (
    <span
      className={`ui-status-label ui-status-${status}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: size === "compact" ? "2px 8px" : "4px 10px",
        borderRadius: "var(--radius-pill)",
        fontSize: size === "compact" ? "12px" : "13px",
        fontWeight: 500,
        lineHeight: "16px",
        border: "1px solid transparent",
        ...getStyles(),
      }}
    >
      <span style={{ display: "inline-flex", fontSize: size === "compact" ? "14px" : "16px" }}>
        {getIcon()}
      </span>
      <span>{displayLabel}</span>
    </span>
  );
};
