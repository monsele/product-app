"use client";

import React, { forwardRef } from "react";
import { Tooltip } from "./tooltip";
import styles from "./icon-button.module.css";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  "aria-label": string;
  icon: React.ReactNode;
  variant?: "primary" | "secondary" | "tertiary" | "destructive";
  size?: "compact" | "default" | "large";
  tooltip?: string;
  shape?: "circle" | "rounded";
}

const iconSizeClass = {
  compact: "iconCompact",
  default: "iconDefault",
  large: "iconLarge",
} as const;

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
      ...props
    },
    ref
  ) => {
    const buttonElement = (
      <button
        ref={ref}
        aria-label={ariaLabel}
        disabled={disabled}
        className={[
          "ui-icon-button",
          `ui-icon-button-${variant}`,
          styles.button,
          styles[shape],
          styles[size],
          styles[variant],
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...props}
      >
        <span className={`${styles.icon} ${styles[iconSizeClass[size]]}`}>{icon}</span>
      </button>
    );

    if (tooltip || ariaLabel) {
      return <Tooltip content={tooltip || ariaLabel}>{buttonElement}</Tooltip>;
    }

    return buttonElement;
  }
);

IconButton.displayName = "IconButton";
