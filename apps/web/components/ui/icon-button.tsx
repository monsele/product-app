"use client";

import React, { forwardRef } from "react";
import { Tooltip } from "./tooltip";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  "aria-label": string;
  icon: React.ReactNode;
  variant?: "primary" | "secondary" | "tertiary" | "destructive";
  size?: "compact" | "default" | "large";
  tooltip?: string;
  shape?: "circle" | "rounded";
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      "aria-label": ariaLabel,
      icon,
      variant = "tertiary",
      size = "default",
      tooltip,
      shape = "circle",
      disabled,
      className = "",
      style,
      ...props
    },
    ref
  ) => {
    const isPrimary = variant === "primary";
    const isSecondary = variant === "secondary";
    const isTertiary = variant === "tertiary";
    const isDestructive = variant === "destructive";

    const dimensions = size === "compact" ? "36px" : size === "large" ? "48px" : "40px";

    const baseStyles: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: dimensions,
      height: dimensions,
      minWidth: dimensions,
      minHeight: dimensions,
      padding: 0,
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.6 : 1,
      transition: "all var(--motion-quick) var(--motion-easing)",
      border: "1px solid transparent",
      borderRadius: shape === "circle" ? "var(--radius-circle)" : "var(--radius-control)",
      ...(isPrimary && {
        backgroundColor: "var(--color-brand)",
        color: "var(--color-on-brand)",
        borderColor: "var(--color-brand)",
      }),
      ...(isSecondary && {
        backgroundColor: "var(--color-surface)",
        color: "var(--color-text)",
        borderColor: "var(--color-border)",
      }),
      ...(isTertiary && {
        backgroundColor: "transparent",
        color: "var(--color-text-muted)",
        borderColor: "transparent",
      }),
      ...(isDestructive && {
        backgroundColor: "var(--color-error-bg)",
        color: "var(--color-error-fg)",
        borderColor: "var(--color-error-border)",
      }),
      ...style,
    };

    const buttonElement = (
      <button
        ref={ref}
        aria-label={ariaLabel}
        disabled={disabled}
        style={baseStyles}
        className={`ui-icon-button ui-icon-button-${variant} ${className}`}
        {...props}
      >
        <span style={{ display: "inline-flex", fontSize: size === "compact" ? "16px" : size === "large" ? "24px" : "20px" }}>
          {icon}
        </span>
      </button>
    );

    if (tooltip || ariaLabel) {
      return <Tooltip content={tooltip || ariaLabel}>{buttonElement}</Tooltip>;
    }

    return buttonElement;
  }
);

IconButton.displayName = "IconButton";
