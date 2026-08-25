"use client";

import React, { useState } from "react";

export interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = "top",
}) => {
  const [isVisible, setIsVisible] = useState(false);

  if (!content) return <>{children}</>;

  const tooltipId = `tooltip-${content.toLowerCase().replace(/[^a-z0-9]/g, "-")}`;

  const positionStyles: Record<string, React.CSSProperties> = {
    top: { bottom: "100%", left: "50%", transform: "translateX(-50%) translateY(-6px)" },
    bottom: { top: "100%", left: "50%", transform: "translateX(-50%) translateY(6px)" },
    left: { right: "100%", top: "50%", transform: "translateY(-50%) translateX(-6px)" },
    right: { left: "100%", top: "50%", transform: "translateY(-50%) translateX(6px)" },
  };

  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
      aria-describedby={isVisible ? tooltipId : undefined}
    >
      {children}
      {isVisible && (
        <div
          id={tooltipId}
          role="tooltip"
          style={{
            position: "absolute",
            zIndex: 1000,
            padding: "4px 8px",
            fontSize: "12px",
            lineHeight: "16px",
            fontWeight: 400,
            color: "var(--color-surface)",
            backgroundColor: "var(--color-text)",
            borderRadius: "var(--radius-control)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            boxShadow: "var(--shadow-elevation)",
            transition: "opacity var(--motion-quick) var(--motion-easing)",
            ...positionStyles[position],
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
};
