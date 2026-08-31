"use client";

import React, { forwardRef } from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "tertiary" | "destructive";
  size?: "compact" | "default" | "large";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "primary",
      size = "default",
      isLoading = false,
      disabled,
      leftIcon,
      rightIcon,
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

    const baseStyles: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
      fontWeight: 500,
      fontFamily: "inherit",
      cursor: disabled || isLoading ? "not-allowed" : "pointer",
      opacity: disabled ? 0.6 : 1,
      whiteSpace: "nowrap",
      transition: "all var(--motion-quick) var(--motion-easing)",
      border: "1px solid transparent",
      borderRadius: isPrimary ? "var(--radius-pill)" : "var(--radius-control)",
      padding: size === "compact" ? "6px 14px" : size === "large" ? "12px 24px" : "8px 18px",
      fontSize: size === "compact" ? "13px" : size === "large" ? "16px" : "14px",
      lineHeight: "20px",
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

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        style={baseStyles}
        className={`ui-button ui-button-${variant} ${className}`}
        {...props}
      >
        {isLoading ? (
          <span
            aria-hidden="true"
            className="ui-spinner"
            style={{
              width: "14px",
              height: "14px",
              border: "2px solid currentColor",
              borderRightColor: "transparent",
              borderRadius: "50%",
            }}
          />
        ) : leftIcon ? (
          <span style={{ display: "inline-flex" }}>{leftIcon}</span>
        ) : null}
        <span>{children}</span>
        {!isLoading && rightIcon ? (
          <span style={{ display: "inline-flex" }}>{rightIcon}</span>
        ) : null}
      </button>
    );
  }
);

Button.displayName = "Button";
